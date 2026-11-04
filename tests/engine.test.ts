import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";

import { configureActiveData } from "../src/data-source.js";
import type { Finding, ScanResult } from "../src/domain.js";
import {
  applyScanSelection,
  buildScanCoverage,
  CROSS_FILE_DETECTORS,
  defaultConfidence,
  findRepositories,
  renderMultiScanText,
  scanProjects,
  scanRepository,
  scanSelectorMatches,
  shouldDisableCacheForDetector,
} from "../src/engine.js";
import type { MultiScanResult } from "../src/engine.js";
import { advisoryIdsByRuleId } from "../src/osv-advisories.js";
import { computeFileHash, ScanCache } from "../src/scan-cache.js";
import type { DetectorManifest } from "../src/scan-cache.js";
import { renderJson, renderText } from "../src/reporters.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector, DetectorFinding } from "../src/sdk.js";

const scratchRoots: string[] = [];

async function scratch(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `evergreen-engine-${name}-`));
  scratchRoots.push(directory);
  return directory;
}

after(async () => {
  await Promise.all(scratchRoots.map((directory) => rm(directory, { recursive: true, force: true })));
});

beforeEach(() => configureActiveData({ pinnedVersion: "bundled" }));
afterEach(() => configureActiveData());

type DetectorOptions = {
  inputs?: Detector["inputs"];
  scan?: Detector["scan"];
  analyze?: Detector["analyze"];
  version?: string;
};

function detectorOf(id: string, options: DetectorOptions = {}): Detector & { version?: string } {
  return {
    apiVersion: DETECTOR_API_VERSION,
    id,
    scan: options.scan ?? (async () => []),
    ...(options.inputs ? { inputs: options.inputs } : {}),
    ...(options.analyze ? { analyze: options.analyze } : {}),
    ...(options.version ? { version: options.version } : {}),
  };
}

function detectorFinding(path: string, overrides: Partial<DetectorFinding> = {}): DetectorFinding {
  return {
    id: `fixture:${path}`,
    ruleId: "fixture.rule",
    title: "Title",
    summary: "Summary",
    severity: "low",
    location: { path },
    sources: [{ title: "Source", url: "https://example.com/source" }],
    ...overrides,
  };
}

function findingOf(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "npm:one",
    ruleId: "npm.package.eol",
    detector: "npm",
    title: "Title",
    summary: "Summary",
    severity: "low",
    confidence: "exact",
    location: { path: "package.json" },
    sources: [{ title: "Source", url: "https://example.com/source" }],
    ...overrides,
  };
}

/** The detector version the engine derives from a detector's declared version and code. */
function detectorVersionOf(detector: Detector & { version?: string }): string {
  return `${detector.version ?? detector.apiVersion}:${computeFileHash(
    detector.scan.toString() + (detector.analyze ? detector.analyze.toString() : ""),
  )}`;
}

test("scan result is deterministic apart from its timestamp", async () => {
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    async scan() {
      return [
        {
          id: "fixture:two",
          ruleId: "two",
          title: "Second",
          summary: "Second finding",
          severity: "low",
          location: { path: "b.txt" },
          sources: [{ title: "Official source", url: "https://example.com/two" }],
        },
        {
          id: "fixture:one",
          ruleId: "one",
          title: "First",
          summary: "First finding",
          severity: "high",
          location: { path: "a.txt", line: 4 },
          sources: [{ title: "Official source", url: "https://example.com/one" }],
          usages: [
            {
              kind: "call",
              language: "typescript",
              symbol: "example.run",
              location: { path: "src/example.ts", line: 3, column: 1 },
              excerpt: "example.run();",
            },
          ],
          impact: { usageCount: 1, affectedFiles: 1, level: "low" },
        },
      ];
    },
  };

  const result = await scanRepository(".", [detector]);

  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    ["fixture:one", "fixture:two"],
  );
  assert.match(renderText(result), /HIGH First/);
  assert.match(renderText(result), /Impact: low \(1 usages across 1 files\)/);
  assert.match(renderText(result), /src\/example\.ts:3/);
  assert.equal(JSON.parse(renderJson(result)).schemaVersion, "evergreen.scan.v1");
});

