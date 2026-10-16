import type { ScaffoldNames } from "../names.js";

/** `tests/<id>-detector.test.ts`: runs the conformance suite against the generated fixtures. */
export function testTemplate(names: ScaffoldNames): string {
  return `import { resolve } from "node:path";
import { test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { ${names.camel}Detector } from "../src/detectors/${names.id}.js";

const fixtures = resolve("tests/fixtures/${names.id}");

test("${names.id} passes detector conformance", async () => {
  await runDetectorConformance({
    detector: ${names.camel}Detector,
    fixtures: [{ name: "${names.id} zero findings", root: resolve(fixtures, "zero"), expectedFindings: [] }],
    checks: [determinismCheck, zeroFindingsCheck],
  });

  // Malformed input must never crash a scan and never produce a bogus finding.
  await runDetectorConformance({
    detector: ${names.camel}Detector,
    fixtures: [{ name: "${names.id} malformed input", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

// Add a fixture directory with a deprecated declaration under tests/fixtures/${names.id}/ for every rule you
// write, and list the findings you expect from it:
//
//   fixtures: [{ name: "deprecated <thing>", root: resolve(fixtures, "<directory>"), expectedFindings: [ ... ] }],
`;
}
