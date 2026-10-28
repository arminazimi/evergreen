import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { jsonLocations, lintRegistryTexts, lintRulePaths, renderRuleLintText } from "../src/rule-lint.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const fixture = (name: string) => resolve("tests/fixtures/rule-lint", name);

async function lint(...names: string[]) {
  return lintRegistryTexts(await Promise.all(names.map(async (name) => ({ path: `tests/fixtures/rule-lint/${name}`, text: await readFile(fixture(name), "utf8") }))));
}

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, "rules", ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

test("a valid registry has no problems", async () => {
  const result = await lint("valid.json", "replacement-known.json");
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.files, ["tests/fixtures/rule-lint/replacement-known.json", "tests/fixtures/rule-lint/valid.json"]);
  assert.equal(renderRuleLintText(result), "No rule problems in 2 files.");
});

test("a schema error names the file, the rule's line, and a fix hint", async () => {
  const result = await lint("schema.json");
  const problem = result.problems.find((entry) => entry.kind === "schema")!;
  assert.ok(problem, "a schema problem");
  assert.match(problem.message, /summary is required/);
  assert.equal(problem.ruleId, "example.package.nosummary.deprecated");
  assert.equal(problem.line, jsonLocations(await readFile(fixture("schema.json"), "utf8")).get("rules.0.id"));
  assert.match(problem.hint, /schemas\/registry\.v2\.schema\.json/);
});

test("dates order points at the rule and says how to fix it", async () => {
  const text = await readFile(fixture("dates.json"), "utf8");
  const result = await lint("dates.json");
  const problem = result.problems.find((entry) => entry.kind === "dates")!;
  assert.ok(problem, "a dates problem");
  assert.match(problem.message, /reviewedAt must not be earlier than provenance\.observedAt/);
  assert.equal(problem.line, jsonLocations(text).get("rules.0.provenance.reviewedAt"));
  assert.match(problem.hint, /reviewedAt to observedAt or later/);
});

test("a non-https source URL is reported at the URL", async () => {
  const text = await readFile(fixture("source-url.json"), "utf8");
  const result = await lint("source-url.json");
  const problem = result.problems.find((entry) => entry.kind === "source-url")!;
  assert.ok(problem, "a source-url problem");
  assert.match(problem.message, /sources\[0\]\.url must be an https URL/);
  assert.equal(problem.line, jsonLocations(text).get("rules.0.sources.0.url"));
  assert.match(problem.hint, /https:\/\//);
});

test("a duplicated id inside one file points at the second definition", async () => {
  const text = await readFile(fixture("duplicate.json"), "utf8");
  const result = await lint("duplicate.json");
  const problem = result.problems.find((entry) => entry.kind === "duplicate-id")!;
  assert.ok(problem, "a duplicate-id problem");
  assert.equal(problem.ruleId, "example.package.dup.deprecated");
  assert.equal(problem.line, jsonLocations(text).get("rules.1.id"));
  assert.match(problem.message, new RegExp(`first defined at line ${jsonLocations(text).get("rules.0.id")}`));
});

test("a duplicated id across files names the file that defined it first", async () => {
  const result = await lint("duplicate.json", "duplicate-other.json");
  const problem = result.problems.find((entry) => entry.kind === "duplicate-id" && entry.file.endsWith("duplicate-other.json"))!;
  assert.ok(problem, "a cross-file duplicate-id problem");
  assert.equal(problem.line, 6);
  assert.match(problem.message, /already defined in tests\/fixtures\/rule-lint\/duplicate\.json:6/);
});

test("a replacement that names an unknown rule id is reported", async () => {
  const result = await lint("replacement.json");
  const problem = result.problems.find((entry) => entry.kind === "replacement-reference")!;
  assert.ok(problem, "a replacement-reference problem");
  assert.match(problem.message, /references rule "example\.package\.missing\.rule", which is not defined/);
  assert.equal(problem.line, 14);
  assert.match(problem.hint, /existing rule id/);
});

test("a replacement that names a rule in the same run resolves", async () => {
  const result = await lint("valid.json", "replacement-known.json");
  assert.equal(result.problems.filter((entry) => entry.kind === "replacement-reference").length, 0);
});

test("invalid JSON is a schema problem at its line", async () => {
  const result = await lint("invalid.json");
  assert.equal(result.problems.length, 1);
  const problem = result.problems[0]!;
  assert.equal(problem.kind, "schema");
  assert.match(problem.message, /not valid JSON/);
  assert.ok(problem.line >= 4, `line ${problem.line}`);
});

test("a directory lints only registry files and a missing path is an error", async () => {
  const directory = await lintRulePaths(["tests/fixtures/rule-lint"]);
  assert.ok(directory.files.length >= 7);
  assert.ok(directory.problems.length > 0);
  await assert.rejects(lintRulePaths(["tests/fixtures/rule-lint/missing.json"]), /Cannot read/);
});

test("the bundled registry has no rule problems", async () => {
  const result = await lintRulePaths(["registry"]);
  assert.deepEqual(result.problems, []);
});

test("the command exits 0 on valid rules and 1 with the location and hint on problems", async () => {
  const valid = await run("lint", "tests/fixtures/rule-lint/valid.json");
  assert.equal(valid.code, 0);
  assert.match(valid.stdout, /No rule problems in 1 file\./);

  const broken = await run("lint", "tests/fixtures/rule-lint/dates.json");
  assert.equal(broken.code, 1);
  const datesLine = jsonLocations(await readFile(fixture("dates.json"), "utf8")).get("rules.0.provenance.reviewedAt");
  assert.match(broken.stdout, new RegExp(`tests/fixtures/rule-lint/dates\\.json:${datesLine}: \\[dates\\]`));
  assert.match(broken.stdout, /hint: Use real YYYY-MM-DD dates/);
});

test("--json prints the same problems for tooling", async () => {
  const result = await run("lint", "tests/fixtures/rule-lint/source-url.json", "--json");
  assert.equal(result.code, 1);
  const parsed = JSON.parse(result.stdout) as { schemaVersion: string; problems: Array<{ kind: string; file: string; line: number }> };
  assert.equal(parsed.schemaVersion, "evergreen.rules-lint.v1");
  assert.equal(parsed.problems[0]!.kind, "source-url");
  assert.match(parsed.problems[0]!.file, /source-url\.json$/);
  assert.equal(typeof parsed.problems[0]!.line, "number");
});

test("unknown subcommands and flags are usage errors", async () => {
  assert.equal((await run("lint", "--strict")).code, 2);
  assert.equal((await run("check")).code, 2);
  assert.match((await run("lint", "tests/fixtures/rule-lint/missing.json")).stderr, /Cannot read/);
});
