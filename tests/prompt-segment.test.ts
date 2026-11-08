import assert from "node:assert/strict";
import childProcess from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, mock, test } from "node:test";

import { detectorManifestFile, scanManifestFile } from "../src/cache-paths.js";
import { parsePromptArguments, PROMPT_MAX_AGE_MS, renderPromptSegment } from "../src/prompt-segment.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Fixture {
  readonly repo: string;
  readonly cache: string;
}

/** A git-looking repository with one input file, plus an empty scan cache directory. */
async function fixture(): Promise<Fixture> {
  const base = await mkdtemp(join(tmpdir(), "evergreen-prompt-"));
  roots.push(base);
  const repo = join(base, "repo");
  await mkdir(join(repo, ".git"), { recursive: true });
  await writeFile(join(repo, "package.json"), "{}");
  const past = new Date(Date.now() - 60_000);
  await utimes(join(repo, "package.json"), past, past);
  return { repo, cache: join(base, "cache") };
}

/** Writes the manifests a scan leaves behind: one finding per severity given. */
async function writeCache(
  { repo, cache }: Fixture,
  severities: readonly string[],
  scannedAt: Date = new Date(),
): Promise<void> {
  const scan = scanManifestFile(cache, repo);
  await mkdir(join(scan, ".."), { recursive: true });
  await writeFile(scan, JSON.stringify({ root: repo, scannedAt: scannedAt.toISOString(), detectorSignatures: {} }));
  const manifest = detectorManifestFile(cache, repo, "npm");
  await mkdir(join(manifest, ".."), { recursive: true });
  await writeFile(
    manifest,
    JSON.stringify({
      detectorId: "npm",
      files: [{ path: "package.json", hash: "x" }],
      findings: severities.map((severity, index) => ({ id: `f${index}`, severity })),
      unclassified: [],
    }),
  );
}

const render = (f: Fixture, extra: Record<string, unknown> = {}): string =>
  renderPromptSegment({ path: f.repo, format: "text", symbol: "⏳", cacheDirectory: f.cache, ...extra });

test("prompt prints nothing without a cache", async () => {
  const f = await fixture();
  assert.equal(render(f), "");
});

test("prompt prints nothing outside a git repository", async () => {
  const base = await mkdtemp(join(tmpdir(), "evergreen-prompt-nogit-"));
  roots.push(base);
  assert.equal(renderPromptSegment({ path: base, format: "text", symbol: "⏳", cacheDirectory: base }), "");
});

test("prompt counts high and critical findings when there are any", async () => {
  const f = await fixture();
  await writeCache(f, ["low", "high", "critical", "medium"]);
  assert.equal(render(f), "⏳2");
});

test("prompt counts all findings when none is high or critical", async () => {
  const f = await fixture();
  await writeCache(f, ["low", "medium", "info"]);
  assert.equal(render(f), "⏳3");
});

test("prompt is empty when the cache holds no findings", async () => {
  const f = await fixture();
  await writeCache(f, []);
  assert.equal(render(f), "");
});

test("prompt uses the ASCII symbol and finds the repository root from a subdirectory", async () => {
  const f = await fixture();
  await writeCache(f, ["high"]);
  await mkdir(join(f.repo, "src"));
  assert.equal(render({ ...f, repo: join(f.repo, "src") }, { symbol: "EOL:" }), "EOL:1");
});

test("prompt treats a changed input file as stale", async () => {
  const f = await fixture();
  await writeCache(f, ["high"], new Date(Date.now() - 30_000));
  assert.equal(render(f), "⏳1");
  const later = new Date();
  await utimes(join(f.repo, "package.json"), later, later);
  assert.equal(render(f), "");
});

test("prompt treats an old cache as stale", async () => {
  const f = await fixture();
  await writeCache(f, ["high"], new Date(Date.now() - PROMPT_MAX_AGE_MS - 60_000));
  assert.equal(render(f), "");
});

test("prompt json reports whether the cache was used", async () => {
  const f = await fixture();
  assert.deepEqual(JSON.parse(render(f, { format: "json" })), { schemaVersion: "evergreen.prompt.v1", cached: false });
  await writeCache(f, ["high", "low"]);
  assert.deepEqual(JSON.parse(render(f, { format: "json" })), {
    schemaVersion: "evergreen.prompt.v1",
    cached: true,
    total: 2,
    urgent: 1,
    count: 1,
  });
});

test("prompt arguments are validated", () => {
  assert.equal(typeof parsePromptArguments(["--format", "xml"]), "string");
  assert.equal(typeof parsePromptArguments(["--symbol"]), "string");
  assert.equal(typeof parsePromptArguments(["--nope"]), "string");
  assert.equal(typeof parsePromptArguments(["a", "b"]), "string");
  assert.deepEqual(parsePromptArguments(["--symbol", "X", "--format", "json"]), {
    path: process.cwd(),
    format: "json",
    symbol: "X",
  });
});

test("prompt never starts a process", async () => {
  const f = await fixture();
  await writeCache(f, ["high"]);
  const spies = (["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const).map((name) =>
    mock.method(childProcess, name, () => {
      throw new Error(`prompt must not call ${name}`);
    }),
  );
  try {
    assert.equal(render(f), "⏳1");
  } finally {
    mock.restoreAll();
  }
  assert.equal(
    spies.reduce((sum, spy) => sum + spy.mock.callCount(), 0),
    0,
  );
  const source = await readFile(join(process.cwd(), "src", "prompt-segment.ts"), "utf8");
  assert.doesNotMatch(source, /child_process|node:http|node:https|fetch\(/);
});

test("evergreen prompt prints the segment and exits 0 with and without a cache", async () => {
  const f = await fixture();
  const cold = await runCli(["prompt", f.repo], { env: { EVERGREEN_CACHE_DIR: f.cache } });
  assert.deepEqual([cold.code, cold.stdout], [0, ""]);
  await writeCache(f, ["critical", "critical"]);
  const warm = await runCli(["prompt", f.repo], { env: { EVERGREEN_CACHE_DIR: f.cache } });
  assert.deepEqual([warm.code, warm.stdout], [0, "⏳2"]);
  const bad = await runCli(["prompt", "--format", "xml"]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Usage: evergreen prompt/);
});

test("evergreen prompt stays under 50 ms at the 95th percentile on a warm cache", async () => {
  const f = await fixture();
  await writeCache(f, ["high", "medium"]);
  const env = { EVERGREEN_CACHE_DIR: f.cache };
  await runCli(["prompt", f.repo], { env });
  const durations: number[] = [];
  for (let run = 0; run < 50; run += 1) {
    const started = performance.now();
    await runCli(["prompt", f.repo], { env });
    durations.push(performance.now() - started);
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Infinity;
  assert.ok(p95 < 50, `p95 was ${p95.toFixed(1)} ms`);
});
