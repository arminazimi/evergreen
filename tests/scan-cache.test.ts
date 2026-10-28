import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { configureActiveData } from "../src/data-source.js";
import { builtInDetectors } from "../src/detectors/index.js";
import type { Finding } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { computeCacheKey, computeFileHash, ScanCache } from "../src/scan-cache.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";

const cleanupDirs: string[] = [];
after(async () => {
  configureActiveData();
  await Promise.all(cleanupDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `evergreen-test-${prefix}-`));
  cleanupDirs.push(dir);
  return dir;
}

test("computeCacheKey keys on file content hash, detector version, and data version", () => {
  const base = {
    filePath: "package.json",
    fileHash: computeFileHash('{"name": "test"}'),
    detectorId: "npm",
    detectorVersion: "1.0.0",
    dataVersion: "2026.10.01",
  };

  const key1 = computeCacheKey(base);
  const keySame = computeCacheKey({ ...base });
  assert.equal(key1, keySame);

  // Changing file content hash invalidates key
  const keyDifferentHash = computeCacheKey({
    ...base,
    fileHash: computeFileHash('{"name": "test-modified"}'),
  });
  assert.notEqual(key1, keyDifferentHash);

  // Changing detector version invalidates key
  const keyDifferentDetectorVersion = computeCacheKey({
    ...base,
    detectorVersion: "2.0.0",
  });
  assert.notEqual(key1, keyDifferentDetectorVersion);

  // Changing data version invalidates key
  const keyDifferentDataVersion = computeCacheKey({
    ...base,
    dataVersion: "2026.11.01",
  });
  assert.notEqual(key1, keyDifferentDataVersion);
});

test("ScanCache stores entries and invalidates on key changes", async () => {
  const cacheDir = await makeTempDir("cache-store");
  const cache = new ScanCache(cacheDir);

  const entryInput = {
    filePath: "index.js",
    fileHash: computeFileHash("console.log('hi');"),
    detectorId: "fixture-detector",
    detectorVersion: "1.0.0",
    dataVersion: "2026.10.01",
  };

  const finding: Finding = {
    id: "fixture:rule-1:index.js:1",
    ruleId: "rule-1",
    detector: "fixture-detector",
    confidence: "exact",
    title: "Deprecated API",
    summary: "index.js calls deprecated API",
    severity: "high",
    location: { path: "index.js", line: 1 },
    sources: [{ title: "Doc", url: "https://example.com" }],
  };

  await cache.set({
    ...entryInput,
    findings: [finding],
    unclassified: [],
  });

  // Direct hit
  const hit = await cache.get(entryInput);
  assert.ok(hit);
  assert.equal(hit.findings.length, 1);
  assert.equal(hit.findings[0]?.id, finding.id);

  // Invalidate on changed file hash
  const missHash = await cache.get({
    ...entryInput,
    fileHash: computeFileHash("console.log('changed');"),
  });
  assert.equal(missHash, undefined);

  // Invalidate on changed detector version
  const missDetectorVersion = await cache.get({
    ...entryInput,
    detectorVersion: "1.1.0",
  });
  assert.equal(missDetectorVersion, undefined);

  // Invalidate on changed data version
  const missDataVersion = await cache.get({
    ...entryInput,
    dataVersion: "2026.10.15",
  });
  assert.equal(missDataVersion, undefined);

  // Explicit invalidate
  await cache.invalidate(entryInput);
  const afterInvalidate = await cache.get(entryInput);
  assert.equal(afterInvalidate, undefined);
});

test("re-scanning an unchanged repository skips parsing unchanged files and returns byte-identical JSON", async () => {
  const repo = await makeTempDir("repo-unchanged");
  const cacheDir = await makeTempDir("cache-unchanged");
  await writeFile(join(repo, "config.json"), JSON.stringify({ version: "1.0.0" }));

  let parseCalls = 0;
  const countingDetector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "counting",
    inputs: { fileNames: ["config.json"] },
    async scan({ root }) {
      parseCalls++;
      const contents = await readFile(join(root, "config.json"), "utf8");
      JSON.parse(contents);
      return [
        {
          id: "counting:test:config.json:1",
          ruleId: "test-rule",
          title: "Test rule",
          summary: "Config finding",
          severity: "medium",
          location: { path: "config.json", line: 1 },
          sources: [{ title: "Source", url: "https://example.com" }],
        },
      ];
    },
  };

  const options = { cacheDirectory: cacheDir, scannedAt: "2026-10-28T12:00:00.000Z" };

  // First scan: parses file
  const firstScan = await scanRepository(repo, [countingDetector], options);
  assert.equal(parseCalls, 1);
  assert.equal(firstScan.findings.length, 1);

  // Second scan: unchanged repository skips parsing
  const secondScan = await scanRepository(repo, [countingDetector], options);
  assert.equal(parseCalls, 1, "detector must not re-run on unchanged repository");
  assert.equal(JSON.stringify(secondScan), JSON.stringify(firstScan), "cached scan must return byte-identical JSON");
});

