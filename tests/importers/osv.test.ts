import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { OSV_CANDIDATES } from "../../tools/importers/osv-candidates.js";
import { isUnfixedForPackage, osvImporter, queryBody } from "../../tools/importers/osv.js";
import { execute } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/osv.json");

test("drafts unfixed OSV advisories for every candidate that has them, from the recording", async () => {
  const drafts = await execute(osvImporter, { replay: recording });
  assert.deepEqual(
    drafts.rules.map((rule) => rule.id),
    ["osv.npm.request", "osv.pypi.pycrypto"],
  );
  const request = drafts.rules.find((rule) => rule.id === "osv.npm.request")!;
  assert.equal(request.purl, "pkg:npm/request");
  assert.equal(request.ecosystem, "osv");
  assert.deepEqual(request["x-osv"], { ids: ["GHSA-p8p7-x288-28g6"], ruleId: "npm.package.request.deprecated" });
  assert.equal(request.sources[0]?.url, "https://osv.dev/vulnerability/GHSA-p8p7-x288-28g6");

  const pycrypto = drafts.rules.find((rule) => rule.id === "osv.pypi.pycrypto")!;
  assert.deepEqual(pycrypto["x-osv"], {
    ids: ["GHSA-6528-wvf6-f6qg", "GHSA-cq27-v7xp-c356", "PYSEC-2018-97"],
    ruleId: "python.package.pycrypto.obsolete",
  });
  assert.deepEqual(drafts.notes, []);
});

test("every candidate has a unique rule id and a stable query body", () => {
  assert.equal(new Set(OSV_CANDIDATES.map((candidate) => candidate.ruleId)).size, OSV_CANDIDATES.length);
  assert.equal(new Set(OSV_CANDIDATES.map((candidate) => candidate.osvRuleId)).size, OSV_CANDIDATES.length);
  assert.deepEqual(
    OSV_CANDIDATES.map((candidate) => candidate.ruleId),
    [...OSV_CANDIDATES].map((candidate) => candidate.ruleId).sort(),
  );
  assert.equal(
    queryBody(OSV_CANDIDATES[0]!),
    JSON.stringify({ package: { name: "request", ecosystem: "npm" } }),
  );
});

test("an advisory with a fixed event is not unfixed; last_affected alone is", () => {
  assert.equal(
    isUnfixedForPackage(
      {
        id: "GHSA-fixed",
        affected: [{ package: { name: "request" }, ranges: [{ events: [{ introduced: "0" }, { fixed: "2.68.0" }] }] }],
      },
      "request",
    ),
    false,
  );
  assert.equal(
    isUnfixedForPackage(
      {
        id: "GHSA-open",
        affected: [{ package: { name: "request" }, ranges: [{ events: [{ introduced: "0" }, { last_affected: "2.88.2" }] }] }],
      },
      "request",
    ),
    true,
  );
  assert.equal(isUnfixedForPackage({ id: "GHSA-withdrawn", withdrawn: "2020-01-01", affected: [] }, "request"), false);
});
