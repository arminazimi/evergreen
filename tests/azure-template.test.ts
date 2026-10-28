import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse } from "yaml";

import { COMMANDS } from "../src/completions.js";

interface Parameter {
  name: string;
  type: string;
  default?: unknown;
  values?: string[];
}

interface Step {
  bash?: string;
  task?: string;
  condition?: string;
  env?: Record<string, string>;
  inputs?: Record<string, unknown>;
}

const TEMPLATE = "integrations/azure-pipelines/evergreen.yml";
const SEVERITIES = ["none", "info", "low", "medium", "high", "critical"];

async function load() {
  const text = await readFile(resolve(TEMPLATE), "utf8");
  const template = parse(text) as { parameters: Parameter[]; steps: Step[] };
  const action = parse(await readFile(resolve("action.yml"), "utf8")) as { inputs: Record<string, { default?: unknown }> };
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
  return { text, template, action, pkg };
}

test("the Azure template is a step template with typed parameters", async () => {
  const { template } = await load();
  assert.deepEqual(Object.keys(template).sort(), ["parameters", "steps"]);
  assert.ok(template.parameters.length >= 2, "the template declares its parameters");
  for (const parameter of template.parameters) {
    assert.match(parameter.name, /^\w+$/, `parameter "${parameter.name}" is not camelCase`);
    assert.equal(typeof parameter.type, "string", `parameter "${parameter.name}" has no type`);
    assert.ok("default" in parameter, `parameter "${parameter.name}" has no default`);
  }
});

test("the Azure template gates on the Action's severity default and pins the data it scans with", async () => {
  const { template, action } = await load();
  const failOn = template.parameters.find((parameter) => parameter.name === "failOn");
  const dataVersion = template.parameters.find((parameter) => parameter.name === "dataVersion");
  assert.ok(failOn, "failOn parameter is missing");
  assert.ok(dataVersion, "dataVersion parameter is missing");
  assert.equal(String(failOn.default), String(action.inputs["fail-on-severity"]!.default), 'default of "failOn" differs from action.yml');
  assert.deepEqual(failOn.values, SEVERITIES);
  assert.equal(dataVersion.default, "bundled");
});

test("the Azure template pins the package version it is released with", async () => {
  const { template, pkg } = await load();
  const version = template.parameters.find((parameter) => parameter.name === "version");
  assert.ok(version, "version parameter is missing");
  assert.equal(version.default, pkg.version);
});

test("the Azure template uses only declared parameters and documented Evergreen flags", async () => {
  const { text, template } = await load();
  const declared = new Set(template.parameters.map((parameter) => parameter.name));
  for (const [, name] of text.matchAll(/\$\{\{\s*parameters\.(\w+)\s*\}\}/g)) {
    assert.ok(declared.has(name!), `parameter "${name}" is used but not declared`);
  }

  const scanFlags = new Set(COMMANDS.find((command) => command.name === "scan")!.flags);
  const bash = template.steps.find((step) => step.bash)!.bash!;
  const used = bash
    .split("\n")
    .filter((line) => line.trimStart().startsWith("evergreen scan"))
    .flatMap((line) => [...line.matchAll(/(?<![\w-])(--[\w-]+)/g)].map((match) => match[1]!));
  assert.ok(used.includes("--fail-on") && used.includes("--data-version") && used.includes("--format"));
  for (const flag of new Set(used)) {
    assert.ok(scanFlags.has(flag), `flag ${flag} is not a documented evergreen scan flag`);
  }
});

test("the Azure template publishes JUnit results from --format junit even when the gate fails", async () => {
  const { template } = await load();
  const bash = template.steps.find((step) => step.bash);
  assert.ok(bash, "scan step is missing");
  assert.ok(bash!.bash!.includes('--format junit > "$EVERGREEN_REPORT"'), "the scan must write the JUnit report");
  assert.equal(bash!.env!.EVERGREEN_REPORT, "${{ parameters.reportName }}");

  const publish = template.steps.find((step) => step.task === "PublishTestResults@2");
  assert.ok(publish, "PublishTestResults@2 step is missing");
  assert.equal(publish!.condition, "succeededOrFailed()");
  assert.equal(publish!.inputs!.testResultsFormat, "JUnit");
  assert.equal(publish!.inputs!.testResultsFiles, "${{ parameters.reportName }}");
  assert.equal(publish!.inputs!.failTaskOnFailedTests, false);
});
