import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, afterEach, beforeEach, test } from "node:test";

import { configureActiveData } from "../src/data-source.js";
import type { ScanResult } from "../src/domain.js";
import { renderMultiScanText, scanProjects, scanRepository } from "../src/engine/index.js";
import type { MultiScanResult } from "../src/engine/index.js";
import { cleanupScratch, detectorFinding, detectorOf, scratch } from "./engine-helpers.js";

after(cleanupScratch);
beforeEach(() => configureActiveData({ pinnedVersion: "bundled" }));
afterEach(() => configureActiveData());

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