test("scan without detectors explains the current state", async () => {
  const result = await scanRepository(".");

  assert.equal(result.findings.length, 0);
  assert.equal(result.diagnostics.length, 1);
});

test("reports optional detector classifications in JSON and text", async () => {
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    async scan() {
      return [];
    },
    async analyze() {
      return {
        findings: [],
        unclassified: [
          {
            component: "owner/action",
            reference: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            reason: "unknown-sha",
            location: { path: ".github/workflows/ci.yml", line: 4 },
          },
        ],
      };
    },
  };

  const result = await scanRepository(".", [detector]);
  const json = JSON.parse(renderJson(result)) as { unclassified: { count: number; references: unknown[] } };

  assert.equal(json.unclassified.count, 1);
  assert.equal(json.unclassified.references.length, 1);
  assert.match(renderText(result), /Unclassified: 1 pinned reference \(use JSON output for details\)/);
});

test("coverage names ecosystems and files matched by detector inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-coverage-"));
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "go.mod"), "module example\n\ngo 1.22\n");
  const npm: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "npm",
    inputs: { fileNames: ["package.json"] },
    async scan() {
      return [];
    },
  };
  const go: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "go",
    inputs: { fileNames: ["go.mod"] },
    async scan() {
      return [];
    },
  };
  const coverage = await buildScanCoverage(root, [npm, go], ["Cargo.toml"]);
  assert.deepEqual(coverage, {
    ecosystems: ["go", "npm"],
    filesRead: ["go.mod", "package.json"],
    unsupportedFiles: ["Cargo.toml"],
  });
  const result = await scanRepository(root, [npm, go]);
  assert.deepEqual(result.coverage?.ecosystems, ["go", "npm"]);
  assert.match(renderText(result), /Ecosystems detected: go, npm/);
});

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

test("a coverage walk prefixes a detector directory with a long run of slashes in linear time", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-coverage-slashes-"));
  await writeFile(join(root, "package.json"), "{}\n");
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    inputs: { fileNames: ["package.json"], directories: [`vendor/${"/".repeat(100_000)}x`] },
    async scan() {
      return [];
    },
  };
  const started = performance.now();
  const coverage = await buildScanCoverage(root, [detector], []);
  const elapsed = performance.now() - started;
  assert.deepEqual(coverage.ecosystems, ["fixture"]);
  assert.deepEqual(coverage.filesRead, ["package.json"]);
  assert.ok(elapsed < 1000, `a coverage walk over a 100k-slash directory took ${elapsed.toFixed(1)}ms`);
});

test("an unreadable directory does not crash a zero-finding coverage walk", async (t) => {
  if (process.platform === "win32") return t.skip("chmod 000 is not meaningful on Windows");
  if (typeof process.getuid === "function" && process.getuid() === 0)
    return t.skip("root can read chmod 000 directories");

  const root = await mkdtemp(join(tmpdir(), "evergreen-coverage-eacces-"));
  const locked = join(root, "locked");
  await mkdir(locked);
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(locked, "hidden.json"), "{}\n");
  await chmod(locked, 0o000);
  const npm: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "npm",
    inputs: { fileNames: ["package.json"] },
    async scan() {
      return [];
    },
  };
  try {
    const result = await scanRepository(root, [npm]);
    assert.ok(result.coverage, "coverage is still recorded");
    assert.deepEqual(result.coverage.ecosystems, ["npm"]);
    assert.deepEqual(result.coverage.filesRead, ["package.json"]);
  } finally {
    await chmod(locked, 0o700);
  }
});

test("a coverage walk that hits its entry limit sets truncated", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-coverage-limit-"));
  await writeFile(join(root, "package.json"), "{}\n");
  for (const name of ["a", "b", "c", "d", "e"]) {
    await mkdir(join(root, name));
    await writeFile(join(root, name, "package.json"), "{}\n");
  }
  const npm: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "npm",
    inputs: { fileNames: ["package.json"] },
    async scan() {
      return [];
    },
  };
  const coverage = await buildScanCoverage(root, [npm], [], 3);
  assert.equal(coverage.truncated, true);
  const full = await buildScanCoverage(root, [npm], []);
  assert.equal(full.truncated, undefined);
  assert.ok(full.filesRead.length >= 6);
  assert.ok(full.filesRead.length > coverage.filesRead.length);
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

