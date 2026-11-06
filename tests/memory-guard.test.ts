import assert from "node:assert/strict";
import { test } from "node:test";

import { openMemoryGuard, ScanMemoryError } from "../src/usage/memory-guard.js";

test("the guard stays quiet while the heap has room", () => {
  const check = openMemoryGuard(() => ({ used_heap_size: 100 * 1024 * 1024, heap_size_limit: 1000 * 1024 * 1024 }));
  for (let index = 0; index < 500; index += 1) check();
});

test("the guard keeps a reserve below a small heap limit", () => {
  const check = openMemoryGuard(() => ({ used_heap_size: 95 * 1024 * 1024, heap_size_limit: 144 * 1024 * 1024 }));
  assert.throws(() => {
    for (let index = 0; index < 500; index += 1) check();
  }, ScanMemoryError);
});

test("the guard stops with a clear error when the heap is nearly full", () => {
  const check = openMemoryGuard(() => ({ used_heap_size: 950 * 1024 * 1024, heap_size_limit: 1000 * 1024 * 1024 }));
  assert.throws(
    () => {
      for (let index = 0; index < 500; index += 1) check();
    },
    (error: unknown) => error instanceof ScanMemoryError && /heap reached 950 MB of its 1000 MB/.test(error.message),
  );
});
