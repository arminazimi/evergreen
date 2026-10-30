import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

import {
  calculateMetrics,
  classifySkillTrigger,
  skillEvalHosts,
  type SkillEvalCase,
} from "../benchmarks/skill-trigger-eval.js";

const skillPath = resolve("skills/evergreen-deprecation/SKILL.md");

function parseSkill(contents: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(contents);
  assert.ok(match, "SKILL.md must contain YAML frontmatter and a Markdown body");
  return {
    frontmatter: parseYaml(match[1]!) as Record<string, unknown>,
    body: match[2]!,
  };
}

test("Evergreen skill follows the portable Agent Skills contract", async () => {
  const contents = await readFile(skillPath, "utf8");
  const { frontmatter, body } = parseSkill(contents);

  assert.equal(frontmatter.name, "evergreen-deprecation");
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(String(frontmatter.description).length <= 1024);
  assert.doesNotMatch(String(frontmatter.description), /[<>]/);
  assert.match(
    String(frontmatter.description),
    /Do not use for adding a dependency/,
  );
  assert.match(String(frontmatter.description), /routine package upgrades|routine upgrades/);
  assert.match(String(frontmatter.description), /vulnerability(?: or security)? audits/);
  assert.deepEqual(
    Object.keys(frontmatter).sort(),
    ["description", "license", "metadata", "name"],
  );
  assert.ok(body.split("\n").length < 100, "skill instructions should stay thin");
  assert.doesNotMatch(body, /^ {0,3}\[TODO:[^\n]*\]\s*$/m);
  assert.doesNotMatch(contents, /\b(Codex|Claude|Cursor|Gemini|OpenAI|Anthropic)\b/i);

  for (const tool of [
    "scan_repository",
    "list_deprecations",
    "explain_deprecation",
    "create_migration_context",
    "verify_migration",
    "check_dependency",
  ]) {
    assert.match(body, new RegExp(`\\b${tool}\\b`));
  }
  assert.match(body, /unknown ID is not proof of successful migration/);
  assert.match(body, /normal authorization rules/);
});

test("skill evaluation corpus covers host lanes and difficult trigger boundaries", async () => {
  const evaluation = JSON.parse(
    await readFile(resolve("skills/evergreen-deprecation/evals/cases.json"), "utf8"),
  ) as {
    schemaVersion: string;
    cases: SkillEvalCase[];
  };

  assert.equal(evaluation.schemaVersion, "evergreen.skill-evals.v2");
  assert.ok(evaluation.cases.length >= 50);
  assert.equal(new Set(evaluation.cases.map((item) => item.id)).size, evaluation.cases.length);
  assert.ok(evaluation.cases.every((item) => item.prompt.length > 0 && item.reason.length > 0));
  assert.ok(evaluation.cases.filter((item) => item.shouldTrigger).length >= 20);
  assert.ok(evaluation.cases.filter((item) => !item.shouldTrigger).length >= 20);
  assert.ok(evaluation.cases.filter((item) => item.kind === "ambiguous").length >= 10);

  for (const host of skillEvalHosts) {
    const hostCases = evaluation.cases.filter((item) => item.host === host);
    assert.ok(hostCases.length >= 15, `${host} needs representative coverage`);
    const metrics = calculateMetrics(hostCases);
    assert.ok(metrics.recall >= 0.9, `${host} recall must be at least 90%`);
    assert.ok(
      metrics.falseTriggerRate < 0.05,
      `${host} false-trigger rate must stay below 5%`,
    );
  }
});

test("skill trigger contract rejects explicit non-goals", () => {
  assert.equal(
    classifySkillTrigger("Upgrade every dependency to the latest version."),
    false,
  );
  assert.equal(
    classifySkillTrigger("Run a vulnerability and security audit on dependencies."),
    false,
  );
  assert.equal(
    classifySkillTrigger("Scan this repository for end-of-life runtimes."),
    true,
  );
});