test("scan selectors match an ecosystem, a full rule id, or a dotted prefix", () => {
  assert.equal(scanSelectorMatches("npm", "npm", "npm.package.eol"), true);
  assert.equal(scanSelectorMatches("npm.package", "npm", "npm.package.eol"), true);
  assert.equal(scanSelectorMatches("npm.package.eol", "go", "npm.package.eol"), true);
  assert.equal(scanSelectorMatches("npm", "npm", "weird.rule"), true);
  assert.equal(scanSelectorMatches("np", "npm", "npm.package.eol"), false);
  assert.equal(scanSelectorMatches("npm.package.eo", "npm", "npm.package.eol"), false);
  assert.equal(scanSelectorMatches("npm.package.eolx", "npm", "npm.package.eol"), false);
  assert.equal(scanSelectorMatches("go", "npm", "npm.package.eol"), false);
});

test("applying a scan selection keeps the selected findings and references", () => {
  const npmEol = findingOf();
  const npmDeprecated = findingOf({ id: "npm:two", ruleId: "npm.package.deprecated" });
  const goEol = findingOf({ id: "go:one", detector: "go", ruleId: "go.module.eol", location: { path: "go.mod" } });
  const references = [
    {
      detector: "npm",
      component: "left-pad",
      reference: "1.0.0",
      reason: "unmatched",
      location: { path: "package.json" },
    },
    {
      detector: "go",
      component: "example.com/x",
      reference: "v1.0.0",
      reason: "unmatched",
      location: { path: "go.mod" },
    },
  ];
  const base: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root: "/repo",
    scannedAt: "2026-01-01T00:00:00.000Z",
    findings: [npmEol, npmDeprecated, goEol],
    unclassified: { count: 2, references },
    diagnostics: [],
  };

  const unfiltered = applyScanSelection(base, {});
  assert.deepEqual(
    unfiltered.findings.map((finding) => finding.id),
    ["npm:one", "npm:two", "go:one"],
  );
  assert.equal(unfiltered.unclassified?.count, 2);
  assert.equal("selection" in unfiltered, false);

  const byEcosystem = applyScanSelection(base, { only: ["npm"] });
  assert.deepEqual(
    byEcosystem.findings.map((finding) => finding.id),
    ["npm:one", "npm:two"],
  );
  assert.deepEqual(
    byEcosystem.unclassified?.references.map((reference) => reference.component),
    ["left-pad"],
  );
  assert.equal(byEcosystem.unclassified?.count, 1);
  assert.deepEqual(byEcosystem.selection, { only: ["npm"] });
  assert.equal(byEcosystem.root, "/repo");

  const byRule = applyScanSelection(base, { only: ["npm.package.eol"] });
  assert.deepEqual(
    byRule.findings.map((finding) => finding.id),
    ["npm:one"],
  );
  assert.equal(byRule.unclassified?.count, 0);

  const byPrefix = applyScanSelection(base, { only: ["npm.package"] });
  assert.deepEqual(
    byPrefix.findings.map((finding) => finding.id),
    ["npm:one", "npm:two"],
  );

  const excluded = applyScanSelection(base, { exclude: ["npm"] });
  assert.deepEqual(
    excluded.findings.map((finding) => finding.id),
    ["go:one"],
  );
  assert.deepEqual(
    excluded.unclassified?.references.map((reference) => reference.component),
    ["example.com/x"],
  );
  assert.deepEqual(excluded.selection, { exclude: ["npm"] });

  const excludedRule = applyScanSelection(base, { exclude: ["npm.package.eol"] });
  assert.deepEqual(
    excludedRule.findings.map((finding) => finding.id),
    ["npm:two", "go:one"],
  );

  const both = applyScanSelection(base, { only: ["npm"], exclude: ["npm.package.eol"] });
  assert.deepEqual(
    both.findings.map((finding) => finding.id),
    ["npm:two"],
  );
  assert.deepEqual(
    both.unclassified?.references.map((reference) => reference.component),
    ["left-pad"],
  );

  const multiSelector = applyScanSelection(base, { only: ["npm", "zzz"] });
  assert.deepEqual(
    multiSelector.findings.map((finding) => finding.id),
    ["npm:one", "npm:two"],
  );
  assert.deepEqual(
    multiSelector.unclassified?.references.map((reference) => reference.component),
    ["left-pad"],
  );

  const excludedTwo = applyScanSelection(base, { exclude: ["npm", "go"] });
  assert.deepEqual(excludedTwo.findings, []);
  assert.equal(excludedTwo.unclassified?.count, 0);

  const emptySelectors = applyScanSelection(base, { only: [], exclude: [] });
  assert.equal("selection" in emptySelectors, false);
  assert.equal(emptySelectors.findings.length, 3);

  const { unclassified: _unclassified, ...baseWithoutReferences } = base;
  const withoutReferences = applyScanSelection(baseWithoutReferences, { only: ["npm"] });
  assert.equal("unclassified" in withoutReferences, false);
  assert.equal("unclassified" in applyScanSelection(baseWithoutReferences, {}), false);
});

