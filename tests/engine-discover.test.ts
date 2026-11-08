import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";

import { configureActiveData } from "@velella/ebb/data-source";
import { buildScanCoverage, findRepositories, scanRepository } from "../src/engine/index.js";
import { renderText } from "../src/reporters.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";
import { cleanupScratch, detectorFinding, detectorOf, scratch } from "./engine-helpers.js";

after(cleanupScratch);
beforeEach(() => configureActiveData({ pinnedVersion: "bundled" }));
afterEach(() => configureActiveData());

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
