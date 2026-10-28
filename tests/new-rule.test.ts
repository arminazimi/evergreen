import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { lintRuleFiles } from "../src/rule-lint.js";
import { renderRuleTestText, testRule } from "../src/rule-test.js";
import { renderRuleScaffold, renderRuleScaffoldResult, renderScaffoldResult, scaffoldDetector, scaffoldRule, ScaffoldError } from "../tools/scaffold/index.js";
import { ruleScaffoldNames } from "../tools/scaffold/names.js";
import { removeAll, scaffoldCheckout } from "./scaffold-helpers.js";

const execute = promisify(execFile);
const roots: string[] = [];

after(() => removeAll(roots));

const exists = (path: string) => access(path).then(() => true, () => false);
const emptyRegistry = (ecosystem = "npm") => `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem, rules: [] }, null, 2)}\n`;

async function ruleCheckout(registries: Record<string, string> = { "registry/npm.json": emptyRegistry() }): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-new-rule-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "evergreen-deprecation", version: "0.0.0" }, null, 2));
  for (const [path, contents] of Object.entries(registries)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

test("a rule id becomes a registry ecosystem and a module", () => {
  assert.deepEqual(ruleScaffoldNames("npm.package.sample.deprecated"), { id: "npm.package.sample.deprecated", ecosystem: "npm" });
  assert.deepEqual(ruleScaffoldNames("tiny.component.deprecated", "tiny-lang"), { id: "tiny.component.deprecated", ecosystem: "tiny-lang" });
  for (const bad of ["", "npm", "Npm.package.x", "npm..x", "npm.package.", ".npm.x", "npm/package.x", "npm.package sample.x"]) {
    assert.throws(() => ruleScaffoldNames(bad), (error: unknown) => error instanceof ScaffoldError && /not a valid rule id/.test(error.message), JSON.stringify(bad));
  }
  assert.throws(() => ruleScaffoldNames("npm.package.x", "Npm"), /not a valid ecosystem slug/);
});

test("the scaffold templates render without placeholders and name the fixture they create", () => {
  const names = ruleScaffoldNames("npm.package.sample.deprecated");
  const files = renderRuleScaffold(names, "2026-10-28");
  assert.deepEqual([...files.keys()], [
    "tests/fixtures/npm.package.sample.deprecated/match/index.js",
    "tests/fixtures/npm.package.sample.deprecated/match/README.md",
    "tests/fixtures/npm.package.sample.deprecated/clean/index.js",
    "tests/fixtures/npm.package.sample.deprecated/clean/README.md",
  ]);
  for (const [path, contents] of files) {
    assert.ok(!/\{\{\s*\w+\s*\}\}|\bundefined\b|\[object /.test(contents), `${path} has a placeholder`);
  }
  assert.match(files.get("tests/fixtures/npm.package.sample.deprecated/match/index.js")!, /require\("npm\.package\.sample\.deprecated"\)/);
  assert.match(files.get("tests/fixtures/npm.package.sample.deprecated/clean/README.md")!, /must not report/);
  assert.match(files.get("tests/fixtures/npm.package.sample.deprecated/match/README.md")!, /must report/);
});

test("a freshly scaffolded rule passes lint and the harness", async () => {
  const root = await ruleCheckout();
  const id = "npm.package.sample.deprecated";
  const result = await scaffoldRule(id, { root, today: "2026-10-28" });

  assert.equal(result.registry, "registry/npm.json");
  assert.deepEqual(result.files, ["registry/npm.json", ...renderRuleScaffold(result.names, "2026-10-28").keys()]);
  for (const file of result.files) assert.ok(await exists(join(root, file)), file);

  const registry = JSON.parse(await readFile(join(root, "registry/npm.json"), "utf8")) as { rules: Array<{ id: string; provenance: { reviewedAt: string } }> };
  assert.equal(registry.rules.length, 1);
  assert.equal(registry.rules[0]!.id, id);
  assert.equal(registry.rules[0]!.provenance.reviewedAt, "2026-10-28");

  const lint = await lintRuleFiles([join(root, "registry/npm.json")]);
  assert.deepEqual(lint.issues, []);

  const tested = await testRule(id, { root });
  assert.equal(tested.passed, true, renderRuleTestText(tested));

  const text = renderRuleScaffoldResult(result);
  assert.match(text, /^Created the npm\.package\.sample\.deprecated rule in registry\/npm\.json:/);
  assert.match(text, /evergreen rules test npm\.package\.sample\.deprecated/);
});

test("the scaffold keeps the rules already in the registry", async () => {
  const existing = {
    id: "npm.package.existing.deprecated",
    ecosystem: "npm",
    purl: "pkg:npm/existing",
    vers: "vers:npm/*",
    event: "deprecated",
    title: "Existing is deprecated",
    summary: "Existing is deprecated.",
    severity: "high",
    sources: [{ title: "Notice", url: "https://example.com/existing" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "tester" },
  };
  const root = await ruleCheckout({ "registry/npm.json": `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [existing] }, null, 2)}\n` });
  await scaffoldRule("npm.package.sample.deprecated", { root, today: "2026-10-28" });

  const registry = JSON.parse(await readFile(join(root, "registry/npm.json"), "utf8")) as { rules: Array<{ id: string }> };
  assert.deepEqual(registry.rules.map((rule) => rule.id), [existing.id, "npm.package.sample.deprecated"]);
});

test("a taken rule id, an existing fixture, or a missing registry stops the run before writing", async () => {
  const taken = await ruleCheckout({ "registry/npm.json": `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: "npm", rules: [{ id: "npm.package.sample.deprecated" }] }, null, 2)}\n` });
  await assert.rejects(scaffoldRule("npm.package.sample.deprecated", { root: taken }), /already defined in registry\/npm\.json/);
  assert.equal(await exists(join(taken, "tests", "fixtures", "npm.package.sample.deprecated")), false);

  const fixture = await ruleCheckout();
  await mkdir(join(fixture, "tests", "fixtures", "npm.package.sample.deprecated"), { recursive: true });
  await assert.rejects(scaffoldRule("npm.package.sample.deprecated", { root: fixture }), /Nothing was written: tests\/fixtures\/npm\.package\.sample\.deprecated\/ already exists/);

  const noRegistry = await ruleCheckout({ "registry/python.json": emptyRegistry("python") });
  await assert.rejects(scaffoldRule("npm.package.sample.deprecated", { root: noRegistry }), /registry\/npm\.json does not exist.*new-detector npm/);
  assert.equal(await exists(join(noRegistry, "tests", "fixtures")), false);

  const broken = await ruleCheckout({ "registry/npm.json": "{ not json" });
  await assert.rejects(scaffoldRule("npm.package.sample.deprecated", { root: broken }), /not valid JSON/);

  const outside = await mkdtemp(join(tmpdir(), "evergreen-new-rule-outside-"));
  roots.push(outside);
  await assert.rejects(scaffoldRule("npm.package.sample.deprecated", { root: outside }), /checkout of the Evergreen repository/);
});

test("new-detector points the author at new-rule for the first rule", async () => {
  const checkout = await scaffoldCheckout(roots);
  const result = await scaffoldDetector("sample-lang", { root: checkout, ecosystem: "sample" });
  const text = renderScaffoldResult(result);
  assert.match(text, /evergreen new-rule <sample>\.<component>\.<event>/);
});

test("the command scaffolds, then lint and the harness accept the rule", async () => {
  const id = "npm.package.sample.deprecated";
  const root = await ruleCheckout();
  const cli = resolve("dist/src/cli.js");
  const run = (args: string[], cwd = root) =>
    execute(process.execPath, [cli, ...args], { cwd }).then(
      (value) => ({ code: 0, ...value }),
      (error: { code: number; stdout: string; stderr: string }) => error,
    );

  const created = await run(["new-rule", id]);
  assert.equal(created.code, 0, created.stderr);
  assert.match(created.stdout, /Created the npm\.package\.sample\.deprecated rule in registry\/npm\.json:/);
  assert.equal(await exists(join(root, "tests", "fixtures", id, "match", "index.js")), true);

  const again = await run(["new-rule", id]);
  assert.equal(again.code, 2);
  assert.match(again.stderr, /already defined/);

  const lint = await run(["rules", "lint"]);
  assert.equal(lint.code, 0, lint.stdout + lint.stderr);
  assert.match(lint.stdout, /Checked 1 rule in 1 file: no problems\./);

  const tested = await run(["rules", "test", id]);
  assert.equal(tested.code, 0, tested.stdout + tested.stderr);
  assert.match(tested.stdout, /^Passed npm\.package\.sample\.deprecated/);

  for (const args of [["new-rule"], ["new-rule", "Bad_Id"], ["new-rule", "npm.package.x", "--ecosystem"], ["new-rule", "npm.package.x", "--json"]]) {
    const failure = await run(args);
    assert.equal(failure.code, 2, args.join(" "));
  }
  assert.match((await run(["new-rule"])).stderr, /Usage: evergreen new-rule <id>/);

  const outside = await mkdtemp(join(tmpdir(), "evergreen-new-rule-cli-outside-"));
  roots.push(outside);
  const outsideRun = await run(["new-rule", id], outside);
  assert.equal(outsideRun.code, 2);
  assert.match(outsideRun.stderr, /checkout of the Evergreen repository/);
});
