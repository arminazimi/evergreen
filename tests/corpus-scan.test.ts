import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import {
  CorpusScanError,
  DEFAULT_MEMORY_LIMIT_MB,
  DEFAULT_SCAN_TIMEOUT_SECONDS,
  describeChildExit,
  describeScanFailure,
  resolveMemoryLimit,
  resolveScanTimeout,
  scanWithinMemoryLimit,
} from "../benchmarks/corpus-scan.js";

async function workerEntry(source: string): Promise<{ url: URL; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-scan-worker-"));
  const file = join(directory, "worker.mjs");
  await writeFile(file, source);
  return { url: pathToFileURL(file), directory };
}

test("the per-repository memory limit prefers --memory-limit, then the env, then the default", () => {
  assert.equal(resolveMemoryLimit(["node", "script"], {}), DEFAULT_MEMORY_LIMIT_MB);
  assert.equal(resolveMemoryLimit(["node", "script"], { EVERGREEN_CORPUS_MEMORY_MB: "512" }), 512);
  assert.equal(resolveMemoryLimit(["--memory-limit", "256"], { EVERGREEN_CORPUS_MEMORY_MB: "512" }), 256);
  assert.throws(() => resolveMemoryLimit(["--memory-limit", "8"], {}), /at least 64/);
  assert.throws(() => resolveMemoryLimit(["--memory-limit", "nope"], {}), /Invalid per-repository memory limit/);
  assert.throws(() => resolveMemoryLimit(["--memory-limit"], {}), /needs a value/);
});

test("the scan timeout comes from the env and has a default", () => {
  assert.equal(resolveScanTimeout({}), DEFAULT_SCAN_TIMEOUT_SECONDS);
  assert.equal(resolveScanTimeout({ EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS: "60" }), 60);
  assert.throws(() => resolveScanTimeout({ EVERGREEN_CORPUS_SCAN_TIMEOUT_SECONDS: "0" }), /at least 1/);
});

test("a worker out-of-memory error names the limit; any other failure keeps its reason", () => {
  const memory = describeScanFailure(
    Object.assign(new Error("Worker terminated due to reaching memory limit: JS heap out of memory"), {
      code: "ERR_WORKER_OUT_OF_MEMORY",
    }),
    512,
  );
  assert.ok(memory instanceof CorpusScanError);
  assert.equal(memory.kind, "memory");
  assert.match(memory.message, /exceeded the 512 MB per-repository memory limit/);
  const crash = describeScanFailure(new Error("parse exploded"), 512);
  assert.equal(crash.kind, "crash");
  assert.match(crash.message, /scan failed: parse exploded/);
  // The scan's own guard (src/usage/memory-guard.ts) is a memory failure too.
  const guarded = describeScanFailure(new Error("Scan stopped: the heap reached 900 MB of its 1024 MB limit."), 1024);
  assert.equal(guarded.kind, "memory");
  assert.match(guarded.message, /exceeded the 1024 MB per-repository memory limit/);
});

test("a child exit is classified as memory only for an abort, and as a crash otherwise", () => {
  assert.equal(describeChildExit(null, "SIGABRT", "", 512).kind, "memory");
  assert.equal(describeChildExit(134, null, "", 512).kind, "memory");
  assert.equal(describeChildExit(1, null, "FATAL ERROR: JavaScript heap out of memory", 512).kind, "memory");
  const crash = describeChildExit(2, null, "boom\n", 512);
  assert.equal(crash.kind, "crash");
  assert.match(crash.message, /exited with code 2 before reporting a result: boom/);
});

test("a scan that returns findings resolves with them", async () => {
  const worker = await workerEntry(`
    process.send({ findings: [{ ruleId: "npm.example", location: { path: "package.json", line: 3 } }] }, () => process.exit(0));
  `);
  try {
    assert.deepEqual(await scanWithinMemoryLimit("/tmp/repo", { memoryMb: 128, scriptUrl: worker.url }), [
      { ruleId: "npm.example", location: { path: "package.json", line: 3 } },
    ]);
  } finally {
    await rm(worker.directory, { recursive: true, force: true });
  }
});

test("a scan that throws is reported with its message, not as an unhandled crash", async () => {
  const worker = await workerEntry(`
    process.send({ error: "detector exploded" }, () => process.exit(1));
  `);
  try {
    await assert.rejects(scanWithinMemoryLimit("/tmp/repo", { memoryMb: 128, scriptUrl: worker.url }), {
      name: "CorpusScanError",
      message: /scan failed: detector exploded/,
    });
  } finally {
    await rm(worker.directory, { recursive: true, force: true });
  }
});

test("a child that exits without reporting is a crash, never a silent pass", async () => {
  const worker = await workerEntry(`
    process.exit(3);
  `);
  try {
    await assert.rejects(
      scanWithinMemoryLimit("/tmp/repo", { memoryMb: 128, scriptUrl: worker.url }),
      (error: unknown) =>
        error instanceof CorpusScanError && error.kind === "crash" && /exited with code 3/.test(error.message),
    );
  } finally {
    await rm(worker.directory, { recursive: true, force: true });
  }
});

test("a scan that stops on its heap guard is reported as a memory failure", async () => {
  // The guard in src/usage/memory-guard.ts sends its message over IPC; a real V8 abort cannot be
  // tested this way (it would have to allocate past the process limit), so describeChildExit covers
  // the abort itself.
  const worker = await workerEntry(`
    process.send(
      { error: "Scan stopped: the heap reached 900 MB of its 1024 MB limit." },
      () => process.exit(1),
    );
  `);
  try {
    await assert.rejects(
      scanWithinMemoryLimit("/tmp/repo", { memoryMb: 1024, scriptUrl: worker.url }),
      (error: unknown) => error instanceof CorpusScanError && error.kind === "memory",
    );
  } finally {
    await rm(worker.directory, { recursive: true, force: true });
  }
});

test("a child that never answers fails on its timeout", async () => {
  const worker = await workerEntry(`
    setInterval(() => {}, 1000);
  `);
  try {
    await assert.rejects(
      scanWithinMemoryLimit("/tmp/repo", { memoryMb: 128, timeoutSeconds: 0.2, scriptUrl: worker.url }),
      (error: unknown) => error instanceof CorpusScanError && error.kind === "timeout",
    );
  } finally {
    await rm(worker.directory, { recursive: true, force: true });
  }
});
