import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

interface ExpectedFinding {
  ruleId: string;
  path: string;
  severity: string;
}

interface Expected {
  ecosystem: string;
  findings: ExpectedFinding[];
}

const root = "examples/gallery";

const ECOSYSTEMS = [
  "android",
  "ci-images",
  "container",
  "cpp",
  "dart",
  "database",
  "deno",
  "dotnet",
  "elixir",
  "github-actions",
  "go",
  "java",
  "kubernetes",
  "nodejs",
  "npm",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "serverless",
  "shell",
  "swift",
  "terraform",
];

const order = (left: ExpectedFinding, right: ExpectedFinding) =>
  left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path) || left.severity.localeCompare(right.severity);

const observed = async (directory: string): Promise<ExpectedFinding[]> => {
  const scan = await scanRepository(directory, builtInDetectors, { noCache: true });
  return scan.findings.map((finding) => ({ ruleId: finding.ruleId, path: finding.location.path, severity: finding.severity })).sort(order);
};

test("every gallery example produces exactly its expected findings", async () => {
  const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.deepEqual(directories, ECOSYSTEMS, "one example directory per supported ecosystem");

  for (const ecosystem of ECOSYSTEMS) {
    const directory = join(root, ecosystem);
    const expected = JSON.parse(await readFile(join(directory, "expected.json"), "utf8")) as Expected;
    assert.equal(expected.ecosystem, ecosystem);
    assert.ok(expected.findings.length > 0, `${ecosystem} declares at least one finding`);

    const actual = await observed(directory);
    assert.deepEqual(actual, expected.findings.sort(order), `${ecosystem} scan matches expected.json`);
    for (const { path } of actual) await access(join(directory, path));

    assert.deepEqual(await observed(directory), actual, `${ecosystem} scan is deterministic`);
  }
});
