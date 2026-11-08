import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { loadDataFile } from "@velella/ebb/data-source";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { validateRegistryV2 } from "@velella/ebb/registry";
import { checkUpgrade } from "../src/upgrade/index.js";
import type { UpgradeIssue, UpgradeReport } from "../src/upgrade/types.js";

const root = join(import.meta.dirname, "..", "..");
const fixture = join(root, "tests", "fixtures", "upgrade", "node-apis", "mixed");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((directory) => rm(directory, { recursive: true, force: true })));
});

function issue(overrides: Partial<UpgradeIssue>): UpgradeIssue {
  return {
    analyzer: "node-apis",
    level: "blocker",
    subject: "subject",
    path: "app.js",
    line: 1,
    reason: "reason",
    evidence: { kind: "rule", value: "nodejs.symbol.subject" },
    ...overrides,
  };
}

function report(version: string, directory = fixture): Promise<UpgradeReport> {
  return checkUpgrade(directory, { runtime: "nodejs", version });
}

async function rule(id: string): Promise<RegistryV2Rule> {
  const registry = validateRegistryV2(await loadDataFile("registry/nodejs.json"));
  const found = registry.rules.find((entry) => entry.id === id);
  assert.ok(found, `${id} is in the registry`);
  return found;
}

test("an API the target removed is a blocker at its exact location, from the rule data", async () => {
  const result = await report("24");
  const removed = await rule("nodejs.symbol.util.isstring");
  assert.equal(result.verdict, "blocked");
  assert.deepEqual(result.analyzers, ["node-apis"]);
  assert.deepEqual(
    result.issues[0],
    issue({
      level: "blocker",
      subject: "util.isString",
      line: 4,
      reason: removed.summary,
      evidence: { kind: "rule", value: "nodejs.symbol.util.isstring" },
    }),
  );
});

test("an API the target deprecated is a warning, and a later deprecation is not reported", async () => {
  const result = await report("24");
  const deprecated = await rule("nodejs.symbol.util.isarray");
  assert.deepEqual(
    result.issues.map((entry) => [entry.level, entry.subject, entry.line, entry.evidence.value]),
    [
      ["blocker", "util.isString", 4, "nodejs.symbol.util.isstring"],
      ["warning", "util.isArray", 5, "nodejs.symbol.util.isarray"],
    ],
  );
  assert.equal(result.issues[1]?.reason, deprecated.summary);
  assert.ok(!result.issues.some((entry) => entry.subject === "util.types.isNativeError"));
});

test("an API removed or deprecated after the target produces no issue", async () => {
  const result = await report("22");
  assert.equal(result.verdict, "ready");
  assert.deepEqual(
    result.issues.map((entry) => [entry.level, entry.subject, entry.line]),
    [["warning", "util.isArray", 5]],
  );
});

test("the analyzer does not apply to a repository without a Node.js symbol usage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-upgrade-node-apis-"));
  temporaryRoots.push(directory);
  await writeFile(join(directory, "package.json"), '{"name":"fixture"}');
  await writeFile(join(directory, "app.js"), 'const fs = require("node:fs");\nfs.access("x", () => {});\n');
  const result = await report("24", directory);
  assert.deepEqual(result, {
    schemaVersion: "evergreen.upgrade.v1",
    target: { runtime: "nodejs", version: "24" },
    verdict: "unknown",
    analyzers: [],
    issues: [],
  });
});

test("every judged symbol rule carries a machine-readable range and usage matchers", async () => {
  const registry = validateRegistryV2(await loadDataFile("registry/nodejs.json"));
  const judged = registry.rules.filter(
    (entry) => entry.id.startsWith("nodejs.symbol.") && (entry.event === "removed" || entry.event === "deprecated"),
  );
  assert.ok(judged.length > 0);
  for (const entry of judged) {
    assert.ok(entry.vers.startsWith("vers:semver/"), `${entry.id} carries a machine-readable range`);
    assert.ok(entry.usage && entry.usage.length > 0, `${entry.id} carries usage matchers`);
  }
});
