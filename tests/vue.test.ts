import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { NpmDetector } from "../src/detectors/npm.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";

const fixtures = resolve("tests/fixtures/vue");
const RULE_ID = "npm.package.vue.eol-2";
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-vue-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function vueRules(): Promise<RegistryV2Rule[]> {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/npm.json", "utf8")));
  return registry.rules.filter((rule) => rule.purl === "pkg:npm/vue");
}

test("the Vue 2 end-of-life rule is sourced, dated, and covers Vue 2 only", async () => {
  const rules = await vueRules();
  assert.deepEqual(rules.map((rule) => rule.id), [RULE_ID]);
  const [rule] = rules;
  assert.equal(rule?.event, "end-of-life");
  assert.equal(rule?.vers, "vers:npm/>=2.0.0|<3.0.0");
  assert.equal(rule?.deadline, "2023-12-31");
  assert.equal(rule?.severity, "high");
  assert.ok(rule?.sources.some((source) => source.url === "https://v2.vuejs.org/lts/"), "the deadline comes from the Vue LTS page");
  for (const source of rule?.sources ?? []) assert.match(source.url, /^https:\/\//, source.url);
});

test("every Vue rule has migration guidance with real verification commands", async () => {
  for (const rule of await vueRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    for (const check of rule.migration?.verification ?? []) assert.match(check.command, /^npm /, rule.id);
  }
});

test("reports Vue 2 declared in package.json with its lockfile version and the importing files", async () => {
  const findings = await new NpmDetector().scan({ root: resolve(fixtures, "positive") });

  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding?.ruleId, RULE_ID);
  assert.equal(finding?.location.path, "package.json");
  assert.equal(finding?.location.line, 5);
  assert.equal(finding?.severity, "high");
  assert.equal(finding?.deadline, "2023-12-31");
  assert.match(finding?.summary ?? "", /vue is declared in dependencies as \^2\.7\.16; resolved: 2\.7\.16\./);
  assert.deepEqual(
    finding?.usages?.map((usage) => [usage.location.path, usage.location.line]),
    [["src/main.js", 1]],
  );
  assert.ok(finding?.sources.some((source) => source.url === "https://v2.vuejs.org/lts/"));
});

test("creates a migration packet for the Vue 2 finding that names the declaration and the importing file", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [new NpmDetector()]);
  const finding = result.findings.find((item) => item.ruleId === RULE_ID);
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("package.json"));
  assert.ok(packet.affectedFiles.includes("src/main.js"));
  assert.ok(packet.steps.some((step) => step.id === "update-vue-dependencies"));
  assert.ok(packet.steps.some((step) => step.id === "replace-vue-global-api"));
  assert.ok(packet.verification.some((check) => check.command === "npm ls vue"));
});

test("a declared Vue 2 range is reported when no lockfile is available", async () => {
  const root = await repository({ "package.json": JSON.stringify({ dependencies: { vue: "^2.6.14" } }) });
  const findings = await new NpmDetector().scan({ root });
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.summary ?? "", /resolved: not found in a supported lockfile/);
});

test("a resolved Vue 3 release is not reported even when the manifest range allows Vue 2", async () => {
  const root = await repository({
    "package.json": JSON.stringify({ dependencies: { vue: "*" } }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/vue": { version: "3.5.13" } } }),
  });
  assert.deepEqual(await new NpmDetector().scan({ root }), []);
});

test("Vue 0.x and 1.x declarations are not reported because no reviewed source covers them", async () => {
  const root = await repository({ "package.json": JSON.stringify({ dependencies: { vue: "^1.0.28" } }) });
  assert.deepEqual(await new NpmDetector().scan({ root }), []);
});

test("Vue detector conformance: negative and zero fixtures produce no findings", async () => {
  await runDetectorConformance({
    detector: new NpmDetector(),
    fixtures: [
      { name: "vue negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "vue zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
});

test("Vue negative fixture: lookalike packages and comments are not Vue 2 declarations", async () => {
  assert.deepEqual(await new NpmDetector().scan({ root: resolve(fixtures, "negative") }), []);
});

test("Vue 3 zero fixture is a supported major with no lifecycle finding", async () => {
  const result = await scanRepository(resolve(fixtures, "zero"), [new NpmDetector()]);
  assert.deepEqual(result.findings, []);
});
