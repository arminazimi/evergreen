import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";

import { configureActiveData } from "../src/data-source.js";
import {
  CROSS_FILE_DETECTORS,
  defaultConfidence,
  scanRepository,
  shouldDisableCacheForDetector,
} from "../src/engine/index.js";
import { computeFileHash, ScanCache } from "../src/scan-cache.js";
import type { DetectorManifest } from "../src/scan-cache.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";
import {
  cleanupScratch,
  detectorFinding,
  detectorOf,
  detectorVersionOf,
  findingOf,
  scratch,
} from "./engine-helpers.js";

after(cleanupScratch);
beforeEach(() => configureActiveData({ pinnedVersion: "bundled" }));
afterEach(() => configureActiveData());

test("a detector directory with a long run of slashes is checked in linear time", () => {
  const attack = `node_modules${"/".repeat(100_000)}x`;
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    inputs: { directories: [attack] },
    async scan() {
      return [];
    },
  };
  const started = performance.now();
  const disabled = shouldDisableCacheForDetector(detector);
  const elapsed = performance.now() - started;
  assert.equal(disabled, false);
  assert.ok(elapsed < 1000, `a 100k-slash directory took ${elapsed.toFixed(1)}ms`);
});

test("a finding read from a lockfile is inferred and every other read is exact", () => {
  for (const path of [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "go.sum",
    "pubspec.lock",
    "packages.lock.json",
    "gemfile.lock",
    "composer.lock",
    "cargo.lock",
    "poetry.lock",
    "uv.lock",
    "pipfile.lock",
    "yarn.lock",
    "Gemfile.Lock",
    "nested/dir/package-lock.json",
    "foo-lock.json",
    "foo.lock",
    "foo.lockfile",
    "foo.lock.js",
    "lock",
    "lock.json",
  ]) {
    assert.equal(defaultConfidence(detectorFinding(path)), "inferred-from-lock", path);
  }
  for (const path of [
    "package.json",
    "requirements.txt",
    "block.json",
    "clock.json",
    "locket.json",
    "my_lock_file",
    "foo.lockb",
    "src/go.sum.bak",
    "mygo.sum",
    "README.md",
  ]) {
    assert.equal(defaultConfidence(detectorFinding(path)), "exact", path);
  }
  assert.equal(defaultConfidence(detectorFinding("package-lock.json", { confidence: "range" })), "range");
});

test("caching is disabled for a detector without inputs or one that reads a skipped tree", () => {
  const skipped = [
    ".git",
    ".hg",
    ".venv",
    "venv",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "target",
    "coverage",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tox",
  ];
  for (const directory of skipped) {
    assert.equal(
      shouldDisableCacheForDetector(detectorOf("fixture", { inputs: { directories: [directory] } })),
      true,
      directory,
    );
    assert.equal(
      shouldDisableCacheForDetector(detectorOf("fixture", { inputs: { directories: [`${directory}/`] } })),
      true,
      `${directory}/`,
    );
  }
  assert.equal(
    shouldDisableCacheForDetector(detectorOf("fixture", { inputs: { directories: ["node_modules////"] } })),
    true,
  );
  assert.equal(shouldDisableCacheForDetector(detectorOf("fixture")), true);
  assert.equal(shouldDisableCacheForDetector(detectorOf("fixture", { inputs: { directories: [] } })), false);
  assert.equal(
    shouldDisableCacheForDetector(detectorOf("fixture", { inputs: { directories: ["src", "docs/lib"] } })),
    false,
  );
  assert.equal(
    shouldDisableCacheForDetector(detectorOf("fixture", { inputs: { fileNames: ["package.json"] } })),
    false,
  );
});

test("the cross-file detector set names the ecosystem detectors that need repository-wide context", () => {
  assert.ok(CROSS_FILE_DETECTORS.size >= 15);
  for (const id of ["npm", "python", "go", "rust", "java"]) assert.equal(CROSS_FILE_DETECTORS.has(id), true, id);
});

test("a detector whose inputs match no file is not run", async () => {
  const root = await scratch("no-match");
  await writeFile(join(root, "README.md"), "readme\n");
  let calls = 0;
  const detector = detectorOf("fixture", {
    inputs: { fileNames: ["package.json"] },
    scan: async () => {
      calls += 1;
      return [detectorFinding("package.json")];
    },
  });
  const cache = new ScanCache(await scratch("cache-no-match"));
  const result = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
  assert.equal(calls, 0);
  assert.deepEqual(result.findings, []);
});

