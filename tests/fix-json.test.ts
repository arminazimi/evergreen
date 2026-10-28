import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const WORKFLOW = `name: CI
on: push
jobs:
  test:
    steps:
      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v4.1.1
      - uses: actions/checkout@v4
`;
const PACKAGE = `{
  "name": "fixture",
  "engines": {
    "node": ">=18"
  }
}
`;

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-json-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  await writeFile(join(root, "package.json"), PACKAGE);
  await writeFile(join(root, ".nvmrc"), "18\n");
  return root;
}

async function runCli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

async function validator() {
  const schema = JSON.parse(await readFile(resolve("schemas/fix.v1.schema.json"), "utf8")) as object;
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

test("fix --dry-run --json reports patches and refusals that match fix.v1.schema.json and writes nothing", async () => {
  const root = await repository();
  const result = await runCli("fix", root, "--dry-run", "--json");
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  const validate = await validator();

  assert.equal(validate(parsed), true, JSON.stringify(validate.errors));
  assert.equal(parsed.schemaVersion, "evergreen.fix.v1");

  assert.deepEqual(parsed.patches.map((patch: { path: string; fixer: string }) => [patch.path, patch.fixer]), [
    [".github/workflows/ci.yml", "github-actions-uses"],
    [".nvmrc", "runtime-pins"],
  ]);

  // The SHA-pinned reference is in a fixer's scope but cannot be raised; the engines range is not an exact pin.
  assert.deepEqual(parsed.refusals.map((refusal: { fixer: string; path: string; line: number; reason: string }) => [refusal.fixer, refusal.path, refusal.line, refusal.reason]), [
    ["github-actions-uses", ".github/workflows/ci.yml", 6, "The reference is pinned to a commit SHA, not a major-version tag."],
    ["runtime-pins", "package.json", 4, "The pin is a range, not an exact version."],
    ["runtime-pins", "package.json", 4, "The pin is a range, not an exact version."],
    ["runtime-pins", "package.json", 4, "The pin is a range, not an exact version."],
  ]);
  assert.ok(parsed.refusals.every((refusal: { findingId: string; ruleId: string }) => refusal.findingId.startsWith(`${refusal.ruleId}:`)));

  // Nothing was written.
  assert.equal(await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"), WORKFLOW);
  assert.equal(await readFile(join(root, "package.json"), "utf8"), PACKAGE);
  assert.equal(await readFile(join(root, ".nvmrc"), "utf8"), "18\n");

  // The patches are still a usable diff.
  const patch = join(root, "fix.patch");
  await writeFile(patch, parsed.patches.map((entry: { diff: string }) => `${entry.diff}\n`).join(""));
  await execute("git", ["apply", "--check", patch], { cwd: root });

  // The report is deterministic.
  assert.equal((await runCli("fix", root, "--dry-run", "--json")).stdout, result.stdout);
});

test("fix --json reports an empty plan for a repository with nothing to fix", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-json-empty-"));
  temporaryRoots.push(root);
  const result = await runCli("fix", root, "--dry-run", "--json");
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);

  assert.deepEqual(parsed, { schemaVersion: "evergreen.fix.v1", patches: [], refusals: [] });
  assert.equal((await validator())(parsed), true);
  assert.equal(result.stderr, "");
});

test("fix --json refuses to combine with --branch, and the schema rejects undeclared properties", async () => {
  const root = await repository();
  const branch = await runCli("fix", root, "--branch", "--json");
  assert.equal(branch.code, 2);
  assert.match(branch.stderr, /Usage: evergreen fix/);

  const parsed = JSON.parse((await runCli("fix", root, "--dry-run", "--json")).stdout);
  const validate = await validator();
  assert.equal(validate({ ...parsed, undeclared: true }), false);
  assert.ok(validate.errors?.some((error) => error.keyword === "additionalProperties"));
});
