import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { detectorOf, findingKey, scoreDetectors, violations } from "../benchmarks/thresholds.js";
import type { Thresholds } from "../benchmarks/thresholds.js";

const finding = (ruleId: string, line: number) => ({ ruleId, path: "package.json", line });

test("thresholds name every shipped detector and enforce precision of at least 0.95", async () => {
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  assert.equal(thresholds.schemaVersion, "evergreen.corpus-thresholds.v1");
  assert.deepEqual(Object.keys(thresholds.detectors).sort(), ["container", "github-actions", "go", "java", "kubernetes", "nodejs", "npm", "python", "rust"]);
  for (const [name, threshold] of Object.entries(thresholds.detectors)) {
    // The container, Go, Java, Kubernetes, and Rust detectors are experimental: it is scored and reported, but not enforced yet.
    assert.equal(threshold.stable, !["container", "go", "java", "kubernetes", "rust"].includes(name), name);
    assert.ok(threshold.minPrecision >= 0.95);
  }
});

test("scores each detector by the family of its rule ids", () => {
  assert.equal(detectorOf("npm.package.request.deprecated"), "npm");
  const request = finding("npm.package.request.deprecated", 3);
  const sass = finding("npm.package.node-sass.eol", 9);
  const node = finding("nodejs.runtime.eol-20", 5);
  const scores = scoreDetectors([
    { findings: [request, sass, node], unexpected: [findingKey(sass)], missing: [findingKey(finding("python.runtime.eol-3.9-and-older", 1))] },
  ]);
  assert.deepEqual(scores.npm, { truePositives: 1, falsePositives: 1, falseNegatives: 0, precision: 0.5 });
  assert.deepEqual(scores.nodejs, { truePositives: 1, falsePositives: 0, falseNegatives: 0, precision: 1 });
  assert.deepEqual(scores.python, { truePositives: 0, falsePositives: 0, falseNegatives: 1, precision: 1 });
});

test("a stable detector below its floor is a violation; an experimental one or a missing one is not", () => {
  const thresholds: Thresholds = {
    schemaVersion: "evergreen.corpus-thresholds.v1",
    detectors: {
      npm: { stable: true, minPrecision: 0.95 },
      python: { stable: true, minPrecision: 0.95 },
      nodejs: { stable: false, minPrecision: 0.99 },
    },
  };
  const scores = {
    npm: { truePositives: 9, falsePositives: 1, falseNegatives: 0, precision: 0.9 },
    nodejs: { truePositives: 1, falsePositives: 9, falseNegatives: 0, precision: 0.1 },
  };
  assert.deepEqual(violations(scores, thresholds), [{ detector: "npm", precision: 0.9, minPrecision: 0.95 }]);
  assert.deepEqual(violations({ npm: { truePositives: 19, falsePositives: 1, falseNegatives: 0, precision: 0.95 } }, thresholds), []);
});
