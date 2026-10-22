import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const hook = resolve(".githooks/pre-push");
const cli = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];
const skip = process.platform === "win32" ? "the hook is a POSIX shell script" : false;

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-pre-push-"));
  temporaryRoots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  await writeFile(join(root, "README.md"), "# x\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");
  return root;
}

function push(root: string, before: string, after_: string) {
  return spawnSync("sh", [hook], {
    cwd: root,
    encoding: "utf8",
    input: `refs/heads/main ${after_} refs/heads/main ${before}\n`,
    env: { ...process.env, EVERGREEN_PRE_PUSH_SKIP_BUILD: "1", EVERGREEN_CLI: cli },
  });
}

test("a push that changes no manifest passes without scanning", { skip }, async () => {
  const root = await repository();
  const before = git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "README.md"), "# y\n");
  git(root, "commit", "-qam", "docs");
  const result = push(root, before, git(root, "rev-parse", "HEAD"));
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /scanning/);
});

test("a push that adds a deprecated dependency is blocked", { skip }, async () => {
  const root = await repository();
  const before = git(root, "rev-parse", "HEAD");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "x", dependencies: { request: "2.88.0" } }));
  git(root, "add", "-A");
  git(root, "commit", "-qm", "dep");
  const result = push(root, before, git(root, "rev-parse", "HEAD"));
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /npm\.package\.request\.deprecated/);
  assert.match(result.stderr, /not covered by the baseline/);
});
