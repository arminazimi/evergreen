import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

const fixture = resolve("tests/fixtures/toolchain/seaworthy-monorepo");

interface Observed {
  detector: string;
  ruleId: string;
  path: string;
  line: number | undefined;
}

const scan = async () => {
  const result = await scanRepository(fixture, builtInDetectors, { noCache: true });
  return result.findings
    .map<Observed>((finding) => ({ detector: finding.detector, ruleId: finding.ruleId, path: finding.location.path, line: finding.location.line }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path) || (left.line ?? 0) - (right.line ?? 0));
};

test("the monorepo has the files the workspace build reads", async () => {
  for (const path of [
    "package.json",
    "package-lock.json",
    "packages/verify/package.json",
    "packages/action/package.json",
    "packages/action/.nvmrc",
    "packages/mcp/package.json",
    "action.yml",
    ".github/workflows/ci.yml",
  ]) {
    await access(join(fixture, path));
  }
});

test("workspace discovery reports each package's own manifest", async () => {
  assert.deepEqual(await scan(), [
    { detector: "github-actions", ruleId: "github-actions.checkout.node20", path: ".github/workflows/ci.yml", line: 15 },
    { detector: "npm", ruleId: "nodejs.runtime.eol-20", path: "packages/action/.nvmrc", line: 1 },
    { detector: "npm", ruleId: "npm.package.node-sass.deprecated", path: "packages/mcp/package.json", line: 10 },
    { detector: "npm", ruleId: "npm.package.node-sass.eol", path: "packages/mcp/package.json", line: 10 },
    { detector: "npm", ruleId: "npm.package.request.deprecated", path: "packages/verify/package.json", line: 10 },
  ]);
});

test("every path is repository-relative and names the package that holds the declaration", async () => {
  for (const finding of await scan()) {
    assert.equal(isAbsolute(finding.path), false, finding.path);
    assert.ok(!finding.path.includes("\\") && !finding.path.split("/").includes(".."), finding.path);
    assert.notEqual(finding.line, undefined, finding.path);
  }
  const packages = new Map([
    ["npm.package.request.deprecated", "packages/verify/"],
    ["npm.package.node-sass.deprecated", "packages/mcp/"],
    ["npm.package.node-sass.eol", "packages/mcp/"],
    ["nodejs.runtime.eol-20", "packages/action/"],
  ]);
  for (const finding of await scan()) {
    const prefix = packages.get(finding.ruleId);
    if (prefix) assert.ok(finding.path.startsWith(prefix), `${finding.ruleId} is at ${finding.path}`);
  }
});

test("two scans produce the same output", async () => {
  assert.deepEqual(await scan(), await scan());
});