test("changing a file invalidates its entry and re-runs the detector", async () => {
  const repo = await makeTempDir("repo-file-change");
  const cacheDir = await makeTempDir("cache-file-change");
  const filePath = join(repo, "component.json");
  await writeFile(filePath, JSON.stringify({ version: "1.0.0" }));

  let scanCount = 0;
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "version-check",
    inputs: { fileNames: ["component.json"] },
    async scan({ root }) {
      scanCount++;
      const raw = await readFile(join(root, "component.json"), "utf8");
      const parsed = JSON.parse(raw) as { version: string };
      return [
        {
          id: `version-check:${parsed.version}`,
          ruleId: "rule-v",
          title: "Version check",
          summary: `Version is ${parsed.version}`,
          severity: "low",
          location: { path: "component.json", line: 1 },
          sources: [{ title: "Source", url: "https://example.com" }],
        },
      ];
    },
  };

  const options = { cacheDirectory: cacheDir, scannedAt: "2026-10-28T12:00:00.000Z" };

  const firstScan = await scanRepository(repo, [detector], options);
  assert.equal(scanCount, 1);
  assert.equal(firstScan.findings[0]?.summary, "Version is 1.0.0");

  // Re-scan without changing file uses cache
  await scanRepository(repo, [detector], options);
  assert.equal(scanCount, 1);

  // Modify file
  await writeFile(filePath, JSON.stringify({ version: "2.0.0" }));

  // Third scan detects file change and invalidates entry
  const thirdScan = await scanRepository(repo, [detector], options);
  assert.equal(scanCount, 2, "detector must re-run when file content changes");
  assert.equal(thirdScan.findings[0]?.summary, "Version is 2.0.0");
});

test("changing detector version invalidates the cache entry", async () => {
  const repo = await makeTempDir("repo-detector-version");
  const cacheDir = await makeTempDir("cache-detector-version");
  await writeFile(join(repo, "input.txt"), "hello");

  let runs = 0;
  const makeDetector = (version: string): Detector & { version: string } => ({
    apiVersion: DETECTOR_API_VERSION,
    version,
    id: "versioned-detector",
    inputs: { fileNames: ["input.txt"] },
    async scan() {
      runs++;
      return [];
    },
  });

  const options = { cacheDirectory: cacheDir, scannedAt: "2026-10-28T12:00:00.000Z" };

  await scanRepository(repo, [makeDetector("1.0.0")], options);
  assert.equal(runs, 1);

  // Same detector version uses cache
  await scanRepository(repo, [makeDetector("1.0.0")], options);
  assert.equal(runs, 1);

  // Changed detector version invalidates entry
  await scanRepository(repo, [makeDetector("2.0.0")], options);
  assert.equal(runs, 2, "changing detector version must invalidate cache entry");
});

test("changing data version invalidates the cache entry", async () => {
  const repo = await makeTempDir("repo-data-version");
  const cacheDir = await makeTempDir("cache-data-version");
  await writeFile(join(repo, "package.json"), "{}");

  let scanCalls = 0;
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "data-sensitive",
    inputs: { fileNames: ["package.json"] },
    async scan() {
      scanCalls++;
      return [];
    },
  };

  await scanRepository(repo, [detector], { cacheDirectory: cacheDir, dataVersion: "2026.10.01" });
  assert.equal(scanCalls, 1);

  // Same data version uses cache
  await scanRepository(repo, [detector], { cacheDirectory: cacheDir, dataVersion: "2026.10.01" });
  assert.equal(scanCalls, 1);

  // Changed data version invalidates entry
  await scanRepository(repo, [detector], { cacheDirectory: cacheDir, dataVersion: "2026.10.15" });
  assert.equal(scanCalls, 2, "changing data version must invalidate cache entry");
});