test("a detector without inputs always runs and its findings are annotated", async () => {
  const root = await scratch("no-inputs");
  await writeFile(join(root, "package-lock.json"), "{}\n");
  const detector = detectorOf("fixture", {
    version: "2.0",
    scan: async () => [detectorFinding("scanned.txt"), detectorFinding("package-lock.json")],
  });
  const cache = new ScanCache(await scratch("cache-no-inputs"));
  const result = await scanRepository(root, [detector], {
    cache,
    dataVersion: "test-data",
    scannedAt: "2026-01-02T03:04:05.000Z",
  });
  assert.equal(result.scannedAt, "2026-01-02T03:04:05.000Z");
  assert.deepEqual(
    result.findings.map((finding) => [finding.detector, finding.location.path, finding.confidence]),
    [
      ["fixture", "package-lock.json", "inferred-from-lock"],
      ["fixture", "scanned.txt", "exact"],
    ],
  );
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.data?.source, "bundled");
  const manifest = await cache.getScanManifest(resolve(root));
  assert.equal(manifest?.scannedAt, "2026-01-02T03:04:05.000Z");
  assert.match(manifest?.detectorSignatures.fixture ?? "", /^2\.0:[0-9a-f]{64}:test-data$/);
});

test("noCache and EVERGREEN_NO_CACHE skip reading and writing the cache", async () => {
  const root = await scratch("no-cache");
  await writeFile(join(root, "package.json"), "{}\n");
  let analyses = 0;
  const detector = detectorOf("fixture", {
    version: "1.0",
    inputs: { fileNames: ["package.json"] },
    analyze: async () => {
      analyses += 1;
      return { findings: [detectorFinding("package.json")], unclassified: [] };
    },
  });
  const cacheDirectory = await scratch("cache-directory");
  const options = { cacheDirectory, dataVersion: "test-data" } as const;

  await scanRepository(root, [detector], { ...options, noCache: true });
  assert.equal(analyses, 1);
  assert.deepEqual(await readdir(cacheDirectory), []);

  await scanRepository(root, [detector], options);
  assert.equal(analyses, 2);
  assert.ok((await readdir(join(cacheDirectory, "scans"))).length > 0);

  await scanRepository(root, [detector], options);
  assert.equal(analyses, 2);

  process.env.EVERGREEN_NO_CACHE = "1";
  try {
    await scanRepository(root, [detector], options);
  } finally {
    delete process.env.EVERGREEN_NO_CACHE;
  }
  assert.equal(analyses, 3);

  await scanRepository(root, [detector], options);
  assert.equal(analyses, 3);
});

test("a cached manifest that does not exactly match the files re-runs the detector", async () => {
  const root = await scratch("manifest-mismatch");
  const contentA = JSON.stringify({ a: 1 });
  const contentB = JSON.stringify({ b: 1 });
  await writeFile(join(root, "a.json"), contentA);
  await writeFile(join(root, "b.json"), contentB);
  let calls = 0;
  const detector = detectorOf("fixture", {
    version: "1.0",
    inputs: { fileNames: ["a.json", "b.json"] },
    analyze: async (context) => {
      calls += 1;
      const names = (await readdir(context.root)).sort();
      return { findings: names.map((name) => detectorFinding(name)), unclassified: [] };
    },
  });
  const version = detectorVersionOf(detector);
  const cached = findingOf({ id: "cached:only", detector: "fixture", location: { path: "a.json" } });

  const run = async (files: DetectorManifest["files"], label: string) => {
    const cache = new ScanCache(await scratch("cache-mismatch"));
    await cache.setDetectorManifest(resolve(root), {
      detectorId: "fixture",
      detectorVersion: version,
      dataVersion: "test-data",
      files,
      findings: [cached],
      unclassified: [],
    });
    calls = 0;
    const result = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
    assert.equal(calls, 1, label);
    assert.deepEqual(
      result.findings.map((finding) => finding.location.path),
      ["a.json", "b.json"],
      label,
    );
  };

  await run([{ path: "a.json", hash: computeFileHash(contentA) }], "length");
  await run(
    [
      { path: "c.json", hash: computeFileHash(contentA) },
      { path: "b.json", hash: computeFileHash(contentB) },
    ],
    "path",
  );
  await run(
    [
      { path: "a.json", hash: "deadbeef" },
      { path: "b.json", hash: computeFileHash(contentB) },
    ],
    "hash",
  );
  await run(
    [
      { path: "a.json", hash: computeFileHash(contentA) },
      { path: "a.json", hash: computeFileHash(contentA) },
    ],
    "some",
  );
});

