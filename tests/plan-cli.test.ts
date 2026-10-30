import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { Plan } from "../src/plan.js";
import { EMPTY_PLAN_MESSAGE } from "../src/plan-render.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const demo = resolve("examples/demo");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function schemaValidator() {
  const schema = JSON.parse(await readFile(resolve("schemas/plan.v1.schema.json"), "utf8")) as object;
  return new Ajv2020({ allErrors: true }).compile(schema);
}

async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return error as { code: number; stdout: string; stderr: string };
  }
}

test("plan --json on examples/demo returns a plan.v1 document with waves", async () => {
  const validate = await schemaValidator();
  const { code, stdout } = await run(["plan", demo, "--json"]);
  assert.equal(code, 0);
  const plan = JSON.parse(stdout) as Plan;
  assert.equal(plan.schema, "evergreen.plan.v1");
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.ok(plan.summary.items > 0, "demo must produce at least one task");
  assert.ok(plan.summary.waves > 0, "demo must produce at least one wave");
  assert.equal(plan.items.length, plan.summary.items);
  assert.equal(plan.waves.length, plan.summary.waves);
});

test("plan text on examples/demo lists waves with severity, title, and files", async () => {
  const { code, stdout } = await run(["plan", demo]);
  assert.equal(code, 0);
  assert.match(stdout, /^Plan: \d+ tasks? in \d+ waves?\n/);
  assert.match(stdout, /^Wave 0 \(\d+ tasks?\)/m);
  assert.match(stdout, /^ {2}(INFO|LOW|MEDIUM|HIGH|CRITICAL) {2}.+/m);
  assert.match(stdout, /^ {4}\S/m);
});

test("plan --wave prints one wave and rejects an out-of-range index", async () => {
  const { code, stdout } = await run(["plan", demo, "--wave", "0"]);
  assert.equal(code, 0);
  assert.match(stdout, /^Plan: \d+ tasks? in \d+ waves?\n/);
  assert.match(stdout, /^Wave 0 \(\d+ tasks?\)/m);
  assert.doesNotMatch(stdout, /^Wave 1 /m);

  const outOfRange = await run(["plan", demo, "--wave", "999"]);
  assert.equal(outOfRange.code, 2);
  assert.match(outOfRange.stderr, /--wave is out of range/);
});

test("an empty plan exits zero with a clear message, and JSON stays schema-valid", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-plan-empty-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "empty-plan", private: true }));

  const text = await run(["plan", root]);
  assert.equal(text.code, 0);
  assert.equal(text.stdout.trimEnd(), EMPTY_PLAN_MESSAGE);

  const validate = await schemaValidator();
  const json = await run(["plan", root, "--json"]);
  assert.equal(json.code, 0);
  const plan = JSON.parse(json.stdout) as Plan;
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.equal(plan.summary.items, 0);
  assert.equal(plan.summary.waves, 0);
});
