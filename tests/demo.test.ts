import { rm } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test, after } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanDemo } from "../src/demo.js";
import { scanRepository } from "../src/engine/index.js";
import { createMigrationPacket } from "../src/migration-packet.js";

import { copyFixtureTree } from "./fixture-copies.js";

const demoRoots: string[] = [];
const demoFixture = await copyFixtureTree(resolve("examples/demo"), demoRoots);
after(async () => {
  await Promise.all(demoRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test("the public demo exercises discovery and migration context", async () => {
  const result = await scanRepository(demoFixture, builtInDetectors);
  assert.deepEqual(
    result.findings.map((finding) => finding.ruleId),
    [
      "github-actions.checkout.node20",
      "nodejs.runtime.eol-18",
      "nodejs.runtime.eol-19",
      "nodejs.runtime.eol-20",
      "npm.package.request.deprecated",
    ],
  );

  const request = result.findings.find((finding) => finding.ruleId === "npm.package.request.deprecated");
  assert.ok(request);
  const packet = createMigrationPacket(result, request.id);
  assert.deepEqual(packet.affectedFiles, ["package.json", "src/client.js"]);
});

test("scanDemo scans an in-memory fixture and yields explained findings", async () => {
  const result = await scanDemo(builtInDetectors);
  assert.equal(result.root, "demo");
  assert.deepEqual(
    result.findings.map((finding) => finding.ruleId),
    [
      "github-actions.checkout.node20",
      "nodejs.runtime.eol-18",
      "nodejs.runtime.eol-19",
      "nodejs.runtime.eol-20",
      "npm.package.request.deprecated",
    ],
  );

  const request = result.findings.find((finding) => finding.ruleId === "npm.package.request.deprecated");
  assert.ok(request);
  assert.equal(request.usages?.length, 2);
  const packet = createMigrationPacket(result, request.id);
  assert.deepEqual(packet.affectedFiles, ["package.json", "src/client.js"]);
});
