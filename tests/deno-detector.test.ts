import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { declaredInputsCheck } from "../src/conformance/checks/inputs.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { denoDetector } from "../src/detectors/deno/index.js";

const fixtures = resolve("tests/fixtures/deno");

test("deno passes detector conformance", async () => {
  await runDetectorConformance({
    detector: denoDetector,
    fixtures: [
      { name: "deno zero findings", root: resolve(fixtures, "zero"), expectedFindings: [] },
      { name: "deno negative cases", root: resolve(fixtures, "negative"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck, declaredInputsCheck],
  });

  // Malformed input must never crash a scan and never produce a bogus finding.
  await runDetectorConformance({
    detector: denoDetector,
    fixtures: [{ name: "deno malformed input", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("deno detector identifies end-of-life Deno runtime pins", async () => {
  const findings = await denoDetector.scan({ root: resolve(fixtures, "deno-1") });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, "deno.runtime.eol-1.x");
  assert.equal(findings[0]?.location.path, "deno.json");
  assert.equal(findings[0]?.location.line, 2);
});

test("deno detector identifies end-of-life Bun runtime pins", async () => {
  const findings = await denoDetector.scan({ root: resolve(fixtures, "bun-1") });
  assert.equal(findings.length, 2);

  const bunVersionFinding = findings.find((f) => f.location.path === ".bun-version");
  assert.ok(bunVersionFinding);
  assert.equal(bunVersionFinding.ruleId, "deno.bun.runtime.eol-1.0");
  assert.equal(bunVersionFinding.location.line, 1);

  const bunfigFinding = findings.find((f) => f.location.path === "bunfig.toml");
  assert.ok(bunfigFinding);
  assert.equal(bunfigFinding.ruleId, "deno.bun.runtime.eol-0.x");
  assert.equal(bunfigFinding.location.line, 1);
});
