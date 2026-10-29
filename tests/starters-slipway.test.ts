import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

import { applyIgnore, loadConfig, matchesIgnorePattern } from "../src/config.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";

const starter = resolve("examples/starters/slipway");
const sharedFixture = resolve("tests/fixtures/toolchain/slipway-site");
const temporaryDirectories: string[] = [];

after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

const observed = async (directory: string) => {
  const scan = await scanRepository(directory, builtInDetectors, { noCache: true });
  const findings = scan.findings.map((finding) => ({ ruleId: finding.ruleId, path: finding.location.path }));
  return { scan, findings: findings.sort((left, right) => left.ruleId.localeCompare(right.ruleId) || left.path.localeCompare(right.path)) };
};

test("the starter configuration validates against the published schema and loads with the real loader", async () => {
  const raw = JSON.parse(await readFile(join(starter, ".evergreen.json"), "utf8")) as unknown;
  const schema = JSON.parse(await readFile(resolve("schemas/config.v1.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.equal(validate(raw), true, JSON.stringify(validate.errors));

  const config = await loadConfig(starter);
  assert.ok(config);
  assert.equal(config.configPath, join(starter, ".evergreen.json"));
  assert.equal(config.schemaVersion, "evergreen.config.v1");
  assert.equal(config.failOn, "high");
  assert.equal(config.$schema, "https://github.com/arminazimi/evergreen/schemas/config.v1.schema.json");
  assert.deepEqual(config.ignore, ["_site/", ".jekyll-cache/", ".bundle/", "vendor/"]);
  assert.equal(config.baseline, undefined, "the starter ships no baseline; the README explains how to add one");

  for (const path of ["_site/index.html", ".jekyll-cache/Jekyll/Cache", ".bundle/config", "vendor/bundle/gems"]) {
    assert.equal(matchesIgnorePattern(config.ignore!, path), true, path);
  }
  for (const path of ["Gemfile", "Gemfile.lock", "_config.yml", "_pages/about.md", ".github/workflows/pages.yml"]) {
    assert.equal(matchesIgnorePattern(config.ignore!, path), false, path);
  }
});

test("the workflow runs the pinned Action with a read-only token and the same gate", async () => {
  const workflow = parseYaml(await readFile(join(starter, ".github/workflows/evergreen.yml"), "utf8")) as {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: { lifecycle: { "runs-on": string; steps: Array<{ uses?: string; with?: Record<string, string> }> } };
  };
  assert.ok("pull_request" in workflow.on);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.equal(workflow.jobs.lifecycle["runs-on"], "ubuntu-latest");

  const uses = workflow.jobs.lifecycle.steps.map((step) => step.uses);
  assert.ok(uses.includes("actions/checkout@v7"));
  const evergreen = workflow.jobs.lifecycle.steps.find((step) => step.uses?.startsWith("arminazimi/evergreen@"));
  assert.ok(evergreen, "the workflow runs Evergreen");
  assert.match(evergreen.uses!, /^arminazimi\/evergreen@v\d+\.\d+\.\d+$/);
  assert.deepEqual(evergreen.with, { "fail-on-severity": "high" });
});

test("a scan of a Slipway-shaped site honors the starter's ignore patterns", async () => {
  let directory: string;
  try {
    await access(join(sharedFixture, "Gemfile"));
    directory = sharedFixture;
  } catch {
    directory = await mkdtemp(join(tmpdir(), "evergreen-slipway-starter-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "_site"), { recursive: true });
    await writeFile(join(directory, ".ruby-version"), "3.2.2\n");
    await writeFile(join(directory, "Gemfile"), 'source "https://rubygems.org"\n\ngem "jekyll", "4.3.4"\n');
    await writeFile(join(directory, "_config.yml"), "title: Slipway starter\n");
    await writeFile(join(directory, "index.md"), "# Home\n");
    await writeFile(join(directory, "_site/Dockerfile"), "FROM node:18\n");
  }

  const config = await loadConfig(starter);
  assert.ok(config?.ignore);

  const first = await observed(directory);
  const second = await observed(directory);
  assert.deepEqual(second.findings, first.findings, "the scan is deterministic");

  const filtered = applyIgnore(first.scan, config.ignore);
  for (const finding of filtered.findings) {
    for (const prefix of ["_site/", ".jekyll-cache/", ".bundle/", "vendor/"]) {
      assert.ok(!finding.location.path.startsWith(prefix), `${finding.location.path} is not ignored`);
    }
  }

  if (directory !== sharedFixture) {
    assert.deepEqual(first.findings, [
      { ruleId: "container.node.eol-21-and-older", path: "_site/Dockerfile" },
      { ruleId: "ruby.runtime.eol-3.2", path: ".ruby-version" },
    ]);
    assert.deepEqual(filtered.findings.map((finding) => finding.ruleId), ["ruby.runtime.eol-3.2"]);
  }
});
