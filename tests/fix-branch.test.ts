import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const WORKFLOW = `name: CI
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
`;

const identity = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };

async function git(root: string, ...args: string[]): Promise<string> {
  return (await execute("git", args, { cwd: root, env: identity })).stdout;
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-branch-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  await git(root, "init", "-q", "-b", "main");
  await git(root, "add", ".");
  await git(root, "commit", "-q", "-m", "init");
  return root;
}

test("fix --branch commits the patches on a new local branch", async () => {
  const root = await repository();
  const { stderr } = await execute(process.execPath, [cli, "fix", root, "--branch"], { env: identity });

  assert.match(stderr, /Committed 1 file on branch evergreen\/fix/);
  assert.equal((await git(root, "rev-parse", "--abbrev-ref", "HEAD")).trim(), "evergreen/fix");
  assert.equal((await git(root, "log", "-1", "--format=%s")).trim(), "chore: apply Evergreen lifecycle fixes");
  assert.equal((await git(root, "status", "--porcelain")).trim(), "");
  assert.match((await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8")).replace(/\r\n/g, "\n"), /actions\/checkout@v5\n/);
  assert.equal((await git(root, "show", "main:.github/workflows/ci.yml")).replace(/\r\n/g, "\n"), WORKFLOW);
  assert.equal((await git(root, "remote")).trim(), "");
});

test("fix --branch refuses a dirty tree and leaves it untouched", async () => {
  const root = await repository();
  await writeFile(join(root, "notes.txt"), "work in progress\n");

  await assert.rejects(execute(process.execPath, [cli, "fix", root, "--branch"], { env: identity }), /clean working tree/);
  assert.equal((await git(root, "rev-parse", "--abbrev-ref", "HEAD")).trim(), "main");
  assert.equal((await git(root, "branch", "--list", "evergreen/fix")).trim(), "");
});

test("fix --branch refuses when the branch already exists", async () => {
  const root = await repository();
  await git(root, "branch", "evergreen/fix");

  await assert.rejects(execute(process.execPath, [cli, "fix", root, "--branch"], { env: identity }), /already exists/);
  assert.equal((await git(root, "rev-parse", "--abbrev-ref", "HEAD")).trim(), "main");
});

test("fix --branch does not combine with --dry-run", async () => {
  const root = await repository();
  await assert.rejects(execute(process.execPath, [cli, "fix", root, "--branch", "--dry-run"], { env: identity }), /Usage: evergreen fix/);
});