test("skill distribution documents canonical discovery and host compatibility", async () => {
  const [readme, skillReadme, guide, compatibility] = await Promise.all([
    readFile(resolve("README.md"), "utf8"),
    readFile(resolve("skills/evergreen-deprecation/README.md"), "utf8"),
    readFile(resolve("docs/AGENT_SKILLS.md"), "utf8"),
    readFile(resolve("docs/COMPATIBILITY.md"), "utf8"),
  ]);
  const documentation = [readme, skillReadme, guide].join("\n");

  assert.match(readme, /https:\/\/skills\.sh\/b\/arminazimi\/evergreen/);
  assert.match(documentation, /npx skills add arminazimi\/evergreen/);
  assert.match(documentation, /npx skills update evergreen-deprecation/);
  assert.match(guide, /arminazimi\/evergreen@evergreen-deprecation/);

  for (const host of ["Codex", "Claude Code", "Cursor", "GitHub Copilot", "Gemini CLI"]) {
    assert.match(skillReadme, new RegExp(`\\| ${host} \\|`));
    assert.match(compatibility, new RegExp(host));
  }
});

test("check-before-add skill follows the portable Agent Skills contract", async () => {
  const contents = await readFile(resolve("skills/evergreen-check-before-add/SKILL.md"), "utf8");
  const { frontmatter, body } = parseSkill(contents);

  assert.equal(frontmatter.name, "evergreen-check-before-add");
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(String(frontmatter.description).length <= 1024);
  assert.doesNotMatch(String(frontmatter.description), /[<>]/);
  assert.match(String(frontmatter.description), /before adding/);
  assert.match(String(frontmatter.description), /Do not use for repository lifecycle scans/);
  assert.deepEqual(
    Object.keys(frontmatter).sort(),
    ["description", "license", "metadata", "name"],
  );
  assert.ok(body.split("\n").length < 80, "check-before-add instructions should stay thin");
  assert.doesNotMatch(contents, /\b(Codex|Claude|Cursor|Gemini|OpenAI|Anthropic)\b/i);
  assert.match(body, /\bcheck_dependency\b/);
  assert.match(body, /evergreen check/);
  assert.match(body, /normal authorization rules/);
});

test("the check-before-add corpus is balanced, labeled, and meets the trigger gates", async () => {
  const { calculateMetrics, classifyDependencyAddition, loadDependencyEvalCorpus, skillEvalHosts } = await import("../benchmarks/skill-trigger-eval.js");
  const corpus = await loadDependencyEvalCorpus();
  assert.equal(corpus.schemaVersion, "evergreen.dependency-guard-evals.v1");
  assert.ok(corpus.cases.length >= 40);
  assert.equal(new Set(corpus.cases.map((item) => item.id)).size, corpus.cases.length);
  assert.equal(new Set(corpus.cases.map((item) => item.prompt)).size, corpus.cases.length);
  for (const item of corpus.cases) assert.ok(item.reason.trim().length > 0, item.id);
  assert.ok(corpus.cases.some((item) => item.kind === "ambiguous"));
  for (const host of skillEvalHosts) {
    const lane = corpus.cases.filter((item) => item.host === host);
    assert.ok(lane.some((item) => item.shouldTrigger) && lane.some((item) => !item.shouldTrigger), host);
    const metrics = calculateMetrics(lane, classifyDependencyAddition);
    assert.ok(metrics.recall >= 0.9, `${host} recall ${metrics.recall}`);
    assert.ok(metrics.falseTriggerRate < 0.05, `${host} false-trigger rate ${metrics.falseTriggerRate}`);
  }
  const overall = calculateMetrics(corpus.cases, classifyDependencyAddition);
  assert.ok(overall.recall >= 0.9 && overall.falseTriggerRate < 0.05);
});