test("unchanged files come from per-file cache entries when no manifest matches", async () => {
  const root = await scratch("per-file-cache");
  const contentA = JSON.stringify({ a: 1 });
  const contentB = JSON.stringify({ b: 1 });
  await writeFile(join(root, "a.json"), contentA);
  await writeFile(join(root, "b.json"), contentB);
  let calls = 0;
  const detector = detectorOf("fixture", {
    version: "1.0",
    inputs: { fileNames: ["a.json", "b.json"] },
    analyze: async () => {
      calls += 1;
      throw new Error("analyze must not run when every file is cached");
    },
  });
  const version = detectorVersionOf(detector);
  const cache = new ScanCache(await scratch("cache-per-file"));
  for (const [path, content] of [
    ["a.json", contentA],
    ["b.json", contentB],
  ] as const) {
    await cache.set({
      filePath: path,
      fileHash: computeFileHash(content),
      detectorId: "fixture",
      detectorVersion: version,
      dataVersion: "test-data",
      findings: [findingOf({ id: `cached:${path}`, detector: "fixture", location: { path } })],
      unclassified: [{ detector: "fixture", component: path, reference: "r", reason: "why", location: { path } }],
    });
  }
  const result = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
  assert.equal(calls, 0);
  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    ["cached:a.json", "cached:b.json"],
  );
  assert.deepEqual(
    result.unclassified?.references.map((reference) => reference.component),
    ["a.json", "b.json"],
  );
});

test("only changed files are re-parsed, then all changed files when the cache is stale", async () => {
  const root = await scratch("partial");
  const contents: Record<string, string> = {
    "a.json": JSON.stringify({ a: 1 }),
    "b.json": JSON.stringify({ b: 1 }),
    "c.json": JSON.stringify({ c: 1 }),
  };
  for (const [name, content] of Object.entries(contents)) await writeFile(join(root, name), content);
  const rootsSeen: string[] = [];
  const namesSeen: string[][] = [];
  const detector = detectorOf("fixture", {
    version: "1.0",
    inputs: { fileNames: ["a.json", "b.json", "c.json"] },
    analyze: async (context) => {
      rootsSeen.push(context.root);
      const names = (await readdir(context.root)).sort();
      namesSeen.push(names);
      return {
        findings: names.map((name) => detectorFinding(name)),
        unclassified: names.map((name) => ({
          component: name,
          reference: "r",
          reason: "why",
          location: { path: name },
        })),
      };
    },
  });
  const version = detectorVersionOf(detector);
  const cache = new ScanCache(await scratch("cache-partial"));

  const first = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
  assert.deepEqual(rootsSeen, [resolve(root)]);
  assert.deepEqual(namesSeen, [["a.json", "b.json", "c.json"]]);
  assert.deepEqual(
    first.findings.map((finding) => finding.location.path),
    ["a.json", "b.json", "c.json"],
  );

  await writeFile(join(root, "b.json"), JSON.stringify({ b: 2 }));
  await writeFile(join(root, "c.json"), JSON.stringify({ c: 2 }));
  const second = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
  assert.notEqual(rootsSeen[1], resolve(root));
  assert.deepEqual(namesSeen[1], ["b.json", "c.json"]);
  assert.deepEqual(
    second.findings.map((finding) => finding.location.path),
    ["a.json", "b.json", "c.json"],
  );
  assert.deepEqual(
    second.unclassified?.references.map((reference) => reference.component),
    ["a.json", "b.json", "c.json"],
  );

  const entryOf = (path: string, content: string) =>
    cache.get({
      filePath: path,
      fileHash: computeFileHash(content),
      detectorId: "fixture",
      detectorVersion: version,
      dataVersion: "test-data",
    });
  const cachedA = await entryOf("a.json", contents["a.json"]!);
  assert.deepEqual(
    cachedA?.findings.map((finding) => finding.location.path),
    ["a.json"],
  );
  assert.deepEqual(
    cachedA?.unclassified.map((reference) => reference.component),
    ["a.json"],
  );
  const cachedB = await entryOf("b.json", JSON.stringify({ b: 2 }));
  assert.deepEqual(
    cachedB?.findings.map((finding) => finding.location.path),
    ["b.json"],
  );
  assert.deepEqual(
    cachedB?.unclassified.map((reference) => reference.component),
    ["b.json"],
  );

  await writeFile(join(root, "a.json"), JSON.stringify({ a: 2 }));
  await writeFile(join(root, "b.json"), JSON.stringify({ b: 3 }));
  await writeFile(join(root, "c.json"), JSON.stringify({ c: 3 }));
  const third = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
  assert.equal(rootsSeen[2], resolve(root));
  assert.deepEqual(namesSeen[2], ["a.json", "b.json", "c.json"]);
  assert.deepEqual(
    third.findings.map((finding) => finding.location.path),
    ["a.json", "b.json", "c.json"],
  );
  const rewrittenA = await entryOf("a.json", JSON.stringify({ a: 2 }));
  assert.deepEqual(
    rewrittenA?.findings.map((finding) => finding.location.path),
    ["a.json"],
  );
  assert.deepEqual(
    rewrittenA?.unclassified.map((reference) => reference.component),
    ["a.json"],
  );
});