test("--no-cache invalidates and bypasses the cache", async () => {
  const repo = await makeTempDir("repo-no-cache");
  const cacheDir = await makeTempDir("cache-no-cache");
  await writeFile(join(repo, "data.json"), "{}");

  let scanCalls = 0;
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "no-cache-detector",
    inputs: { fileNames: ["data.json"] },
    async scan() {
      scanCalls++;
      return [];
    },
  };

  // First scan warms cache
  await scanRepository(repo, [detector], { cacheDirectory: cacheDir });
  assert.equal(scanCalls, 1);

  // Normal scan hits cache
  await scanRepository(repo, [detector], { cacheDirectory: cacheDir });
  assert.equal(scanCalls, 1);

  // Scan with noCache: true bypasses cache
  await scanRepository(repo, [detector], { cacheDirectory: cacheDir, noCache: true });
  assert.equal(scanCalls, 2, "--no-cache option must bypass the cache");

  // Scan with process.env.EVERGREEN_NO_CACHE=1 bypasses cache
  process.env.EVERGREEN_NO_CACHE = "1";
  try {
    await scanRepository(repo, [detector], { cacheDirectory: cacheDir });
    assert.equal(scanCalls, 3, "EVERGREEN_NO_CACHE=1 must bypass the cache");
  } finally {
    delete process.env.EVERGREEN_NO_CACHE;
  }
});

test("cached and uncached scans produce identical findings on a real repository fixture", async () => {
  const repo = await makeTempDir("repo-parity");
  const cacheDir = await makeTempDir("cache-parity");
  const pinnedScannedAt = "2026-10-28T00:00:00.000Z";

  await writeFile(
    join(repo, "package.json"),
    JSON.stringify({
      name: "example-repo",
      dependencies: {
        request: "2.88.2",
      },
    }, null, 2),
  );

  const uncached = await scanRepository(repo, builtInDetectors, {
    cacheDirectory: cacheDir,
    noCache: true,
    scannedAt: pinnedScannedAt,
  });

  const cachedFirst = await scanRepository(repo, builtInDetectors, {
    cacheDirectory: cacheDir,
    scannedAt: pinnedScannedAt,
  });

  const cachedSecond = await scanRepository(repo, builtInDetectors, {
    cacheDirectory: cacheDir,
    scannedAt: pinnedScannedAt,
  });

  assert.deepEqual(cachedFirst.findings, uncached.findings);
  assert.deepEqual(cachedSecond.findings, uncached.findings);
  assert.deepEqual(cachedFirst.unclassified, uncached.unclassified);
  assert.deepEqual(cachedSecond.unclassified, uncached.unclassified);
  assert.equal(JSON.stringify(cachedFirst), JSON.stringify(cachedSecond));
});

test("scannedAt is always fresh on cache hit unless fixed with options.scannedAt", async () => {
  const repo = await makeTempDir("repo-scannedat");
  const cacheDir = await makeTempDir("cache-scannedat");
  await writeFile(join(repo, "Dockerfile"), "FROM alpine:3.10\n");

  const first = await scanRepository(repo, builtInDetectors, { cacheDirectory: cacheDir });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await scanRepository(repo, builtInDetectors, { cacheDirectory: cacheDir });

  assert.notEqual(first.scannedAt, second.scannedAt, "scannedAt must reflect current scan time, not old timestamp");
  assert.deepEqual(first.findings, second.findings);

  const pinnedTimestamp = "2026-10-28T12:00:00.000Z";
  const pinnedFirst = await scanRepository(repo, builtInDetectors, { cacheDirectory: cacheDir, scannedAt: pinnedTimestamp });
  const pinnedSecond = await scanRepository(repo, builtInDetectors, { cacheDirectory: cacheDir, scannedAt: pinnedTimestamp });
  assert.equal(JSON.stringify(pinnedFirst), JSON.stringify(pinnedSecond));
});