test("the dependency classifier also holds on prompts that are not in the corpus", async () => {
  const { classifyDependencyAddition } = await import("../benchmarks/skill-trigger-eval.js");
  for (const prompt of [
    "Please install the colors package for the CLI output.",
    "npm i --save-dev eslint-plugin-import",
    "pip install rich and use it for the tables.",
    "Add actions/cache@v3 to speed up the build.",
    "Introduce a library for schema validation.",
    "yarn add left-pad",
    "Add moment to package.json.",
    "Use the docker/login-action in the release job.",
  ]) assert.equal(classifyDependencyAddition(prompt), true, prompt);
  for (const prompt of [
    "Remove the colors package and use the built-in instead.",
    "Run npm install, then run the build.",
    "Add a README section about configuration.",
    "Rename the module and fix its imports.",
    "Explain what a dependency graph is.",
    "Upgrade everything to the latest versions.",
    "Write a test for the date helper.",
    "Add retries to the upload function.",
  ]) assert.equal(classifyDependencyAddition(prompt), false, prompt);
});

test("upgrade-runtime-action skill follows the portable Agent Skills contract", async () => {
  const contents = await readFile(resolve("skills/evergreen-upgrade-runtime-action/SKILL.md"), "utf8");
  const { frontmatter, body } = parseSkill(contents);

  assert.equal(frontmatter.name, "evergreen-upgrade-runtime-action");
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(String(frontmatter.description).length <= 1024);
  assert.doesNotMatch(String(frontmatter.description), /[<>]/);
  assert.match(String(frontmatter.description), /Upgrade an already-declared runtime/);
  assert.match(String(frontmatter.description), /Do not use for adding a new dependency/);
  assert.deepEqual(
    Object.keys(frontmatter).sort(),
    ["description", "license", "metadata", "name"],
  );
  assert.ok(body.split("\n").length < 80, "upgrade-runtime-action instructions should stay thin");
  assert.doesNotMatch(contents, /\b(Codex|Claude|Cursor|Gemini|OpenAI|Anthropic)\b/i);
  assert.match(body, /\bscan_repository\b/);
  assert.match(body, /\bcheck_dependency\b/);
  assert.match(body, /normal authorization rules/);
});

test("the upgrade-runtime-action corpus meets the trigger gates and the deprecation coverage decision", async () => {
  const {
    calculateMetrics,
    classifyRuntimeActionUpgrade,
    deprecationCoverageOnUpgradeJob,
    loadUpgradeRuntimeActionEvalCorpus,
    skillEvalHosts,
  } = await import("../benchmarks/skill-trigger-eval.js");
  const corpus = await loadUpgradeRuntimeActionEvalCorpus();
  assert.equal(corpus.schemaVersion, "evergreen.upgrade-runtime-action-evals.v1");
  assert.ok(corpus.cases.length >= 40);
  assert.equal(new Set(corpus.cases.map((item) => item.id)).size, corpus.cases.length);
  assert.equal(new Set(corpus.cases.map((item) => item.prompt)).size, corpus.cases.length);
  for (const item of corpus.cases) assert.ok(item.reason.trim().length > 0, item.id);
  assert.ok(corpus.cases.some((item) => item.kind === "ambiguous"));
  for (const host of skillEvalHosts) {
    const lane = corpus.cases.filter((item) => item.host === host);
    assert.ok(lane.some((item) => item.shouldTrigger) && lane.some((item) => !item.shouldTrigger), host);
    const metrics = calculateMetrics(lane, classifyRuntimeActionUpgrade);
    assert.ok(metrics.recall >= 0.9, `${host} recall ${metrics.recall}`);
    assert.ok(metrics.falseTriggerRate < 0.05, `${host} false-trigger rate ${metrics.falseTriggerRate}`);
  }
  const overall = calculateMetrics(corpus.cases, classifyRuntimeActionUpgrade);
  assert.ok(overall.recall >= 0.9 && overall.falseTriggerRate < 0.05);
  const coverage = deprecationCoverageOnUpgradeJob(corpus.cases);
  assert.ok(coverage.cases >= 20);
  assert.ok(coverage.rate < 0.8, `expected deprecation misses below 80%, got ${coverage.rate}`);
});
