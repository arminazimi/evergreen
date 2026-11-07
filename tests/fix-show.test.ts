import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import {
  FIX_SHOW_MAX_MS,
  type ShowIo,
  buildShowLines,
  diffChanges,
  playFixShow,
  renderShowStatic,
} from "../src/fix-show.js";
import type { FixPlan } from "../src/fix/types.js";
import { runCli } from "./cli-runner.js";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const identity = {
  ...process.env,
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

const WORKFLOW = `name: CI
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
`;

async function git(root: string, ...args: string[]): Promise<string> {
  return (await execute("git", args, { cwd: root, env: identity })).stdout;
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-show-test-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  await git(root, "init", "-q", "-b", "main");
  await git(root, "add", ".");
  await git(root, "commit", "-q", "-m", "init");
  return root;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: strips ANSI escapes
const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "");
const finalCounts = (text: string) => /(\d+) → (\d+) findings?\s*$/.exec(text);

const DIFF = ["--- a/ci.yml", "+++ b/ci.yml", "@@ -1,2 +1,2 @@", " name: CI", "-uses: a@v4", "+uses: a@v5", ""].join(
  "\n",
);

function planWith(count: number): FixPlan {
  return {
    patches: Array.from({ length: count }, (_, index) => ({
      path: `file-${index}.yml`,
      diff: DIFF.replace(/ci\.yml/g, `file-${index}.yml`),
      fixer: "test",
    })),
    refusals: [{ fixer: "test", findingId: "f1", ruleId: "r.one", path: "x.yml", line: 3, reason: "ambiguous" }],
  };
}

function fakeIo(isTTY: boolean) {
  let clock = 0;
  const writes: string[] = [];
  const sleeps: number[] = [];
  const io: ShowIo = {
    isTTY,
    write: (text) => {
      writes.push(text);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  };
  return { io, writes, sleeps, tick: (ms: number) => (clock += ms) };
}

test("diffChanges keeps hunk headers and changed lines, drops file headers and context", () => {
  const lines = diffChanges(DIFF);
  assert.deepEqual(
    lines.map((line) => [line.text, line.style]),
    [
      ["@@ -1,2 +1,2 @@", "dim"],
      ["-uses: a@v4", "red"],
      ["+uses: a@v5", "green"],
    ],
  );
});

test("the static view lists patches, refusals in dim text, and ends on the counts", () => {
  const plain = renderShowStatic(planWith(1), { before: 12, after: 3 });
  assert.match(plain, /file-0\.yml\n@@ -1,2 \+1,2 @@\n-uses: a@v4\n\+uses: a@v5\n/);
  assert.match(plain, /Left unchanged:\n {2}r\.one at x\.yml:3: ambiguous\n/);
  assert.ok(plain.endsWith("12 → 3 findings\n"));
  assert.ok(!plain.includes("\u001b"));

  const colored = renderShowStatic(planWith(1), { before: 12, after: 3 }, true);
  assert.ok(colored.includes("\u001b[31m-uses: a@v4\u001b[0m"));
  assert.ok(colored.includes("\u001b[32m+uses: a@v5\u001b[0m"));
  assert.ok(colored.includes("\u001b[2m  r.one"));
  assert.equal(stripAnsi(colored), plain);
});

test("a single remaining finding is not pluralised", () => {
  const lines = buildShowLines({ patches: [], refusals: [] }, { before: 4, after: 1 });
  assert.equal(lines.at(-1)?.text, "4 → 1 finding");
});

test("off a terminal the show prints the static view without pauses", async () => {
  const { io, writes, sleeps } = fakeIo(false);
  await playFixShow(planWith(2), { before: 5, after: 1 }, { io, color: false });
  assert.equal(writes.join(""), renderShowStatic(planWith(2), { before: 5, after: 1 }));
  assert.deepEqual(sleeps, []);
});

test("--no-animation prints the static view even on a terminal", async () => {
  const { io, writes, sleeps } = fakeIo(true);
  await playFixShow(planWith(1), { before: 5, after: 1 }, { io, noAnimation: true, color: true });
  assert.equal(writes.join(""), renderShowStatic(planWith(1), { before: 5, after: 1 }, true));
  assert.deepEqual(sleeps, []);
});

test("on a terminal the show types the changes and writes the same text as the static view", async () => {
  const { io, writes, sleeps } = fakeIo(true);
  await playFixShow(planWith(1), { before: 5, after: 1 }, { io, color: true });
  assert.equal(stripAnsi(writes.join("")), renderShowStatic(planWith(1), { before: 5, after: 1 }));
  assert.ok(sleeps.length > 10);
});

test("many patches are sped up to stay inside six seconds and end on the final count", async () => {
  const { io, writes, sleeps } = fakeIo(true);
  const plan = planWith(400);
  await playFixShow(plan, { before: 800, after: 0 }, { io, color: false });
  assert.ok(sleeps.reduce((sum, ms) => sum + ms, 0) <= FIX_SHOW_MAX_MS, "the pauses add up to more than the cap");
  assert.equal(writes.join(""), renderShowStatic(plan, { before: 800, after: 0 }));
});

test("when the clock runs out the rest is printed at once", async () => {
  const { io, writes, sleeps, tick } = fakeIo(true);
  const slow: ShowIo = {
    ...io,
    sleep: async (ms) => {
      await io.sleep(ms);
      tick(FIX_SHOW_MAX_MS);
    },
  };
  const plan = planWith(30);
  await playFixShow(plan, { before: 60, after: 0 }, { io: slow, color: false });
  assert.equal(writes.join(""), renderShowStatic(plan, { before: 60, after: 0 }));
  assert.ok(sleeps.length <= 2, `slept ${sleeps.length} times after the cap was reached`);
});

test("fix --show prints the fix, writes nothing, and ends on counts that match fix --branch", async () => {
  const root = await repository();
  const shown = await runCli(["fix", root, "--show"], { env: identity });
  assert.equal(shown.code, 0);
  assert.ok(!shown.stdout.includes("\u001b"), "output off a terminal has no escape codes");
  assert.match(shown.stdout, /\.github\/workflows\/ci\.yml\n@@/);
  assert.match(shown.stdout, /-\s+- uses: actions\/checkout@v4\n\+\s+- uses: actions\/checkout@v5\n/);
  assert.match(shown.stderr, /1 patch shown; nothing was written\./);
  assert.equal((await git(root, "status", "--porcelain")).trim(), "");
  assert.equal((await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8")).replace(/\r\n/g, "\n"), WORKFLOW);
  const counts = finalCounts(shown.stdout);
  assert.ok(counts, `no final count in ${shown.stdout}`);
  assert.ok(Number(counts[2]) < Number(counts[1]));

  const branched = await runCli(["fix", root, "--show", "--branch"], { env: identity });
  assert.equal(branched.code, 0);
  assert.match(branched.stderr, /Committed 1 file on branch evergreen\/fix/);
  const committed = finalCounts(branched.stdout);
  assert.ok(committed);
  assert.deepEqual(committed.slice(1), counts.slice(1));

  const rescan = JSON.parse((await runCli(["scan", root, "--json"])).stdout) as { findings: unknown[] };
  assert.equal(rescan.findings.length, Number(committed[2]));
});

test("plain fix output is unchanged by --show support", async () => {
  const root = await repository();
  const plain = await runCli(["fix", root]);
  assert.match(plain.stdout, /^--- a\/\.github\/workflows\/ci\.yml\n\+\+\+ b\//);
  assert.match(plain.stderr, /Apply with: evergreen fix \| git apply/);
});

test("--json with --show is a usage error", async () => {
  const root = await repository();
  const result = await runCli(["fix", root, "--show", "--json"]);
  assert.equal(result.code, 2);
  assert.match(result.stdout, /Usage: evergreen fix/);
  assert.equal(JSON.parse(result.stdout).error.exitCode, 2);
});

test("--no-animation without --show is a usage error", async () => {
  const root = await repository();
  assert.equal((await runCli(["fix", root, "--no-animation"])).code, 2);
});
