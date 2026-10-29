import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv } from "ajv";

import type { Finding } from "../src/domain.js";
import { exposureFromUsage } from "../src/exposure.js";
import { VERSION } from "../src/version.js";
import { exportVex, VEX_EVIDENCE_LOCATION_PROPERTY } from "../src/sbom/vex.js";

const findings = JSON.parse(await readFile(resolve("tests/fixtures/cyclonedx/vex-findings.json"), "utf8")) as Finding[];

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("iri-reference", (value: string) => !/\s/.test(value));
ajv.addFormat("uri", (value: string) => URL.canParse(value));
ajv.addFormat("date-time", (value: string) =>
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)));
ajv.addFormat("idn-email", (value: string) => /^[^\s@]+@[^\s@]+$/.test(value));
for (const file of ["spdx.schema.json", "jsf-0.82.schema.json"]) {
  ajv.addSchema(JSON.parse(await readFile(resolve("tests/fixtures/cyclonedx", file), "utf8")));
}
const validate = ajv.compile<Record<string, unknown>>(
  JSON.parse(await readFile(resolve("tests/fixtures/cyclonedx/bom-1.5.schema.json"), "utf8")),
);

test("exposureFromUsage maps usage evidence to VEX analysis states", () => {
  const [used, unused, unknown] = findings;
  assert.deepEqual(exposureFromUsage(used!).state, "exploitable");
  assert.equal(exposureFromUsage(used!).justification, undefined);
  assert.match(exposureFromUsage(used!).detail, /src\/client\.js:3/);
  assert.match(exposureFromUsage(used!).detail, /package\.json:12/);

  assert.deepEqual(exposureFromUsage(unused!), {
    state: "not_affected",
    justification: "code_not_reachable",
    locations: [{ path: "package.json", line: 18, role: "declaration" }],
    detail: "left-pad is unmaintained: usage analysis found no source usages. Evidence: declaration package.json:18.",
  });

  assert.equal(exposureFromUsage(unknown!).state, "in_triage");
  assert.equal(exposureFromUsage(unknown!).justification, undefined);
  assert.match(exposureFromUsage(unknown!).detail, /usage analysis did not run/);
});

test("fixture findings produce a valid CycloneDX 1.5 VEX document with evidence locations", () => {
  const document = exportVex(findings, {
    timestamp: "2026-10-29T12:00:00Z",
    serialNumber: "urn:uuid:3e671687-395b-41f5-a30f-a58921a69b79",
  });
  assert.ok(validate(document), JSON.stringify(validate.errors, null, 2));
  assert.equal(document.bomFormat, "CycloneDX");
  assert.equal(document.specVersion, "1.5");
  assert.deepEqual(document.metadata, {
    timestamp: "2026-10-29T12:00:00Z",
    tools: { components: [{ type: "application", name: "evergreen", version: VERSION, "bom-ref": "evergreen" }] },
  });

  const vulnerabilities = document.vulnerabilities as Array<Record<string, unknown>>;
  assert.equal(vulnerabilities.length, 3);
  assert.deepEqual(vulnerabilities.map((entry) => entry.id), [
    "evergreen:nodejs.18",
    "evergreen:npm.left-pad",
    "GHSA-p8p7-x288-28g6",
  ]);

  const exposed = vulnerabilities.find((entry) => entry.id === "GHSA-p8p7-x288-28g6")!;
  assert.deepEqual(exposed.analysis, {
    state: "exploitable",
    detail: exposureFromUsage(findings[0]!).detail,
  });
  assert.deepEqual(exposed.affects, [{ ref: "npm.request@2.88.2" }]);
  assert.deepEqual(exposed.properties, [
    { name: VEX_EVIDENCE_LOCATION_PROPERTY, value: "declaration:package.json:12" },
    { name: VEX_EVIDENCE_LOCATION_PROPERTY, value: "usage:src/client.js:3" },
    { name: VEX_EVIDENCE_LOCATION_PROPERTY, value: "usage:src/client.js:10" },
  ]);
  assert.equal(exposed.recommendation, "Replace with undici.");

  const clear = vulnerabilities.find((entry) => entry.id === "evergreen:npm.left-pad")!;
  assert.deepEqual(clear.analysis, {
    state: "not_affected",
    justification: "code_not_reachable",
    detail: exposureFromUsage(findings[1]!).detail,
  });

  const triage = vulnerabilities.find((entry) => entry.id === "evergreen:nodejs.18")!;
  assert.deepEqual((triage.analysis as { state: string }).state, "in_triage");
  assert.deepEqual(triage.properties, [
    { name: VEX_EVIDENCE_LOCATION_PROPERTY, value: "declaration:package.json:5" },
  ]);
});

test("exportVex is deterministic and omits optional metadata when not provided", () => {
  const first = exportVex(findings);
  const second = exportVex([...findings].reverse());
  assert.deepEqual(first, second);
  assert.equal("serialNumber" in first, false);
  assert.equal("timestamp" in (first.metadata as object), false);
  assert.ok(validate(first), JSON.stringify(validate.errors, null, 2));
  assert.deepEqual(exportVex([]).vulnerabilities, []);
  assert.ok(validate(exportVex([])), JSON.stringify(validate.errors, null, 2));
});
