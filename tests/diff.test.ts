import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { compareFindings, parseRange } from "../src/diff.js";
import type { Finding } from "../src/domain.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, stdio: "ignore" });
}

async function commit(root: string, node: string, message: string, name = "x"): Promise<void> {
  await writeFile(join(root, "package.json"), JSON.stringify({ name, engines: { node } }));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", message);
}

async function run(root: string, ...args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    return { code: 0, stdout: (await execute(process.execPath, [cli, "diff", ...args, root, "--json"])).stdout };
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    return { code: failure.code, stdout: failure.stdout };
  }
}

interface Diff {
  introduced: unknown[];
  fixed: unknown[];
  unchanged: number;
}

// Node.js 18 reached end of life in 2025; Node.js 24 is supported, so it has no finding.
async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-diff-test-"));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  await commit(root, "24", "supported");
  git(root, "tag", "good");
  await commit(root, "18", "regress");
  git(root, "tag", "bad");
  return root;
}

test("a change that adds an end-of-life runtime introduces a finding and exits 1", async () => {
  const root = await repository();
  const { code, stdout } = await run(root, "good..bad");
  const diff = JSON.parse(stdout) as Diff;
  assert.equal(diff.introduced.length, 1);
  assert.equal(diff.fixed.length, 0);
  assert.equal(code, 1);
});

test("a change that removes it fixes the finding and exits 0", async () => {
  const root = await repository();
  const { code, stdout } = await run(root, "bad..good");
  const diff = JSON.parse(stdout) as Diff;
  assert.equal(diff.introduced.length, 0);
  assert.equal(diff.fixed.length, 1);
  assert.equal(code, 0);
});

test("findings both refs share are unchanged and do not fail the exit code", async () => {
  const root = await repository();
  await commit(root, "18", "touch", "y");
  git(root, "tag", "same");
  const { code, stdout } = await run(root, "bad..same");
  const diff = JSON.parse(stdout) as Diff;
  assert.deepEqual([diff.introduced.length, diff.fixed.length, diff.unchanged], [0, 0, 1]);
  assert.equal(code, 0);
});

test("the working tree is not touched and an unknown ref is a usage error", async () => {
  const root = await repository();
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "x", engines: { node: "16" } }));
  const { code } = await run(root, "good..nope");
  assert.equal(code, 2);
  assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(), "M package.json");
});

test("parseRange wants exactly two refs separated by two dots", () => {
  assert.deepEqual(parseRange("main..HEAD"), { base: "main", head: "HEAD" });
  for (const bad of ["main", "main...HEAD", "..HEAD", "main..", "a..b..c"]) assert.throws(() => parseRange(bad), /not a range/);
});

test("compareFindings matches by fingerprint and counts duplicates", () => {
  const finding = (id: string, line: number): Finding =>
    ({ id, ruleId: "r", summary: "s", location: { path: "package.json", line } }) as unknown as Finding;
  const result = compareFindings([finding("a", 1), finding("b", 2)], [finding("c", 9)]);
  assert.deepEqual([result.introduced.length, result.fixed.length, result.unchanged], [0, 1, 1]);
});
