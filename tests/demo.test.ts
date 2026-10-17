import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket } from "../src/migration-packet.js";

test("the public demo exercises discovery and migration context", async () => {
  const result = await scanRepository(resolve("examples/demo"), builtInDetectors);
  assert.deepEqual(result.findings.map((finding) => finding.ruleId), [
    "github-actions.checkout.node20",
    "nodejs.runtime.eol-18",
    "nodejs.runtime.eol-19",
    "nodejs.runtime.eol-20",
    "npm.package.request.deprecated",
  ]);

  const request = result.findings.find(
    (finding) => finding.ruleId === "npm.package.request.deprecated",
  );
  assert.ok(request);
  const packet = createMigrationPacket(result, request.id);
  assert.deepEqual(packet.affectedFiles, [
    "package.json",
    "src/client.js",
  ]);
});