test("a zero-detector coverage walk still reports unsupported files", async () => {
  const root = await scratch("coverage-none");
  const coverage = await buildScanCoverage(root, [detectorOf("fixture")], ["b.txt", "a.txt", "a.txt"]);
  assert.deepEqual(coverage, {
    ecosystems: [],
    filesRead: [],
    unsupportedFiles: ["a.txt", "a.txt", "b.txt"],
  });
});

test("a coverage walk with detectors sorts and deduplicates unsupported files", async () => {
  const root = await scratch("coverage-unsupported");
  await writeFile(join(root, "package.json"), "{}\n");
  const npm = detectorOf("npm", { inputs: { fileNames: ["package.json"] } });
  const coverage = await buildScanCoverage(root, [npm], ["b.txt", "a.txt", "a.txt"]);
  assert.deepEqual(coverage, {
    ecosystems: ["npm"],
    filesRead: ["package.json"],
    unsupportedFiles: ["a.txt", "b.txt"],
  });
});

test("CLE coverage counts only its own documents", async () => {
  const root = await scratch("coverage-cle");
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "cle.json"), "{}\n");
  await writeFile(join(root, "a.ts"), "export {};\n");
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "node_modules", "cle.json"), "{}\n");
  const cle = detectorOf("cle", {
    inputs: { fileNames: ["package.json", "cle.json"], directories: ["node_modules"], sourceExtensions: [".ts"] },
  });
  const coverage = await buildScanCoverage(root, [cle], []);
  assert.deepEqual(coverage.ecosystems, ["cle"]);
  assert.deepEqual(coverage.filesRead, ["cle.json"]);
});

test("a detector that declares source extensions only does not announce an ecosystem", async () => {
  const root = await scratch("coverage-source-only");
  await writeFile(join(root, "a.ts"), "export {};\n");
  const sourceOnly = detectorOf("fixture", { inputs: { sourceExtensions: [".ts"] } });
  const coverage = await buildScanCoverage(root, [sourceOnly], []);
  assert.deepEqual(coverage, { ecosystems: [], filesRead: [], unsupportedFiles: [] });
});

test("a directory detector keeps an extension-only match under its tree", async () => {
  const root = await scratch("coverage-directory");
  await mkdir(join(root, "other"));
  await writeFile(join(root, "other", "x.json"), "{}\n");
  await writeFile(join(root, "root.json"), "{}\n");
  const extension = detectorOf("extension", { inputs: { extensions: [".json"] } });
  const directory = detectorOf("directory", { inputs: { directories: ["other"] } });
  const coverage = await buildScanCoverage(root, [extension, directory], []);
  assert.deepEqual(coverage.ecosystems, ["directory", "extension"]);
  assert.deepEqual(coverage.filesRead, ["other/x.json", "root.json"]);
});

test("the cross-file detector set names the ecosystem detectors that need repository-wide context", () => {
  assert.ok(CROSS_FILE_DETECTORS.size >= 15);
  for (const id of ["npm", "python", "go", "rust", "java"]) assert.equal(CROSS_FILE_DETECTORS.has(id), true, id);
});

