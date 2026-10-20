import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveFetchTimeoutMs, withRetries, withTimeout } from "../benchmarks/retry.js";

const noSleep = async () => {};

test("withRetries returns the first success and retries transient failures", async () => {
  let calls = 0;
  const result = await withRetries("owner/repo", async () => {
    calls += 1;
    if (calls < 3) throw new Error("curl 18 Transferred a partial file");
    return "ok";
  }, { sleep: noSleep });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetries is bounded and names the repository when every attempt fails", async () => {
  let calls = 0;
  await assert.rejects(
    withRetries("owner/repo", async () => {
      calls += 1;
      throw new Error("boom");
    }, { attempts: 4, sleep: noSleep }),
    /owner\/repo: failed after 4 attempts: boom/,
  );
  assert.equal(calls, 4);
});

test("withRetries waits longer after each failure", async () => {
  const delays: number[] = [];
  await assert.rejects(withRetries("owner/repo", async () => { throw new Error("x"); }, {
    attempts: 3,
    delayMs: 10,
    sleep: async (ms) => { delays.push(ms); },
  }));
  assert.deepEqual(delays, [10, 20]);
});

test("resolveFetchTimeoutMs reads the environment and rejects bad values", () => {
  assert.equal(resolveFetchTimeoutMs({}), 120_000);
  assert.equal(resolveFetchTimeoutMs({ EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS: "5" }), 5000);
  assert.throws(() => resolveFetchTimeoutMs({ EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS: "0" }), /positive number/);
  assert.throws(() => resolveFetchTimeoutMs({ EVERGREEN_CORPUS_FETCH_TIMEOUT_SECONDS: "soon" }), /positive number/);
});

test("withTimeout aborts a stalled operation and lets a fast one through", async () => {
  let aborted = false;
  await assert.rejects(
    withTimeout(20, (signal) => new Promise<never>((_, reject) => signal.addEventListener("abort", () => {
      aborted = true;
      reject(new Error("aborted"));
    }))),
    /timed out after 0.02 s|aborted/,
  );
  assert.equal(aborted, true);
  assert.equal(await withTimeout(1000, async () => "ok"), "ok");
});

test("a stalled fetch is retried and then reported by repository name", async () => {
  let calls = 0;
  await assert.rejects(
    withRetries("owner/stalled", () => withTimeout(10, () => {
      calls += 1;
      return new Promise<never>(() => {});
    }), { attempts: 3, sleep: noSleep }),
    /owner\/stalled: failed after 3 attempts: timed out after 0\.01 s/,
  );
  assert.equal(calls, 3);
});
