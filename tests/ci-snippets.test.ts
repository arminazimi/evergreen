import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parseDocument } from "yaml";

const root = resolve(import.meta.dirname, "../..");
const jenkins = await readFile(resolve(root, "integrations/jenkins/Jenkinsfile"), "utf8");
const bitbucket = await readFile(resolve(root, "integrations/bitbucket/bitbucket-pipelines.yml"), "utf8");

/** The arguments of every `evergreen-deprecation` invocation, up to the end of the line or the closing quote. */
function invocationArguments(text: string): string[] {
  // The pinning note names a versioned package (`evergreen-deprecation@X.Y.Z`), never an invocation.
  return [...text.matchAll(/evergreen-deprecation(?!@)([^\n']*)/g)].map(([, args]) => args!);
}

test("the Jenkinsfile runs one Evergreen stage that reports before the gate can fail the build", () => {
  assert.match(jenkins, /^pipeline \{/m);
  assert.match(jenkins, /agent any/);
  assert.match(jenkins, /stages \{/);
  assert.equal([...jenkins.matchAll(/^\s*stage\(/gm)].length, 1);
  assert.match(jenkins, /stage\('Evergreen lifecycle scan'\)/);
  const report = jenkins.indexOf("sh 'npx --yes evergreen-deprecation scan . --format junit > evergreen-report.xml || true'");
  const gate = jenkins.indexOf("sh 'npx --yes evergreen-deprecation scan . --fail-on high'");
  assert.ok(report >= 0, "the report command is missing");
  assert.ok(gate > report, "the gate must run after the report is written");
  assert.match(jenkins, /post \{\s*always \{\s*junit 'evergreen-report\.xml'/);
});

test("the Bitbucket pipeline runs one Evergreen step that reports before it gates", () => {
  const document = parseDocument(bitbucket);
  assert.equal(document.errors.length, 0);
  const config = document.toJS() as { pipelines: { default: Array<{ step: { name: string; image: string; script: string[]; artifacts: string[] } }> } };
  assert.equal(config.pipelines.default.length, 1);
  const { step } = config.pipelines.default[0]!;
  assert.equal(step.name, "Evergreen lifecycle scan");
  assert.equal(step.image, "node:24");
  assert.deepEqual(step.script, [
    "npx --yes evergreen-deprecation scan . --json > evergreen-report.json || true",
    "npx --yes evergreen-deprecation scan . --fail-on high",
  ]);
  assert.deepEqual(step.artifacts, ["evergreen-report.json"]);
});

test("every flag the CI snippets pass appears in evergreen --help", () => {
  // `--yes` is npx's own flag and precedes the package name, so only Evergreen's flags are collected.
  const flags = new Set(
    [jenkins, bitbucket].flatMap((text) => invocationArguments(text).flatMap((args) => [...args.matchAll(/--[\w-]+/g)].map((flag) => flag[0]!))),
  );
  assert.ok(flags.size > 0);
  assert.ok(flags.has("--fail-on"));
  const help = spawnSync(process.execPath, [resolve(root, "dist/src/cli.js"), "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  for (const flag of flags) assert.ok(help.stdout.includes(flag), `${flag} is missing from --help`);
});
