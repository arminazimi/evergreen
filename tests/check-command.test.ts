import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

async function check(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, "check", ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

test("a deprecated dependency exits 1 and explains the problem with evidence", async () => {
  const result = await check("pkg:npm/request@2.88.2");
  assert.equal(result.code, 1);
  assert.match(result.stdout, /Status: affected \(high\)/);
  assert.match(result.stdout, /HIGH request is deprecated/);
  assert.match(result.stdout, /Replacement: Native fetch/);
  assert.match(result.stdout, /Source: https:\/\/www\.npmjs\.com\/package\/request/);
});

test("a dependency with no problem, no rule, or only version-specific rules exits 0", async () => {
  for (const purl of ["pkg:github/actions/checkout@v5", "pkg:npm/express@4.0.0", "pkg:github/actions/checkout"]) {
    const result = await check(purl);
    assert.equal(result.code, 0, purl);
  }
  assert.match((await check("pkg:npm/express")).stdout, /does not mean it is safe/);
});

test("--json prints the published schema and the same exit code", async () => {
  const schema = JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  const result = await check("pkg:pypi/nose", "--json");
  assert.equal(result.code, 1);
  const parsed = JSON.parse(result.stdout);
  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.status, "affected");
});

test("--fail-on sets the gate", async () => {
  assert.equal((await check("pkg:npm/request", "--fail-on", "critical")).code, 0);
  assert.equal((await check("pkg:npm/request", "--fail-on", "high")).code, 1);
  assert.equal((await check("pkg:npm/request", "--fail-on", "low")).code, 1);
  assert.equal((await check("pkg:npm/request", "--fail-on", "none")).code, 0);
  const bad = await check("pkg:npm/request", "--fail-on", "urgent");
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Unknown severity/);
});

test("usage errors exit 2 with a message", async () => {
  const missing = await check();
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /Missing package URL/);
  const invalid = await check("request");
  assert.equal(invalid.code, 2);
  assert.match(invalid.stderr, /PURL must start with "pkg:"/);
  assert.equal((await check("pkg:github/actions/checkout@latest")).code, 2);
  assert.equal((await check("pkg:npm/request", "--format", "sarif")).code, 2);
});