test("a detector that declares a file name claims it under any directory", async () => {
  const root = await scratch("coverage-named");
  await mkdir(join(root, "config"));
  await writeFile(join(root, "config", "x.json"), "{}\n");
  const named = detectorOf("named", { inputs: { fileNames: ["x.json"] } });
  const coverage = await buildScanCoverage(root, [named], []);
  assert.deepEqual(coverage.ecosystems, ["named"]);
  assert.deepEqual(coverage.filesRead, ["config/x.json"]);
});

test("the coverage walk skips fixture and vendor trees and visits entries in binary order", async () => {
  const root = await scratch("coverage-skip");
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
    "fixtures",
    "__fixtures__",
    "testdata",
  ];
  await writeFile(join(root, "package.json"), "{}\n");
  for (const directory of skipped) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, "package.json"), "{}\n");
  }
  for (const directory of ["b", "a"]) {
    await mkdir(join(root, directory));
    await writeFile(join(root, directory, "package.json"), "{}\n");
  }
  const npm = detectorOf("npm", { inputs: { fileNames: ["package.json"] } });
  const coverage = await buildScanCoverage(root, [npm], []);
  assert.deepEqual(coverage.filesRead, ["a/package.json", "b/package.json", "package.json"]);
});

test("a coverage walk that starts on a missing or non-directory root reports nothing", async () => {
  const missing = join(await scratch("coverage-missing"), "does-not-exist");
  const npm = detectorOf("npm", { inputs: { fileNames: ["package.json"] } });
  assert.deepEqual(await buildScanCoverage(missing, [npm], []), {
    ecosystems: [],
    filesRead: [],
    unsupportedFiles: [],
  });

  const dir = await scratch("coverage-file-root");
  const file = join(dir, "root.txt");
  await writeFile(file, "text\n");
  assert.deepEqual(await buildScanCoverage(file, [npm], []), {
    ecosystems: [],
    filesRead: [],
    unsupportedFiles: [],
  });
});

test("a coverage walk reports truncation when the limit is reached before an entry", async () => {
  const root = await scratch("coverage-limit-start");
  await mkdir(join(root, "a"));
  const npm = detectorOf("npm", { inputs: { fileNames: ["package.json"] } });
  assert.deepEqual(await buildScanCoverage(root, [npm], [], 1), {
    ecosystems: [],
    filesRead: [],
    unsupportedFiles: [],
    truncated: true,
  });

  const two = await scratch("coverage-limit-entries");
  await writeFile(join(two, "a.json"), "{}\n");
  await writeFile(join(two, "b.json"), "{}\n");
  assert.deepEqual(await buildScanCoverage(two, [npm], [], 1), {
    ecosystems: [],
    filesRead: [],
    unsupportedFiles: [],
    truncated: true,
  });
});

test("a repository scan lists repository files in binary order and skips build trees", async () => {
  const root = await scratch("repository-files");
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
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "zeta.txt"), "z\n");
  await writeFile(join(root, "aardvark.json"), "{}\n");
  await mkdir(join(root, "beta"));
  await writeFile(join(root, "beta", "y.txt"), "y\n");
  await mkdir(join(root, "alpha"));
  await writeFile(join(root, "alpha", "x.txt"), "x\n");
  for (const directory of skipped) {
    await mkdir(join(root, directory), { recursive: true });
    await writeFile(join(root, directory, "hidden.txt"), "hidden\n");
  }
  const npm = detectorOf("npm", {
    inputs: { fileNames: ["package.json"] },
    scan: async () => [detectorFinding("package.json")],
  });
  const result = await scanRepository(root, [npm], { noCache: true });
  assert.deepEqual(result.coverage?.filesRead, [
    "aardvark.json",
    "alpha/x.txt",
    "beta/y.txt",
    "package.json",
    "zeta.txt",
  ]);
});