test("a different data version invalidates the detector manifest", async () => {
  const root = await scratch("data-version");
  await writeFile(join(root, "package.json"), "{}\n");
  let calls = 0;
  const detector = detectorOf("fixture", {
    version: "1.0",
    inputs: { fileNames: ["package.json"] },
    analyze: async () => {
      calls += 1;
      return { findings: [detectorFinding("package.json")], unclassified: [] };
    },
  });
  const cache = new ScanCache(await scratch("cache-data-version"));
  await scanRepository(root, [detector], { cache, dataVersion: "v1" });
  await scanRepository(root, [detector], { cache, dataVersion: "v1" });
  assert.equal(calls, 1);
  await scanRepository(root, [detector], { cache, dataVersion: "v2" });
  assert.equal(calls, 2);
});

test("a cross-file detector re-runs against the repository root when one of its files changes", async () => {
  for (const id of CROSS_FILE_DETECTORS) {
    const root = await scratch("cross-file");
    const contents: Record<string, string> = {
      "a.json": JSON.stringify({ a: 1 }),
      "b.json": JSON.stringify({ b: 1 }),
    };
    for (const [name, content] of Object.entries(contents)) await writeFile(join(root, name), content);
    const rootsSeen: string[] = [];
    const detector = detectorOf(id, {
      version: "1.0",
      inputs: { fileNames: ["a.json", "b.json"] },
      analyze: async (context) => {
        rootsSeen.push(context.root);
        const names = (await readdir(context.root)).sort();
        return {
          findings: names.map((name) => detectorFinding(name)),
          unclassified: names.map((name) => ({
            component: name,
            reference: "r",
            reason: "why",
            location: { path: name },
          })),
        };
      },
    });
    const version = detectorVersionOf(detector);
    const cache = new ScanCache(await scratch("cache-cross-file"));
    const first = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
    assert.equal(first.findings.length, 2, id);

    await writeFile(join(root, "b.json"), JSON.stringify({ b: 2 }));
    const second = await scanRepository(root, [detector], { cache, dataVersion: "test-data" });
    assert.equal(rootsSeen[1], resolve(root), `${id} re-ran against the repository root`);
    assert.deepEqual(
      second.findings.map((finding) => finding.location.path),
      ["a.json", "b.json"],
      id,
    );

    const entryA = await cache.get({
      filePath: "a.json",
      fileHash: computeFileHash(contents["a.json"]!),
      detectorId: id,
      detectorVersion: version,
      dataVersion: "test-data",
    });
    assert.deepEqual(
      entryA?.findings.map((finding) => finding.location.path),
      ["a.json"],
      id,
    );
    assert.deepEqual(
      entryA?.unclassified.map((reference) => reference.component),
      ["a.json"],
      id,
    );
  }
});
