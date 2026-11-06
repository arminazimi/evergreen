import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDetectorCosts, idleDetectors, measureDetectorCosts } from "../benchmarks/detector-cost.js";
import { builtInDetectors } from "../src/detectors/index.js";

test("measures each requested detector over the fixture corpus, slowest per file first", async () => {
  const detectors = builtInDetectors.filter((detector) => ["npm", "go", "container"].includes(detector.id));
  const report = await measureDetectorCosts({ detectors, runs: 1 });
  assert.equal(report.detectors.length, 3);
  assert.ok(report.files > 100);
  const costs = report.detectors.map((cost) => cost.microsecondsPerFile);
  assert.deepEqual(
    costs,
    [...costs].sort((a, b) => b - a),
  );
  for (const cost of report.detectors) assert.ok(cost.medianWallMs > 0);
});

test("formats a table and lists detectors that found nothing", () => {
  const report = {
    schemaVersion: "evergreen.detector-cost.v1" as const,
    corpus: "tests/fixtures",
    files: 10,
    runs: 1,
    platform: process.platform,
    nodeVersion: process.version,
    detectors: [
      { detector: "a", medianWallMs: 5, microsecondsPerFile: 500, heapGrowthBytes: 1048576, findings: 2 },
      { detector: "b", medianWallMs: 1, microsecondsPerFile: 100, heapGrowthBytes: 0, findings: 0 },
    ],
  };
  assert.match(formatDetectorCosts(report), /\| a \| 5 \| 500 \| 1\.0 \| 2 \|/);
  assert.deepEqual(idleDetectors(report), ["b"]);
});