test("a scan that cannot list its root still reports empty coverage", async () => {
  const root = join(await scratch("scan-missing"), "missing");
  const npm = detectorOf("npm", { inputs: { fileNames: ["package.json"] } });
  const result = await scanRepository(root, [npm], { noCache: true });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.coverage, { ecosystems: [], filesRead: [], unsupportedFiles: [] });
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

test("an incompatible detector stops the scan before it runs", async () => {
  const root = await scratch("incompatible");
  let ran = false;
  const detector = {
    ...detectorOf("bad", {
      scan: async () => {
        ran = true;
        return [];
      },
    }),
    apiVersion: "0",
  } as unknown as Detector;
  await assert.rejects(scanRepository(root, [detector], { noCache: true }), /Unsupported detector API/);
  assert.equal(ran, false);
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

test("findings gain the OSV advisory ids declared for their rule", async () => {
  const advisories = await advisoryIdsByRuleId();
  const [ruleId, ids] = [...advisories.entries()].sort(([left], [right]) => left.localeCompare(right))[0]!;
  const root = await scratch("advisories");
  const detector = detectorOf("fixture", {
    scan: async () => [
      detectorFinding("package.json", { ruleId }),
      detectorFinding("other.json", { ruleId: "fixture.none" }),
    ],
  });
  const result = await scanRepository(root, [detector], { noCache: true });
  const withAdvisories = result.findings.find((finding) => finding.ruleId === ruleId);
  const withoutAdvisories = result.findings.find((finding) => finding.ruleId === "fixture.none");
  assert.deepEqual(withAdvisories?.advisoryIds, ids);
  assert.equal(withoutAdvisories !== undefined && "advisoryIds" in withoutAdvisories, false);
});

test("unclassified references are sorted by detector, component, path, line, and reference", async () => {
  const root = await scratch("references");
  const detector = detectorOf("fixture", {
    analyze: async () => ({
      findings: [],
      unclassified: [
        { component: "b", reference: "2", reason: "why", location: { path: "a.json", line: 2 } },
        { component: "b", reference: "1", reason: "why", location: { path: "a.json", line: 2 } },
        { component: "b", reference: "1", reason: "why", location: { path: "a.json" } },
        { component: "a", reference: "z", reason: "why", location: { path: "z.json" } },
        { component: "b", reference: "1", reason: "why", location: { path: "a.json", line: 1 } },
      ],
    }),
  });
  const result = await scanRepository(root, [detector], { noCache: true });
  assert.deepEqual(
    result.unclassified?.references.map((reference) => [
      reference.component,
      reference.location.path,
      reference.location.line ?? "none",
      reference.reference,
    ]),
    [
      ["a", "z.json", "none", "z"],
      ["b", "a.json", "none", "1"],
      ["b", "a.json", 1, "1"],
      ["b", "a.json", 2, "1"],
      ["b", "a.json", 2, "2"],
    ],
  );
});

test("a scan with findings records ecosystems, every repository file, and unsupported files", async () => {
  const root = await scratch("coverage-findings");
  await writeFile(join(root, "package.json"), "{}\n");
  await writeFile(join(root, "README.md"), "readme\n");
  await writeFile(join(root, "b.json"), "{}\n");
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "name: ci\n");
  const zeta = detectorOf("zeta", {
    inputs: { fileNames: ["package.json"] },
    analyze: async () => ({
      findings: [
        detectorFinding("package.json"),
        detectorFinding("package.json", { id: "zeta:two", ruleId: "zeta.other" }),
      ],
      unclassified: [
        { component: "x", reference: "y", reason: "why", location: { path: "z.txt" } },
        { component: "x", reference: "y", reason: "why", location: { path: "weird.txt" } },
        { component: "x", reference: "y", reason: "why", location: { path: "a.txt" } },
        { component: "x", reference: "y", reason: "why", location: { path: "a.txt" } },
      ],
    }),
  });
  const alpha = detectorOf("alpha", {
    inputs: { fileNames: ["b.json"] },
    scan: async () => [detectorFinding("b.json")],
  });
  const result = await scanRepository(root, [zeta, alpha], { noCache: true });
  assert.deepEqual(result.coverage, {
    ecosystems: ["alpha", "zeta"],
    filesRead: [".github/workflows/ci.yml", "b.json", "package.json", "README.md"],
    unsupportedFiles: ["a.txt", "weird.txt", "z.txt"],
  });
  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    ["fixture:b.json", "fixture:package.json", "zeta:two"],
  );
});

test("a scan with detectors reports no diagnostics and includes data info", async () => {
  const root = await scratch("data-info");
  const result = await scanRepository(root, [detectorOf("fixture")], { noCache: true });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.data?.source, "bundled");
});

