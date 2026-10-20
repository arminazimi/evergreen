import assert from "node:assert/strict";
import { test } from "node:test";

import { withRetries } from "../benchmarks/retry.js";

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