test("file-isolated detector only re-parses changed files from per-file cache entries", async () => {
  const repo = await makeTempDir("repo-per-file");
  const cacheDir = await makeTempDir("cache-per-file");
  await writeFile(join(repo, "Dockerfile.one"), "FROM alpine:3.10\n");
  await writeFile(join(repo, "Dockerfile.two"), "FROM alpine:3.10\n");

  const parsedFiles: string[] = [];
  const perFileDetector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "per-file-detector",
    inputs: { fileNames: ["Dockerfile.one", "Dockerfile.two"] },
    async scan(ctx) {
      const entries = await readdir(ctx.root);
      const matched = entries.filter((e) => e.startsWith("Dockerfile"));
      parsedFiles.push(...matched);
      return matched.map((f) => ({
        id: `rule:${f}:1`,
        ruleId: "dummy-rule",
        title: "Dummy",
        summary: "Dummy summary",
        severity: "high" as const,
        location: { path: f, line: 1 },
        sources: [{ title: "Source", url: "https://example.com" }],
      }));
    },
  };

  const first = await scanRepository(repo, [perFileDetector], { cacheDirectory: cacheDir });
  assert.deepEqual(parsedFiles.sort(), ["Dockerfile.one", "Dockerfile.two"]);
  assert.equal(first.findings.length, 2);

  parsedFiles.length = 0;

  const second = await scanRepository(repo, [perFileDetector], { cacheDirectory: cacheDir });
  assert.deepEqual(parsedFiles, [], "unchanged scan must not re-parse files");
  assert.equal(second.findings.length, 2);

  await writeFile(join(repo, "Dockerfile.two"), "FROM alpine:3.12\n");
  parsedFiles.length = 0;

  const third = await scanRepository(repo, [perFileDetector], { cacheDirectory: cacheDir });
  assert.deepEqual(parsedFiles, ["Dockerfile.two"], "only changed file must be re-parsed");
  assert.equal(third.findings.length, 2);
});

test("detector without inputs bypasses cache and reflects changes outside declared inputs", async () => {
  const repo = await makeTempDir("repo-no-inputs");
  const cacheDir = await makeTempDir("cache-no-inputs");
  await writeFile(join(repo, "custom.txt"), "hello");

  let scanCount = 0;
  const detectorWithoutInputs: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "no-inputs-detector",
    async scan(ctx) {
      scanCount++;
      const text = await readFile(join(ctx.root, "custom.txt"), "utf8");
      return [
        {
          id: `rule:${text}:1`,
          ruleId: "rule-no-inputs",
          title: "Title",
          summary: text,
          severity: "medium" as const,
          location: { path: "custom.txt", line: 1 },
          sources: [{ title: "Source", url: "https://example.com" }],
        },
      ];
    },
  };

  const first = await scanRepository(repo, [detectorWithoutInputs], { cacheDirectory: cacheDir });
  assert.equal(scanCount, 1);
  assert.equal(first.findings[0]?.summary, "hello");

  await writeFile(join(repo, "custom.txt"), "world");

  const second = await scanRepository(repo, [detectorWithoutInputs], { cacheDirectory: cacheDir });
  assert.equal(scanCount, 2, "detector without inputs must not be cached");
  assert.equal(second.findings[0]?.summary, "world", "must not return stale results");
});

test("detector reading skipped directories (node_modules) bypasses cache and reflects internal changes", async () => {
  const repo = await makeTempDir("repo-skipped-dirs");
  const cacheDir = await makeTempDir("cache-skipped-dirs");
  await mkdir(join(repo, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(repo, "node_modules", "pkg", "index.js"), "v1");

  let scanCount = 0;
  const detectorReadingNodeModules: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "node-modules-reader",
    inputs: { directories: ["node_modules"] },
    async scan(ctx) {
      scanCount++;
      const text = await readFile(join(ctx.root, "node_modules", "pkg", "index.js"), "utf8");
      return [
        {
          id: `rule:${text}:1`,
          ruleId: "rule-node-modules",
          title: "Title",
          summary: text,
          severity: "high" as const,
          location: { path: "node_modules/pkg/index.js", line: 1 },
          sources: [{ title: "Source", url: "https://example.com" }],
        },
      ];
    },
  };

  const first = await scanRepository(repo, [detectorReadingNodeModules], { cacheDirectory: cacheDir });
  assert.equal(scanCount, 1);
  assert.equal(first.findings[0]?.summary, "v1");

  await writeFile(join(repo, "node_modules", "pkg", "index.js"), "v2");

  const second = await scanRepository(repo, [detectorReadingNodeModules], { cacheDirectory: cacheDir });
  assert.equal(scanCount, 2, "detector reading skipped directory must not be cached");
  assert.equal(second.findings[0]?.summary, "v2", "must reflect change inside node_modules immediately");
});