test("data warnings are reported in the scan diagnostics", async () => {
  const cache = await scratch("data-warning-cache");
  await mkdir(join(cache, "data"), { recursive: true });
  await writeFile(join(cache, "data", "active.json"), JSON.stringify({ version: "not-a-version" }));
  configureActiveData({ cacheDirectory: cache });
  const root = await scratch("data-warning");
  const result = await scanRepository(root, [detectorOf("fixture")], { noCache: true });
  assert.equal(result.diagnostics.length, 1);
  assert.match(result.diagnostics[0]!, /does not name a valid version/);
  assert.equal(result.data?.source, "bundled");
});

test("a scan without detectors has no data, coverage, or selection", async () => {
  const result = await scanRepository(await scratch("no-detectors"));
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.diagnostics, ["No detectors are enabled."]);
  assert.equal(result.data, undefined);
  assert.equal(result.coverage, undefined);
  assert.equal(result.selection, undefined);
  assert.equal(result.unclassified?.count, 0);
});

test("a scan without detectors does not write a scan manifest", async () => {
  const root = await scratch("no-detector-cache");
  const cacheDirectory = await scratch("cache-no-detector");
  await scanRepository(root, [], { cacheDirectory });
  assert.deepEqual(await readdir(cacheDirectory), []);
});

test("findRepositories returns each immediate Git repository sorted by name", async () => {
  const root = await scratch("repositories");
  for (const name of ["zeta", "alpha"]) {
    await mkdir(join(root, name, ".git"), { recursive: true });
  }
  await mkdir(join(root, "linked"));
  await writeFile(join(root, "linked", ".git"), "gitdir: somewhere\n");
  await mkdir(join(root, "plain"));
  await writeFile(join(root, "stray.txt"), "text\n");
  assert.deepEqual(await findRepositories(root), [join(root, "alpha"), join(root, "linked"), join(root, "zeta")]);
});

test("scanProjects scans each unique path once and totals findings", async () => {
  const first = await scratch("multi-first");
  const second = await scratch("multi-second");
  const detector = detectorOf("fixture", { scan: async () => [detectorFinding("file.txt")] });
  const result = await scanProjects([second, first, second, first], [detector], { noCache: true });
  assert.equal(result.schemaVersion, "evergreen.multi-scan.v1");
  assert.deepEqual(
    result.projects.map((project) => project.path),
    [resolve(first), resolve(second)],
  );
  assert.deepEqual(
    result.projects.map((project) => project.findings),
    [1, 1],
  );
  assert.deepEqual(result.total, { projects: 2, findings: 2 });

  const empty = await scanProjects([first], [], { noCache: true });
  assert.deepEqual(empty.total, { projects: 1, findings: 0 });

  const defaulted = await scanProjects([first], undefined, { noCache: true });
  assert.deepEqual(
    defaulted.projects.map((project) => project.findings),
    [0],
  );
});

test("multi-scan text uses singular and plural counts", () => {
  const scanResult = (path: string): ScanResult => ({
    schemaVersion: "evergreen.scan.v1",
    root: path,
    scannedAt: "2026-01-01T00:00:00.000Z",
    findings: [],
    diagnostics: [],
  });
  const multi = (projects: Array<[string, number]>): MultiScanResult => ({
    schemaVersion: "evergreen.multi-scan.v1",
    projects: projects.map(([path, findings]) => ({ path, findings, result: scanResult(path) })),
    total: { projects: projects.length, findings: projects.reduce((sum, [, findings]) => sum + findings, 0) },
  });

  assert.equal(renderMultiScanText(multi([])), "\nTotal: 0 findings across 0 projects");
  assert.equal(renderMultiScanText(multi([["/one", 0]])), "/one: 0 findings\n\nTotal: 0 findings across 1 project");
  assert.equal(renderMultiScanText(multi([["/one", 1]])), "/one: 1 finding\n\nTotal: 1 finding across 1 project");
  assert.equal(
    renderMultiScanText(
      multi([
        ["/one", 1],
        ["/two", 2],
      ]),
    ),
    "/one: 1 finding\n/two: 2 findings\n\nTotal: 3 findings across 2 projects",
  );
});
