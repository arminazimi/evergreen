import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse, parseAllDocuments } from "yaml";

interface Parameter { default?: unknown }

interface Step { run?: { command: string }; store_artifacts?: { path: string } }

type Orb = {
  version: unknown;
  commands: Record<string, { parameters?: Record<string, Parameter>; steps?: Step[] }>;
  jobs: Record<string, { parameters?: Record<string, Parameter> }>;
};

async function load() {
  const orb = parse(await readFile(resolve("integrations/circleci/orb.yml"), "utf8")) as Orb;
  const action = parse(await readFile(resolve("action.yml"), "utf8")) as { inputs: Record<string, Parameter> };
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
  return { orb, action, pkg };
}

test("the CircleCI Orb is version 2.1 and defines a scan command and a scan job", async () => {
  const { orb } = await load();
  assert.equal(String(orb.version), "2.1");
  assert.ok(orb.commands.scan, "the Orb defines commands.scan");
  assert.ok(orb.jobs.scan, "the Orb defines jobs.scan");
});

test("the CircleCI Orb mirrors the gate and baseline inputs of the Action, with the same defaults", async () => {
  const { orb, action } = await load();
  for (const name of ["path", "baseline", "baseline-warn-days", "on-expired", "min-support-days", "fail-on-severity"]) {
    const job = orb.jobs.scan!.parameters![name]!;
    assert.equal(String(job.default), String(action.inputs[name]!.default), `default of "${name}" differs from action.yml`);
    assert.equal(String(orb.commands.scan!.parameters![name]!.default), String(job.default), `default of "${name}" differs between the job and the command`);
  }
});

test("the CircleCI Orb pins the package version it is released with", async () => {
  const { orb, pkg } = await load();
  assert.equal(orb.commands.scan!.parameters!.version!.default, pkg.version);
  assert.equal(orb.jobs.scan!.parameters!.version!.default, pkg.version);
});

test("the scan job declares the command parameters plus image, and the Orb uses only declared parameters", async () => {
  const { orb } = await load();
  const command = Object.keys(orb.commands.scan!.parameters!).sort();
  const job = Object.keys(orb.jobs.scan!.parameters!).sort();
  assert.deepEqual(job, [...command, "image"].sort());
  const text = await readFile(resolve("integrations/circleci/orb.yml"), "utf8");
  for (const [, name] of text.matchAll(/<<\s*parameters\.([\w-]+)\s*>>/g)) {
    assert.ok(name! in orb.jobs.scan!.parameters!, `parameter "${name}" is used but not declared on the job`);
  }
});

test("the scan command writes the report before it applies the gate", async () => {
  const { orb } = await load();
  const steps = orb.commands.scan!.steps!;
  const scan = steps[0]!.run!;
  assert.ok(scan, "the first step runs the scan");
  assert.ok(scan.command.includes("evergreen-deprecation@<< parameters.version >>"), "the scan pins the package version");
  assert.ok(scan.command.includes("--fail-on"), "the scan applies the severity gate");
  assert.ok(scan.command.includes("/tmp/evergreen-scan-status"), "the scan writes the status file");
  const store = steps[1]!.store_artifacts!;
  assert.ok(store, "the second step stores the report");
  assert.ok(store.path.includes("<< parameters.report-name >>"), "the artifact is the report");
  const gate = steps[2]!.run!;
  assert.ok(gate, "the third step applies the gate");
  assert.ok(gate.command.includes("/tmp/evergreen-scan-status"), "the gate exits with the saved scan status");
});

test("the adoption guide shows one CircleCI snippet that runs the published Orb", async () => {
  const text = await readFile(resolve("docs/ADOPTION.md"), "utf8");
  const heading = text.indexOf("## CircleCI");
  assert.ok(heading !== -1, "docs/ADOPTION.md has a CircleCI section");
  const next = text.indexOf("\n## ", heading + 1);
  const section = text.slice(heading, next === -1 ? undefined : next);
  assert.equal([...section.matchAll(/```yaml/g)].length, 1, "the section has exactly one yaml snippet");
  const start = section.indexOf("```yaml");
  const snippet = parse(section.slice(start + "```yaml".length, section.indexOf("```", start + "```yaml".length))) as {
    version: unknown;
    orbs: { evergreen: string };
    workflows: { evergreen: { jobs: Record<string, unknown>[] } };
  };
  assert.equal(String(snippet.version), "2.1");
  assert.equal(snippet.orbs.evergreen, "arminazimi/evergreen@<version>");
  assert.ok(snippet.workflows.evergreen.jobs[0] && "evergreen/scan" in snippet.workflows.evergreen.jobs[0]!, "the workflow runs the evergreen/scan job");
});

test("the scan job defaults to the same image as the GitLab component", async () => {
  const { orb } = await load();
  const [spec] = parseAllDocuments(await readFile(resolve("templates/evergreen.yml"), "utf8"));
  const inputs = (spec!.toJS() as { spec: { inputs: Record<string, Parameter> } }).spec.inputs;
  assert.equal(orb.jobs.scan!.parameters!.image!.default, inputs.image!.default);
});
