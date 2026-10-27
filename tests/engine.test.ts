import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildScanCoverage, scanRepository } from "../src/engine.js";
import { renderJson, renderText } from "../src/reporters.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";

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
        unclassified: [{
          component: "owner/action",
          reference: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          reason: "unknown-sha",
          location: { path: ".github/workflows/ci.yml", line: 4 },
        }],
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

test("an unreadable directory does not crash a zero-finding coverage walk", async (t) => {
  if (process.platform === "win32") return t.skip("chmod 000 is not meaningful on Windows");
  if (typeof process.getuid === "function" && process.getuid() === 0) return t.skip("root can read chmod 000 directories");

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
