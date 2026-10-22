import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { defaultConfidence, scanRepository } from "../src/engine.js";
import { renderSarif, renderText } from "../src/reporters.js";
import { npmDetector } from "../src/detectors/npm.js";
import type { DetectorFinding } from "../src/sdk.js";

const base: DetectorFinding = {
  id: "x:y:1",
  ruleId: "x",
  title: "t",
  summary: "s",
  severity: "high",
  location: { path: "Dockerfile", line: 1 },
  sources: [{ title: "Source", url: "https://example.com" }],
};

test("the engine derives confidence from where a finding was read unless the detector says", () => {
  assert.equal(defaultConfidence(base), "exact");
  assert.equal(defaultConfidence({ ...base, location: { path: "web/Cargo.lock", line: 3 } }), "inferred-from-lock");
  assert.equal(defaultConfidence({ ...base, location: { path: "package-lock.json" } }), "inferred-from-lock");
  assert.equal(defaultConfidence({ ...base, confidence: "range", location: { path: "Cargo.lock" } }), "range");
});

test("an engines range is a range and a pinned volta runtime is exact, in JSON, text, and SARIF", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-confidence-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "a", version: "1.0.0", engines: { node: ">=14" } }, null, 2));
    const range = await scanRepository(root, [npmDetector]);
    const found = range.findings.filter((finding) => finding.detector === "npm");
    assert.ok(found.length > 0);
    assert.ok(found.every((finding) => finding.confidence === "range"));
    assert.match(renderText(range), /Confidence: range/);
    assert.equal(JSON.parse(renderSarif(range)).runs[0].results[0].properties.confidence, "range");

    await writeFile(join(root, "package.json"), JSON.stringify({ name: "a", version: "1.0.0", volta: { node: "14.21.3" } }, null, 2));
    const pinned = await scanRepository(root, [npmDetector]);
    assert.ok(pinned.findings.length > 0);
    assert.ok(pinned.findings.every((finding) => finding.confidence === "exact"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
