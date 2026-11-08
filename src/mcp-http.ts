/**
 * Request protections for the hosted MCP lookup: a per-client rate limit, a request body cap, and a handler
 * deadline. The guard wraps a fetch-shaped MCP handler, so the transport stays separate from the policy.
 */

/** Stable MCP/JSON-RPC error codes for requests the lookup guard rejects. */
export const LOOKUP_ERROR_CODES = {
  requestTooLarge: -32001,
  rateLimited: -32002,
  timedOut: -32003,
  internal: -32603,
} as const;

export type LookupRejectionReason = "request_too_large" | "rate_limited" | "timed_out" | "internal_error";

export interface LookupLimits {
  /** Sustained requests per minute allowed for one client. */
  requestsPerMinute: number;
  /** Requests one client may spend at once. */
  burst: number;
  /** Largest accepted request body, in bytes. */
  maxBodyBytes: number;
  /** Longest time, in milliseconds, one request may spend in the wrapped handler. */
  timeoutMs: number;
  /** Most clients tracked at once; the least recently seen bucket is dropped beyond this. */
  maxClients: number;
}

export const DEFAULT_LOOKUP_LIMITS = {
  requestsPerMinute: 60,
  burst: 10,
  maxBodyBytes: 64 * 1024,
  timeoutMs: 10_000,
  maxClients: 10_000,
} as const satisfies LookupLimits;

export interface LookupGuardOptions extends Partial<LookupLimits> {
  /** Clock for the rate-limit buckets. Defaults to `Date.now`. */
  now?: () => number;
}

export type LookupFetchHandler = (request: Request) => Promise<Response>;

export interface LookupGuard {
  /** Checks the limits for `clientKey`, then serves the request through the wrapped handler. */
  handle: (request: Request, clientKey?: string) => Promise<Response>;
  /** The number of clients currently tracked, for observability and tests. */
  clientCount: () => number;
}

type RequestId = string | number | null;

interface Bucket {
  tokens: number;
  updatedAt: number;
  lastSeen: number;
}

const REJECTIONS = {
  request_too_large: { status: 413, code: LOOKUP_ERROR_CODES.requestTooLarge },
  rate_limited: { status: 429, code: LOOKUP_ERROR_CODES.rateLimited },
  timed_out: { status: 504, code: LOOKUP_ERROR_CODES.timedOut },
  internal_error: { status: 500, code: LOOKUP_ERROR_CODES.internal },
} as const;

const IDLE_BUCKET_MS = 60_000;

function resolveLimits(options: LookupGuardOptions): LookupLimits {
  const { now: _now, ...overrides } = options;
  const limits: LookupLimits = { ...DEFAULT_LOOKUP_LIMITS, ...overrides };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number`);
  }
  return limits;
}

function pruneBuckets(buckets: Map<string, Bucket>, maxClients: number, now: number): void {
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastSeen >= IDLE_BUCKET_MS) buckets.delete(key);
  }
  while (buckets.size >= maxClients) {
    let oldestKey: string | undefined;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [key, bucket] of buckets) {
      if (bucket.lastSeen < oldestSeen) {
        oldestSeen = bucket.lastSeen;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) return;
    buckets.delete(oldestKey);
  }
}

function consumeToken(
  buckets: Map<string, Bucket>,
  limits: LookupLimits,
  clientKey: string,
  now: number,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  let bucket = buckets.get(clientKey);
  if (!bucket) {
    if (buckets.size >= limits.maxClients) pruneBuckets(buckets, limits.maxClients, now);
    bucket = { tokens: limits.burst, updatedAt: now, lastSeen: now };
    buckets.set(clientKey, bucket);
  }

  const refillPerMs = limits.requestsPerMinute / 60_000;
  bucket.tokens = Math.min(limits.burst, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
  bucket.updatedAt = now;
  bucket.lastSeen = now;

  if (bucket.tokens < 1) {
    return { allowed: false, retryAfterMs: Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerMs)) };
  }
  bucket.tokens -= 1;
  return { allowed: true };
}

async function readBoundedBody(
  request: Request,
  maxBodyBytes: number,
): Promise<Uint8Array<ArrayBuffer> | "too_large" | undefined> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBodyBytes) return "too_large";
  }
  if (!request.body) return undefined;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBodyBytes) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function withBody(request: Request, body: Uint8Array<ArrayBuffer> | undefined, signal: AbortSignal): Request {
  const init: RequestInit = { method: request.method, headers: request.headers, signal };
  if (body === undefined) return new Request(request.url, init);
  return new Request(request.url, { ...init, body });
}

function requestId(body: Uint8Array<ArrayBuffer> | undefined): RequestId {
  if (body === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const id = (parsed as { id?: unknown }).id;
    return typeof id === "string" || typeof id === "number" || id === null ? id : null;
  } catch {
    return null;
  }
}

function rejection(
  reason: LookupRejectionReason,
  message: string,
  id: RequestId,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  const { status, code } = REJECTIONS[reason];
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message, data: { reason, ...data } } }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

class LookupTimeoutError extends Error {}

/** Serves the request through the handler, aborting it when the deadline passes or the caller goes away. */
async function runWithDeadline(
  handler: LookupFetchHandler,
  request: Request,
  body: Uint8Array<ArrayBuffer> | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(request.signal.reason);
  if (request.signal.aborted) abort();
  else request.signal.addEventListener("abort", abort, { once: true });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, rejectDeadline) => {
    timer = setTimeout(() => {
      controller.abort();
      rejectDeadline(new LookupTimeoutError());
    }, timeoutMs);
  });
  const pending = Promise.resolve().then(() => handler(withBody(request, body, controller.signal)));
  pending.catch(() => undefined);

  try {
    return await Promise.race([pending, deadline]);
  } catch (error) {
    if (error instanceof LookupTimeoutError) {
      return rejection("timed_out", `Request timed out after ${timeoutMs} ms.`, requestId(body));
    }
    controller.abort();
    return rejection("internal_error", "Evergreen could not handle the request.", requestId(body));
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    request.signal.removeEventListener("abort", abort);
  }
}

/** Wraps a fetch-shaped MCP handler with the lookup's request limits. */
export function createLookupGuard(handler: LookupFetchHandler, options: LookupGuardOptions = {}): LookupGuard {
  const { now = Date.now } = options;
  const limits = resolveLimits(options);
  const buckets = new Map<string, Bucket>();

  return {
    async handle(request, clientKey = "anonymous") {
      const decision = consumeToken(buckets, limits, clientKey, now());
      if (!decision.allowed) {
        const retryAfter = Math.max(1, Math.ceil(decision.retryAfterMs / 1000));
        return rejection(
          "rate_limited",
          `Rate limit exceeded; retry after ${retryAfter}s.`,
          null,
          { retryAfterMs: decision.retryAfterMs },
          { "retry-after": String(retryAfter) },
        );
      }

      const body = await readBoundedBody(request, limits.maxBodyBytes);
      if (body === "too_large") {
        return rejection("request_too_large", `Request body exceeds the ${limits.maxBodyBytes}-byte limit.`, null);
      }

      return runWithDeadline(handler, request, body, limits.timeoutMs);
    },
    clientCount: () => buckets.size,
  };
}
