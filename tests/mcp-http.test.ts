import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLookupGuard,
  DEFAULT_LOOKUP_LIMITS,
  LOOKUP_ERROR_CODES,
  type LookupFetchHandler,
} from "../src/mcp-http.js";

const URL = "http://lookup.test/mcp";

interface RpcErrorBody {
  jsonrpc: string;
  id: string | number | null;
  error: { code: number; message: string; data: { reason: string; retryAfterMs?: number } };
}

function jsonRequest(id: number | string): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { purl: "pkg:npm/request" } }),
  });
}

async function ok(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
}

async function errorBody(response: Response): Promise<RpcErrorBody> {
  return (await response.json()) as RpcErrorBody;
}

function streamRequest(stream: ReadableStream<Uint8Array>): Request {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit;
  return new Request(URL, init);
}

test("stable lookup error codes do not move", () => {
  assert.deepEqual(LOOKUP_ERROR_CODES, {
    requestTooLarge: -32001,
    rateLimited: -32002,
    timedOut: -32003,
    internal: -32603,
  });
});

test("passes requests under the limits to the handler", async () => {
  let seen = "";
  const guard = createLookupGuard(async (request) => {
    seen = await request.text();
    return ok();
  });

  const response = await guard.handle(jsonRequest(1), "192.0.2.1");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(seen, /pkg:npm\/request/);
  assert.equal(guard.clientCount(), 1);
});

test("passes a request without a body and keeps an already-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();
  const guard = createLookupGuard(async (request) => new Response(`${request.method}:${request.signal.aborted}`));

  const response = await guard.handle(new Request(URL, { signal: controller.signal }), "192.0.2.2");

  assert.equal(await response.text(), "GET:true");
});

test("limits each client separately", async () => {
  let clock = 0;
  const guard = createLookupGuard(ok, { requestsPerMinute: 2, burst: 2, now: () => clock });

  assert.equal((await guard.handle(jsonRequest(1), "198.51.100.1")).status, 200);
  assert.equal((await guard.handle(jsonRequest(2), "198.51.100.1")).status, 200);
  const limited = await guard.handle(jsonRequest(3), "198.51.100.1");
  assert.equal(limited.status, 429);
  assert.equal((await guard.handle(jsonRequest(4), "198.51.100.2")).status, 200);

  const body = await errorBody(limited);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, null);
  assert.equal(body.error.code, LOOKUP_ERROR_CODES.rateLimited);
  assert.match(body.error.message, /Rate limit exceeded/);
  assert.equal(body.error.data.reason, "rate_limited");
  assert.ok((body.error.data.retryAfterMs ?? 0) > 0);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
});

test("refills the client bucket over time", async () => {
  let clock = 0;
  const guard = createLookupGuard(ok, { requestsPerMinute: 60, burst: 1, now: () => clock });

  assert.equal((await guard.handle(jsonRequest(1), "client")).status, 200);
  assert.equal((await guard.handle(jsonRequest(2), "client")).status, 429);
  clock = 1_000;
  assert.equal((await guard.handle(jsonRequest(3), "client")).status, 200);
  assert.equal((await guard.handle(jsonRequest(4), "client")).status, 429);
});

test("rejects a declared body over the size limit before reading it", async () => {
  let called = false;
  const guard = createLookupGuard(
    async () => {
      called = true;
      return ok();
    },
    { maxBodyBytes: 16 },
  );

  const request = new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "64" },
    body: "x".repeat(64),
  });
  const response = await guard.handle(request, "client");

  assert.equal(response.status, 413);
  assert.equal(called, false);
  const body = await errorBody(response);
  assert.equal(body.error.code, LOOKUP_ERROR_CODES.requestTooLarge);
  assert.equal(body.error.data.reason, "request_too_large");
});

test("rejects a streamed body over the size limit", async () => {
  let called = false;
  const guard = createLookupGuard(
    async () => {
      called = true;
      return ok();
    },
    { maxBodyBytes: 16 },
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("0123456789"));
      controller.enqueue(new TextEncoder().encode("0123456789"));
      controller.close();
    },
  });
  const request = streamRequest(stream);

  const response = await guard.handle(request, "client");

  assert.equal(response.status, 413);
  assert.equal(called, false);
  assert.equal((await errorBody(response)).error.code, LOOKUP_ERROR_CODES.requestTooLarge);
});

test("accepts a streamed body at exactly the size limit", async () => {
  const guard = createLookupGuard(async (request) => new Response(await request.text()), { maxBodyBytes: 16 });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("0123456789"));
      controller.enqueue(new TextEncoder().encode("012345"));
      controller.close();
    },
  });
  const request = streamRequest(stream);

  const response = await guard.handle(request, "client");

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "0123456789012345");
});

test("times out a handler that does not answer", async () => {
  let aborted = false;
  const handler: LookupFetchHandler = (request) =>
    new Promise<Response>(() => {
      request.signal.addEventListener("abort", () => {
        aborted = true;
      });
    });
  const guard = createLookupGuard(handler, { timeoutMs: 10 });

  const response = await guard.handle(jsonRequest(7), "client");

  assert.equal(response.status, 504);
  const body = await errorBody(response);
  assert.equal(body.id, 7);
  assert.equal(body.error.code, LOOKUP_ERROR_CODES.timedOut);
  assert.equal(body.error.data.reason, "timed_out");
  assert.equal(aborted, true);
});

test("returns an internal MCP error when the handler fails", async () => {
  const guard = createLookupGuard(async () => {
    throw new Error("boom");
  });

  const response = await guard.handle(jsonRequest(8), "client");

  assert.equal(response.status, 500);
  const body = await errorBody(response);
  assert.equal(body.id, 8);
  assert.equal(body.error.code, LOOKUP_ERROR_CODES.internal);
  assert.equal(body.error.data.reason, "internal_error");
});

test("returns an internal MCP error with a null id when the body is not JSON", async () => {
  const guard = createLookupGuard(async () => {
    throw new Error("boom");
  });
  const request = new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  const body = await errorBody(await guard.handle(request, "client"));

  assert.equal(body.id, null);
  assert.equal(body.error.code, LOOKUP_ERROR_CODES.internal);
});

test("drops idle and least recently seen clients at the cap", async () => {
  let clock = 0;
  const guard = createLookupGuard(ok, { maxClients: 2, now: () => clock });

  await guard.handle(jsonRequest(1), "a");
  await guard.handle(jsonRequest(2), "b");
  await guard.handle(jsonRequest(3), "c");
  assert.equal(guard.clientCount(), 2);

  clock = 61_000;
  await guard.handle(jsonRequest(4), "d");
  assert.equal(guard.clientCount(), 1);
});

test("rejects non-positive and non-finite limits", () => {
  assert.throws(() => createLookupGuard(ok, { requestsPerMinute: 0 }), RangeError);
  assert.throws(() => createLookupGuard(ok, { burst: Number.NaN }), RangeError);
  assert.throws(() => createLookupGuard(ok, { maxBodyBytes: -1 }), RangeError);
  assert.throws(() => createLookupGuard(ok, { timeoutMs: Number.POSITIVE_INFINITY }), RangeError);
  assert.throws(() => createLookupGuard(ok, { maxClients: 0 }), RangeError);
  assert.equal(DEFAULT_LOOKUP_LIMITS.requestsPerMinute, 60);
  assert.equal(DEFAULT_LOOKUP_LIMITS.maxBodyBytes, 64 * 1024);
});
