import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { renderRuleTestText, testRule } from "../src/rule-test.js";
import {
  renderRuleScaffold,
  renderRuleScaffoldResult,
  renderScaffoldResult,
  scaffoldDetector,
  scaffoldRule,
  ScaffoldError,
} from "../tools/scaffold/index.js";
import { ruleScaffoldNames } from "../tools/scaffold/names.js";
import { runCli } from "./cli-runner.js";
import { removeAll, scaffoldCheckout } from "./scaffold-helpers.js";

const roots: string[] = [];

after(() => removeAll(roots));

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );
const RULE_ID = "npm.package.sample.deprecated";

/** A rule as Ebb would define it, observed through its usage matcher, so the scaffolded fixtures pass as they are. */
const sampleRule = (id = RULE_ID) => ({
  id,
  ecosystem: "npm",
  purl: `pkg:generic/${id}`,
  vers: "vers:semver/*",
  event: "deprecated",
  title: "Sample is deprecated",
  summary: "The sample package is deprecated.",
  severity: "info",
  replacement: "A maintained alternative",
  sources: [{ title: "Notice", url: "https://example.com/sample", accessedAt: "2026-10-28" }],
  provenance: { observedAt: "2026-10-28", reviewedAt: "2026-10-28", reviewer: "tester" },
  usage: [{ kind: "import", language: "javascript", module: id }],
});

const registryWith = (rules: unknown[], ecosystem = "npm") =>
  `${JSON.stringify({ schemaVersion: "ebb.registry.v2", ecosystem, rules }, null, 2)}\n`;

