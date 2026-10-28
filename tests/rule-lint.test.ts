import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { defaultRuleFiles, lintRuleFiles, renderRuleLintText } from "../src/rule-lint.js";

const execute = promisify(execFile);
const roots: string[] = [];

after(() => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true }))));

const lineOf = (text: string, needle: string): number => {
  const index = text.indexOf(needle);
  assert.notEqual(index, -1, `missing ${needle}`);
  return text.slice(0, index).split("\n").length;
};

const display = (file: string): string => relative(process.cwd(), resolve(file)).replaceAll("\\", "/");

function validRule(id = "npm.package.sample.deprecated"): Record<string, unknown> {
  return {
    id,
    ecosystem: "npm",
    purl: "pkg:npm/sample-package",
    vers: "vers:npm/*",
    event: "deprecated",
    title: "Sample package is deprecated",
    summary: "The package is deprecated and no new changes are expected.",
    severity: "high",
    sources: [{ title: "Sample notice", url: "https://example.com/sample" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "tester" },
    "x-npm": { package: "sample-package" },
  };
}

function registry(rules: unknown[]): string {
  return `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules }, null, 2)}\n`;
}

async function registryDirectory(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rule-lint-"));
  roots.push(root);
  const directory = join(root, "registry");
  await mkdir(directory, { recursive: true });
  await Promise.all(Object.entries(files).map(([name, contents]) => writeFile(join(directory, name), contents)));
  return directory;
}

test("every bundled registry passes, so the linter agrees with what ships", async () => {
  const result = await lintRuleFiles(await defaultRuleFiles(resolve(".")));
  assert.deepEqual(result.issues, []);
  assert.ok(result.rules > 500, `expected the bundled rules, saw ${result.rules}`);
  assert.match(renderRuleLintText(result), /no problems\./);
});

test("an http source is reported at its own line with an https hint", async () => {
  const rule = validRule();
  (rule.sources as Array<{ url: string }>)[0]!.url = "http://example.com/sample";
  const text = registry([rule]);
  const directory = await registryDirectory({ "npm.json": text });
  const file = join(directory, "npm.json");

  const result = await lintRuleFiles([file]);
  assert.equal(result.issues.length, 1);
  const [issue] = result.issues;
  assert.equal(issue!.file, display(file));
  assert.equal(issue!.line, lineOf(text, '"sources"'));
  assert.equal(issue!.ruleId, "npm.package.sample.deprecated");
  assert.match(issue!.message, /sources\[0\]\.url must be an https URL/);
  assert.match(issue!.hint, /https/);
  assert.match(renderRuleLintText(result), new RegExp(`${display(file)}:${issue!.line}:`));
});

test("reviewedAt before observedAt is reported at provenance with a fix hint", async () => {
  const rule = validRule();
  (rule.provenance as { reviewedAt: string }).reviewedAt = "2026-09-01";
  const text = registry([rule]);
  const directory = await registryDirectory({ "npm.json": text });

  const result = await lintRuleFiles([join(directory, "npm.json")]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]!.line, lineOf(text, '"provenance"'));
  assert.match(result.issues[0]!.message, /reviewedAt must not be earlier than provenance\.observedAt/);
  assert.match(result.issues[0]!.hint, /observedAt/);
});

test("a duplicate id in one file is an error at the second rule", async () => {
  const text = registry([validRule(), validRule()]);
  const directory = await registryDirectory({ "npm.json": text });

  const result = await lintRuleFiles([join(directory, "npm.json")]);
  assert.ok(result.issues.some((issue) => /id is duplicated/.test(issue.message)));
  assert.ok(result.issues.every((issue) => issue.line >= 1));
});

test("a duplicate id across files names both locations", async () => {
  const first = registry([validRule()]);
  const second = registry([validRule()]);
  const directory = await registryDirectory({ "a.json": first, "b.json": second });

  const result = await lintRuleFiles([join(directory, "a.json"), join(directory, "b.json")]);
  assert.equal(result.issues.length, 1);
  const [issue] = result.issues;
  assert.match(issue!.message, /duplicate rule id "npm\.package\.sample\.deprecated"/);
  assert.match(issue!.message, new RegExp(`${display(join(directory, "a.json"))}:${lineOf(first, '"id"')}`));
  assert.equal(issue!.line, lineOf(second, '"id"'));
  assert.match(issue!.hint, /global/);
});

test("invalid JSON is reported at the failing line", async () => {
  const text = '{\n  "schemaVersion": "evergreen.registry.v2",\n  "rules": [\n}\n';
  const directory = await registryDirectory({ "npm.json": text });

  const result = await lintRuleFiles([join(directory, "npm.json")]);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]!.message, /invalid JSON/);
  assert.ok(result.issues[0]!.line >= 3, `line ${result.issues[0]!.line}`);
  assert.match(result.issues[0]!.hint, /JSON syntax/);
});

test("a replacement requirement naming an unknown runtime is an error", async () => {
  const rule = validRule();
  rule.requires = { deno: "2.0.0" };
  const text = registry([rule]);
  const directory = await registryDirectory({ "npm.json": text });

  const result = await lintRuleFiles([join(directory, "npm.json")]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]!.line, lineOf(text, '"requires"'));
  assert.match(result.issues[0]!.message, /requires has unknown runtime "deno"/);
  assert.match(result.issues[0]!.hint, /node and python/);
});

test("an unknown field is reported with a field hint", async () => {
  const rule = validRule();
  rule.typo = true;
  const text = registry([rule]);
  const directory = await registryDirectory({ "npm.json": text });

  const result = await lintRuleFiles([join(directory, "npm.json")]);
  assert.ok(result.issues.some((issue) => /unknown field "typo"/.test(issue.message) && /x-<ecosystem>/.test(issue.hint)));
});

test("the command exits 1 on problems, 0 on clean files, and 2 on misuse", async () => {
  const cli = resolve("dist/src/cli.js");
  const run = (args: string[], cwd: string) =>
    execute(process.execPath, [cli, ...args], { cwd }).then(
      (value) => ({ code: 0, ...value }),
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

  const cleanDirectory = await registryDirectory({ "npm.json": registry([validRule()]) });
  const clean = await run(["rules", "lint", join(cleanDirectory, "npm.json")], resolve("."));
  assert.equal(clean.code, 0, clean.stderr);
  assert.match(clean.stdout, /no problems\./);

  const badRule = validRule();
  (badRule.sources as Array<{ url: string }>)[0]!.url = "http://example.com/sample";
  const badDirectory = await registryDirectory({ "npm.json": `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [badRule] }, null, 2)}\n` });
  const bad = await run(["rules", "lint", join(badDirectory, "npm.json")], resolve("."));
  assert.equal(bad.code, 1, bad.stderr);
  assert.match(bad.stdout, /must be an https URL/);
  assert.match(bad.stdout, /hint: /);

  assert.equal((await run(["rules"], resolve("."))).code, 2);
  assert.equal((await run(["rules", "fix"], resolve("."))).code, 2);
  assert.equal((await run(["rules", "lint", "--json"], resolve("."))).code, 2);

  const outside = await mkdtemp(join(tmpdir(), "evergreen-rule-lint-outside-"));
  roots.push(outside);
  const missing = await run(["rules", "lint"], outside);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /No registry directory here/);
});
