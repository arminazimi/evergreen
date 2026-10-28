import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";

import { findRule, renderRuleTestText, testRule } from "../src/rule-test.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const RULE = "npm.package.request.deprecated";

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, "rules", ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

async function fixtureRoot(t: TestContext, packages: { match?: string; clean?: string }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rule-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, dependency] of Object.entries(packages)) {
    if (dependency === undefined) continue;
    const directory = join(root, RULE, name);
    await mkdir(directory, { recursive: true });
    const version = dependency === "express" ? "4.18.2" : "2.88.2";
    await writeFile(join(directory, "package.json"), `${JSON.stringify({ name: "fixture", private: true, dependencies: { [dependency]: version } }, null, 2)}\n`);
  }
  return root;
}

test("a rule passes when match reports it and clean does not", async (t) => {
  const root = await fixtureRoot(t, { match: "request", clean: "express" });
  const rule = (await findRule(RULE))!;
  const outcome = await testRule(rule, { fixturesDirectory: root });
  assert.equal(outcome.passed, true);
  assert.equal(outcome.match.findings.length, 1);
  assert.equal(outcome.clean.findings.length, 0);
  assert.match(renderRuleTestText([outcome]), new RegExp(`PASS ${RULE.replaceAll(".", "\\.")} \\(match: 1 finding, clean: 0 findings\\)`));
});

test("a clean fixture that reports the rule fails with the actual finding", async (t) => {
  const root = await fixtureRoot(t, { match: "request", clean: "request" });
  const outcome = await testRule((await findRule(RULE))!, { fixturesDirectory: root });
  assert.equal(outcome.passed, false);
  const problem = outcome.problems.find((entry) => entry.includes("expected no findings"))!;
  assert.ok(problem, outcome.problems.join("\n"));
  assert.match(problem, new RegExp(`expected no findings for "${RULE.replaceAll(".", "\\.")}"`));
  assert.match(problem, /package\.json:5 \(high\) request /);
  const text = renderRuleTestText([outcome]);
  assert.match(text, new RegExp(`FAIL ${RULE.replaceAll(".", "\\.")}`));
  assert.match(text, /1 of 1 rule fixture failed\./);
});

test("a match fixture without the rule fails with expected and actual", async (t) => {
  const root = await fixtureRoot(t, { match: "express", clean: "express" });
  const outcome = await testRule((await findRule(RULE))!, { fixturesDirectory: root });
  assert.equal(outcome.passed, false);
  assert.ok(outcome.problems.some((entry) => entry.includes("expected at least one finding") && entry.includes("actual: none")), outcome.problems.join("\n"));
});

test("a rule without both fixtures fails and names each missing directory", async (t) => {
  const root = await fixtureRoot(t, {});
  const outcome = await testRule((await findRule(RULE))!, { fixturesDirectory: root });
  assert.equal(outcome.passed, false);
  assert.equal(outcome.problems.length, 2);
  assert.ok(outcome.problems.some((entry) => entry.includes(`${RULE}/match: missing`)), outcome.problems.join("\n"));
  assert.ok(outcome.problems.some((entry) => entry.includes(`${RULE}/clean: missing`)), outcome.problems.join("\n"));
});

test("the command passes the shipped example fixtures and fails a broken clean fixture with the rule named", async (t) => {
  const passing = await run("test", RULE);
  assert.equal(passing.code, 0, passing.stderr);
  assert.match(passing.stdout, new RegExp(`PASS ${RULE.replaceAll(".", "\\.")}`));

  const root = await fixtureRoot(t, { match: "request", clean: "request" });
  const failing = await run("test", RULE, "--fixtures", root);
  assert.equal(failing.code, 1);
  assert.match(failing.stdout, new RegExp(`FAIL ${RULE.replaceAll(".", "\\.")}`));
  assert.match(failing.stdout, /expected no findings/);
});

test("an unknown rule id is a usage error that names the id", async () => {
  const result = await run("test", "npm.package.missing.deprecated");
  assert.equal(result.code, 2);
  assert.match(result.stderr, /No rule with id "npm\.package\.missing\.deprecated"/);
});

test("test needs at least one id and rejects unknown flags", async () => {
  assert.equal((await run("test")).code, 2);
  assert.equal((await run("test", RULE, "--changed")).code, 2);
  assert.equal((await run("test", RULE, "--fixtures")).code, 2);
});

test("findRule reads the bundled registry and returns nothing for an unknown id", async () => {
  assert.equal((await findRule(RULE))?.id, RULE);
  assert.equal(await findRule("npm.package.missing.deprecated"), undefined);
});
