import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  compareFindings,
  DiffError,
  type DiffResult,
  exportRef,
  git as gitObjects,
  parseRange,
  renderDiffText,
  stderrMessage,
} from "../src/diff.js";
import type { Finding } from "../src/domain.js";
import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    stdio: "ignore",
  });
}

async function commit(root: string, node: string, message: string, name = "x"): Promise<void> {
  await writeFile(join(root, "package.json"), JSON.stringify({ name, engines: { node } }));
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", message);
}

async function run(root: string, ...args: string[]) {
  return runCli(["diff", ...args, root, "--json"]);
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
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim(),
    "M package.json",
  );
});

test("parseRange wants exactly two refs separated by two dots", () => {
  assert.deepEqual(parseRange("main..HEAD"), { base: "main", head: "HEAD" });
  for (const bad of ["main", "main...HEAD", "..HEAD", "main..", "a..b..c"])
    assert.throws(() => parseRange(bad), /not a range/);
});

test("compareFindings matches by fingerprint and counts duplicates", () => {
  const finding = (id: string, line: number): Finding =>
    ({ id, ruleId: "r", summary: "s", location: { path: "package.json", line } }) as unknown as Finding;
  const result = compareFindings([finding("a", 1), finding("b", 2)], [finding("c", 9)]);
  assert.deepEqual([result.introduced.length, result.fixed.length, result.unchanged], [0, 1, 1]);
});

test("parseRange keeps a base that starts with a dot", () => {
  assert.deepEqual(parseRange(".x..y"), { base: ".x", head: "y" });
});

test("stderrMessage reads trimmed Buffer and string stderr and nothing else", () => {
  assert.equal(stderrMessage(Object.assign(new Error("x"), { stderr: Buffer.from("  boom \n") })), "boom");
  assert.equal(stderrMessage({ stderr: "  bang \n" }), "bang");
  assert.equal(stderrMessage({ stderr: Buffer.from("  \n") }), undefined);
  assert.equal(stderrMessage({ stderr: "   " }), undefined);
  assert.equal(stderrMessage({ stderr: 5 }), undefined);
  assert.equal(stderrMessage({}), undefined);
  assert.equal(stderrMessage(null), undefined);
  assert.equal(stderrMessage("stderr"), undefined);
});

test("git failures become DiffError carrying git's own message", async () => {
  const root = await repository();
  assert.throws(
    () => gitObjects(root, ["rev-parse", "--verify", "nope-ref"]),
    (error: unknown) => error instanceof DiffError && error.name === "DiffError" && error.message.length > 0,
  );
  const empty = await mkdtemp(join(tmpdir(), "evergreen-diff-nogit-"));
  roots.push(empty);
  assert.throws(
    () => gitObjects(empty, ["status"]),
    (error: unknown) => error instanceof DiffError && /not a git repository/i.test(error.message),
  );
});

test("git falls back to a generic message when stderr is empty", () => {
  assert.throws(() => gitObjects("/definitely/not/a/directory", ["status"]), /git status failed\./);
});

test("exportRef refuses refs that look like options and reports unpack failures", async () => {
  const root = await repository();
  assert.throws(() => exportRef(root, "--output=x", root), /"--output=x" is not a valid ref\./);
  assert.throws(() => exportRef(root, "-x", root), /is not a valid ref/);
  assert.throws(() => exportRef(root, "good", join(root, "missing-directory")), /Cannot unpack good: [\s\S]+\.$/);
});

test("renderDiffText prints counts and only the non-empty sections", () => {
  const finding = (summary: string, line?: number): Finding =>
    ({
      id: summary,
      severity: "high",
      summary,
      location: line === undefined ? { path: "a.json" } : { path: "a.json", line },
    }) as unknown as Finding;
  const result: DiffResult = {
    schemaVersion: "evergreen.diff.v1",
    base: "main",
    head: "HEAD",
    introduced: [finding("new one", 3)],
    fixed: [finding("old one")],
    unchanged: 2,
  };
  assert.equal(
    renderDiffText(result),
    [
      "Evergreen diff main..HEAD",
      "Introduced: 1  Fixed: 1  Unchanged: 2",
      "",
      "Introduced:",
      "  [high] new one (a.json:3)",
      "",
      "Fixed:",
      "  [high] old one (a.json)",
    ].join("\n"),
  );
  assert.equal(
    renderDiffText({ ...result, introduced: [], fixed: [] }),
    "Evergreen diff main..HEAD\nIntroduced: 0  Fixed: 0  Unchanged: 2",
  );
});