/** A throwaway Evergreen checkout whose `registry/` stands in for the installed @velella/ebb. */
async function ruleCheckout(
  registries: Record<string, string> = { "registry/npm.json": registryWith([sampleRule()]) },
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-new-rule-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "evergreen-deprecation", version: "0.0.0" }, null, 2),
  );
  await mkdir(join(root, "tests", "fixtures"), { recursive: true });
  for (const [path, contents] of Object.entries(registries)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

test("a rule id becomes a registry ecosystem and a module", () => {
  assert.deepEqual(ruleScaffoldNames("npm.package.sample.deprecated"), {
    id: "npm.package.sample.deprecated",
    ecosystem: "npm",
  });
  assert.deepEqual(ruleScaffoldNames("tiny.component.deprecated", "tiny-lang"), {
    id: "tiny.component.deprecated",
    ecosystem: "tiny-lang",
  });
  for (const bad of [
    "",
    "npm",
    "Npm.package.x",
    "npm..x",
    "npm.package.",
    ".npm.x",
    "npm/package.x",
    "npm.package sample.x",
  ]) {
    assert.throws(
      () => ruleScaffoldNames(bad),
      (error: unknown) => error instanceof ScaffoldError && /not a valid rule id/.test(error.message),
      JSON.stringify(bad),
    );
  }
  assert.throws(() => ruleScaffoldNames("npm.package.x", "Npm"), /not a valid ecosystem slug/);
});

test("the scaffold templates render without placeholders and name the fixture they create", () => {
  const names = ruleScaffoldNames("npm.package.sample.deprecated");
  const files = renderRuleScaffold(names);
  assert.deepEqual(
    [...files.keys()],
    [
      "tests/fixtures/npm.package.sample.deprecated/match/index.js",
      "tests/fixtures/npm.package.sample.deprecated/match/README.md",
      "tests/fixtures/npm.package.sample.deprecated/clean/index.js",
      "tests/fixtures/npm.package.sample.deprecated/clean/README.md",
    ],
  );
  for (const [path, contents] of files) {
    assert.ok(!/\{\{\s*\w+\s*\}\}|\bundefined\b|\[object /.test(contents), `${path} has a placeholder`);
  }
  assert.match(
    files.get("tests/fixtures/npm.package.sample.deprecated/match/index.js")!,
    /require\("npm\.package\.sample\.deprecated"\)/,
  );
  assert.match(files.get("tests/fixtures/npm.package.sample.deprecated/clean/README.md")!, /must not report/);
  assert.match(files.get("tests/fixtures/npm.package.sample.deprecated/match/README.md")!, /must report/);
});

test("fixtures scaffolded for a rule Ebb defines pass the harness, and the registry is left alone", async () => {
  const root = await ruleCheckout();
  const before = await readFile(join(root, "registry/npm.json"), "utf8");
  const result = await scaffoldRule(RULE_ID, { root });

  assert.equal(result.registry, "registry/npm.json");
  assert.deepEqual(result.files, [...renderRuleScaffold(result.names).keys()]);
  for (const file of result.files) assert.ok(await exists(join(root, file)), file);
  assert.equal(await readFile(join(root, "registry/npm.json"), "utf8"), before);

  const tested = await testRule(RULE_ID, { root });
  assert.equal(tested.passed, true, renderRuleTestText(tested));

  const text = renderRuleScaffoldResult(result);
  assert.match(text, /^Created the fixtures for npm\.package\.sample\.deprecated \(defined in registry\/npm\.json\):/);
  assert.match(text, /evergreen rules test npm\.package\.sample\.deprecated/);
});

test("without a local registry the rule is looked up in the installed @velella/ebb", async () => {
  const root = await ruleCheckout({});
  const result = await scaffoldRule("npm.package.request.deprecated", { root });
  assert.equal(result.registry, "@velella/ebb/registry/npm.json");
});

test("a rule Ebb does not define, an existing fixture, or a non-checkout stops the run before writing", async () => {
  const unknown = await ruleCheckout({ "registry/npm.json": registryWith([]) });
  await assert.rejects(
    scaffoldRule(RULE_ID, { root: unknown }),
    /Nothing was written: no rule has the id "npm\.package\.sample\.deprecated" in registry\/\*\.json\. Add the rule to Ebb first/,
  );
  assert.equal(await exists(join(unknown, "tests", "fixtures", RULE_ID)), false);

  const fixture = await ruleCheckout();
  await mkdir(join(fixture, "tests", "fixtures", RULE_ID), { recursive: true });
  await assert.rejects(
    scaffoldRule(RULE_ID, { root: fixture }),
    /Nothing was written: tests\/fixtures\/npm\.package\.sample\.deprecated\/ already exists/,
  );

  const outside = await mkdtemp(join(tmpdir(), "evergreen-new-rule-outside-"));
  roots.push(outside);
  await assert.rejects(scaffoldRule(RULE_ID, { root: outside }), /checkout of the Evergreen repository/);
});

test("new-detector points the author at new-rule for the first rule", async () => {
  const checkout = await scaffoldCheckout(roots);
  const result = await scaffoldDetector("sample-lang", { root: checkout, ecosystem: "sample" });
  const text = renderScaffoldResult(result);
  assert.match(text, /evergreen new-rule <sample>\.<component>\.<event>/);
});

test("the command scaffolds the fixtures, then the harness accepts the rule", async () => {
  const id = RULE_ID;
  const root = await ruleCheckout();
  const run = (args: string[], cwd = root) => runCli(args, { cwd });

  const created = await run(["new-rule", id]);
  assert.equal(created.code, 0, created.stderr);
  assert.match(
    created.stdout,
    /Created the fixtures for npm\.package\.sample\.deprecated \(defined in registry\/npm\.json\):/,
  );
  assert.equal(await exists(join(root, "tests", "fixtures", id, "match", "index.js")), true);

  const again = await run(["new-rule", id]);
  assert.equal(again.code, 2);
  assert.match(again.stderr, /already exist/);

  const tested = await run(["rules", "test", id]);
  assert.equal(tested.code, 0, tested.stdout + tested.stderr);
  assert.match(tested.stdout, /^Passed npm\.package\.sample\.deprecated/);

  for (const args of [
    ["new-rule"],
    ["new-rule", "Bad_Id"],
    ["new-rule", "npm.package.x", "--ecosystem"],
    ["new-rule", "npm.package.x", "--json"],
  ]) {
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
