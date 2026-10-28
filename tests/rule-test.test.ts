import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { renderRuleTestText, RuleTestError, testRule } from "../src/rule-test.js";

const execute = promisify(execFile);
const roots: string[] = [];

after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

const requestRule = "npm.package.request.deprecated";
const existsRule = "nodejs.symbol.fs.exists";

async function fixtures(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rule-test-"));
  roots.push(root);
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      const absolute = join(root, path);
      await mkdir(dirname(absolute), { recursive: true });
      await writeFile(absolute, contents);
    }),
  );
  return root;
}

const requestMatch = {
  [`${requestRule}/match/package.json`]: JSON.stringify({ dependencies: { request: "^2.88.0" } }, null, 2),
  [`${requestRule}/match/package-lock.json`]: JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/request": { version: "2.88.2" } } }, null, 2),
  [`${requestRule}/clean/package.json`]: JSON.stringify({ dependencies: { "left-pad": "^1.3.0" } }, null, 2),
  [`${requestRule}/clean/package-lock.json`]: JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/left-pad": { version: "1.3.0" } } }, null, 2),
};

test("a rule passes when the match fixture reports it and the clean fixture does not", async () => {
  const root = await fixtures(requestMatch);
  const result = await testRule(requestRule, { fixturesRoot: root });
  assert.equal(result.passed, true, renderRuleTestText(result));
  assert.equal(result.registry, "registry/npm.json");
  assert.equal(result.fixtures[0]!.findings.length, 1);
  assert.equal(result.fixtures[1]!.findings.length, 0);
  assert.match(renderRuleTestText(result), /^Passed npm\.package\.request\.deprecated/);
});

test("a match fixture that reports nothing fails and says what was expected", async () => {
  const root = await fixtures({ ...requestMatch, [`${requestRule}/match/package.json`]: JSON.stringify({ dependencies: { "left-pad": "^1.3.0" } }) });
  const result = await testRule(requestRule, { fixturesRoot: root });
  assert.equal(result.passed, false);
  assert.equal(result.fixtures[0]!.passed, false);
  assert.match(result.fixtures[0]!.problem ?? "", /expected at least one finding for "npm\.package\.request\.deprecated"; got none/);
  assert.match(renderRuleTestText(result), /^Failed /);
});

test("a clean fixture that reports the rule fails", async () => {
  const root = await fixtures({ ...requestMatch, [`${requestRule}/clean/package.json`]: JSON.stringify({ dependencies: { request: "^2.88.0" } }) });
  const result = await testRule(requestRule, { fixturesRoot: root });
  assert.equal(result.passed, false);
  assert.equal(result.fixtures[1]!.passed, false);
  assert.ok(result.fixtures[1]!.findings.length > 0);
  assert.match(result.fixtures[1]!.problem ?? "", /expected no findings/);
});

test("a rule without both fixtures fails the harness", async () => {
  const root = await fixtures({ [`${requestRule}/match/package.json`]: requestMatch[`${requestRule}/match/package.json`]! });
  const result = await testRule(requestRule, { fixturesRoot: root });
  assert.equal(result.passed, false);
  assert.match(result.fixtures[1]!.problem ?? "", /missing fixture: .*npm\.package\.request\.deprecated\/clean is not a directory/);
});

test("usage matchers observe a rule when no detector finding is available", async () => {
  const root = await fixtures({
    [`${existsRule}/match/index.js`]: 'const fs = require("fs");\nfs.exists("a.txt", () => {});\n',
    [`${existsRule}/clean/index.js`]: 'const fs = require("fs");\nfs.access("a.txt", () => {});\n',
  });
  const result = await testRule(existsRule, { fixturesRoot: root });
  assert.equal(result.passed, true, renderRuleTestText(result));
  assert.equal(result.fixtures[0]!.findings.length, 0);
  assert.equal(result.fixtures[0]!.usages.length, 1);
  assert.equal(result.fixtures[0]!.usages[0]!.path, "index.js");
});

test("an unknown rule is a clear error", async () => {
  await assert.rejects(testRule("npm.package.does-not-exist.deprecated"), (error: unknown) => error instanceof RuleTestError && /No rule has the id/.test(error.message));
});

test("the command exits 0 on a pass, 1 on a failure, and 2 on an unknown rule", async () => {
  const cli = resolve("dist/src/cli.js");
  const rule = (JSON.parse(await readFile(resolve("registry/npm.json"), "utf8")) as { rules: Array<{ id: string }> }).rules.find((candidate) => candidate.id === requestRule);
  assert.ok(rule);
  const checkoutFixtures = Object.fromEntries(Object.entries(requestMatch).map(([path, contents]) => [`tests/fixtures/${path}`, contents]));
  const root = await fixtures({ ...checkoutFixtures, "registry/npm.json": `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [rule] }, null, 2)}\n` });
  const run = (args: string[]) =>
    execute(process.execPath, [cli, ...args], { cwd: root }).then(
      (value) => ({ code: 0, ...value }),
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

  const passed = await run(["rules", "test", requestRule]);
  assert.equal(passed.code, 0, passed.stdout + passed.stderr);
  assert.match(passed.stdout, /^Passed npm\.package\.request\.deprecated/);

  const clean = join(root, "tests", "fixtures", requestRule, "clean");
  await writeFile(join(clean, "package.json"), JSON.stringify({ dependencies: { request: "^2.88.0" } }));
  await writeFile(join(clean, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/request": { version: "2.88.2" } } }));
  const failed = await run(["rules", "test", requestRule]);
  assert.equal(failed.code, 1);
  assert.match(failed.stdout, /^Failed /);

  const unknown = await run(["rules", "test", "npm.package.does-not-exist.deprecated"]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /No rule has the id/);

  assert.equal((await run(["rules", "test"])).code, 2);
  assert.equal((await run(["rules", "test", "--json"])).code, 2);
  assert.equal((await run(["rules", "lint"])).code, 0, "the earlier command still works");
});
