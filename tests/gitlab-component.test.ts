import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse, parseAllDocuments } from "yaml";

interface Input { default?: unknown; options?: unknown[] }

async function load() {
  const [spec, body] = parseAllDocuments(await readFile(resolve("templates/evergreen.yml"), "utf8"));
  const action = parse(await readFile(resolve("action.yml"), "utf8")) as { inputs: Record<string, Input> };
  const pkg = JSON.parse(await readFile(resolve("package.json"), "utf8")) as { version: string };
  return { inputs: (spec!.toJS() as { spec: { inputs: Record<string, Input> } }).spec.inputs, body: body!.toJS() as Record<string, { script: string[]; artifacts: { when: string } }>, action, pkg };
}

test("the GitLab component mirrors the gate and baseline inputs of the Action, with the same defaults", async () => {
  const { inputs, action } = await load();
  for (const name of ["path", "baseline", "baseline-warn-days", "on-expired", "min-support-days", "fail-on-severity"]) {
    assert.equal(String(inputs[name.replaceAll("-", "_")]?.default), String(action.inputs[name]!.default), `default of "${name}" differs from action.yml`);
  }
});

test("the GitLab component pins the package version it is released with", async () => {
  const { inputs, pkg } = await load();
  assert.equal(inputs.version?.default, pkg.version);
});

test("the GitLab component uses only declared inputs and keeps the report when the gate fails", async () => {
  const { inputs, body } = await load();
  const text = await readFile(resolve("templates/evergreen.yml"), "utf8");
  for (const [, name] of text.matchAll(/\$\[\[\s*inputs\.(\w+)\s*\]\]/g)) assert.ok(name! in inputs, `input "${name}" is used but not declared`);
  assert.equal(body.evergreen!.artifacts.when, "always");
});
