import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { publishFixPullRequest, renderFixPullRequestBody } from "../src/action-fix-pr.js";
import type { FixPullRequestOutcome, FixPullRequestTarget } from "../src/action-fix-pr.js";
import { builtInDetectors } from "../src/detectors/index.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function scratch(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

const WORKFLOW = "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n";

/** A repository with one finding the fixes branch can repair, plus a bare `origin` so the push stays local. */
async function repositoryWithFinding(): Promise<{ root: string; remote: string }> {
  const root = await scratch("evergreen-fix-pr-");
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "demo", engines: { node: "24" } }));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "evergreen@example.com"]);
  git(root, ["config", "user.name", "Evergreen test"]);
  git(root, ["config", "core.autocrlf", "false"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "init"]);

  const remote = join(await scratch("evergreen-fix-pr-remote-"), "remote.git");
  execFileSync("git", ["init", "--bare", "-q", remote]);
  git(root, ["remote", "add", "origin", remote]);
  return { root, remote };
}

interface PullRequestState {
  number: number;
  state: "open" | "closed";
  merged_at?: string | null;
}

interface RecordedCall {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

/** Answers the pulls API in memory and records every request, so the tests never open a socket. */
function stubGitHub(initial: PullRequestState[] = []): { calls: RecordedCall[]; restore: () => void } {
  const calls: RecordedCall[] = [];
  let pulls = initial.map((pull) => ({ ...pull, head: { ref: "evergreen/fixes" }, html_url: `https://github.com/o/r/pull/${pull.number}` }));
  let next = 7;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : (JSON.parse(String(init.body)) as Record<string, unknown>);
    calls.push({ method, path: `${url.pathname}${url.search}`, ...(body === undefined ? {} : { body }) });
    if (method === "GET") return Response.json(pulls);
    if (method === "POST") {
      const pull = { number: next, state: "open" as const, head: { ref: "evergreen/fixes" }, html_url: `https://github.com/o/r/pull/${next}` };
      next += 1;
      pulls = [pull, ...pulls];
      return Response.json(pull);
    }
    if (method === "PATCH") {
      const number = Number(url.pathname.split("/").pop());
      const changes = (body ?? {}) as Partial<Pick<(typeof pulls)[number], "state">>;
      pulls = pulls.map((pull) => (pull.number === number ? { ...pull, ...changes } : pull));
      return Response.json({});
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = realFetch;
    },
  };
}

function target(root: string): FixPullRequestTarget {
  return { root, repository: "o/r", token: "t", apiUrl: "https://api.github.com", baseBranch: "main" };
}

test("the pull request body lists every fix with its location and evidence link", () => {
  const finding = {
    id: "github-actions.checkout.node20:.github/workflows/ci.yml:4",
    title: "Unsupported actions/checkout runtime",
    location: { path: ".github/workflows/ci.yml", line: 4 },
    sources: [{ title: "Node 20 is no longer available in GitHub Actions", url: "https://github.blog/changelog/node-20" }],
  } as unknown as Finding;
  const body = renderFixPullRequestBody(
    [finding],
    [{ command: "npm test", purpose: "Run the test suite" }],
    [".github/workflows/ci.yml"],
    false,
  );

  assert.match(body, /^## Evergreen lifecycle fixes\n/);
  assert.match(body, /applies \*\*1\*\* deterministic lifecycle fix\b/);
  assert.match(body, /\| Unsupported actions\/checkout runtime \| `\.github\/workflows\/ci\.yml:4` \| \[Node 20 is no longer available in GitHub Actions\]\(https:\/\/github\.blog\/changelog\/node-20\) \|/);
  assert.match(body, /`npm test` — Run the test suite/);
  assert.doesNotMatch(body, /Scanned by/);
  assert.match(renderFixPullRequestBody([finding], [], [], true), /Scanned by \[Evergreen\]/);
});

test("the first run opens one pull request with every fix and a second run updates the same one", async () => {
  const { root, remote } = await repositoryWithFinding();
  const before = await scanRepository(root, builtInDetectors);
  assert.equal(before.findings.length, 1);
  const evidence = before.findings[0]!.sources[0]!.url;
  const github = stubGitHub();
  try {
    const first = await publishFixPullRequest(before, target(root));
    assert.equal(first.status, "opened");
    assert.equal(first.number, 7);
    assert.equal(first.fixes, 1);
    assert.match(execFileSync("git", ["--git-dir", remote, "show-ref", "refs/heads/evergreen/fixes"], { encoding: "utf8" }), /refs\/heads\/evergreen\/fixes/);

    const created = github.calls.filter((call) => call.method === "POST");
    assert.equal(created.length, 1);
    assert.equal(created[0]!.path, "/repos/o/r/pulls");
    assert.equal(created[0]!.body?.head, "evergreen/fixes");
    assert.equal(created[0]!.body?.base, "main");
    const body = String(created[0]!.body?.body);
    assert.match(body, /\| .+ \| `\.github\/workflows\/ci\.yml:4` \| \[.+\]\(.+\) \|/);
    assert.ok(body.includes(evidence), "the body links the evidence the finding cites");

    // The next scheduled run checks the default branch out again, still without the fix.
    git(root, ["checkout", "-q", "main"]);
    const again: ScanResult = await scanRepository(root, builtInDetectors);
    const second: FixPullRequestOutcome = await publishFixPullRequest(again, target(root));
    assert.equal(second.status, "updated");
    assert.equal(second.number, first.number);
    assert.equal(github.calls.filter((call) => call.method === "POST").length, 1, "no second pull request");
    assert.equal(github.calls.filter((call) => call.method === "PATCH").length, 1);
  } finally {
    github.restore();
  }
});

test("a run with nothing to fix opens no pull request and closes the one it left open", async () => {
  const root = await scratch("evergreen-fix-pr-clean-");
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "clean", engines: { node: "24" } }));
  const result = await scanRepository(root, builtInDetectors);
  assert.equal(result.findings.length, 0);

  const quiet = stubGitHub();
  try {
    const done = await publishFixPullRequest(result, target(root));
    assert.equal(done.status, "nothing");
    assert.deepEqual(quiet.calls.map((call) => call.method), ["GET"]);
  } finally {
    quiet.restore();
  }

  const github = stubGitHub([{ number: 9, state: "open" }]);
  try {
    const done = await publishFixPullRequest(result, target(root));
    assert.equal(done.status, "closed");
    assert.equal(done.number, 9);
    const closed = github.calls.find((call) => call.method === "PATCH");
    assert.equal(closed?.path, "/repos/o/r/pulls/9");
    assert.equal(closed?.body?.state, "closed");
  } finally {
    github.restore();
  }
});

test("a closed pull request is reopened when fixes come back", async () => {
  const { root } = await repositoryWithFinding();
  const result = await scanRepository(root, builtInDetectors);
  const github = stubGitHub([{ number: 9, state: "closed" }]);
  try {
    const done = await publishFixPullRequest(result, target(root));
    assert.equal(done.status, "updated");
    assert.equal(done.number, 9);
    const reopened = github.calls.find((call) => call.method === "PATCH");
    assert.equal(reopened?.body?.state, "open");
    assert.equal(github.calls.filter((call) => call.method === "POST").length, 0);
  } finally {
    github.restore();
  }
});

test("a merged pull request is not reopened; the next run opens a new one", async () => {
  const { root } = await repositoryWithFinding();
  const result = await scanRepository(root, builtInDetectors);
  const github = stubGitHub([{ number: 5, state: "closed", merged_at: "2026-10-01T00:00:00Z" }]);
  try {
    const done = await publishFixPullRequest(result, target(root));
    assert.equal(done.status, "opened");
    assert.equal(done.number, 7);
    assert.equal(github.calls.filter((call) => call.method === "PATCH").length, 0);
    assert.equal(github.calls.filter((call) => call.method === "POST").length, 1);
  } finally {
    github.restore();
  }
});

/** Runs the compiled Action entry point against a checkout with a fake step summary. */
async function runAction(root: string, inputs: Record<string, string>): Promise<{ code: number; stdout: string }> {
  const runner = await scratch("evergreen-fix-pr-runner-");
  const output = join(runner, "outputs.txt");
  const summary = join(runner, "summary.md");
  await Promise.all([writeFile(output, ""), writeFile(summary, "")]);
  const child = spawn(process.execPath, [resolve("dist/src/action.js")], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: runner,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      INPUT_ATTRIBUTION: "false",
      ...inputs,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  let stdout = "";
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  const code = await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolveCode(status ?? 1));
  });
  return { code, stdout };
}

test("the Action skips fix-pr on events other than schedule and workflow_dispatch", async () => {
  const { root } = await repositoryWithFinding();
  const run = await runAction(root, {
    "INPUT_FIX-PR": "true",
    "INPUT_FAIL-ON-SEVERITY": "none",
    GITHUB_EVENT_NAME: "push",
    GITHUB_REPOSITORY: "o/r",
  });

  assert.equal(run.code, 0);
  assert.match(run.stdout, /::notice title=Evergreen fix pull request skipped::fix-pr runs on schedule and workflow_dispatch events/);
  assert.equal(git(root, ["branch", "--list", "evergreen/fixes"]).trim(), "");
});

test("action.yml declares fix-pr off by default and passes it to the scan step", async () => {
  const action = parseYaml(await readFile(resolve("action.yml"), "utf8")) as {
    inputs: Record<string, { default?: string }>;
    runs: { steps: Array<{ env?: Record<string, string> }> };
  };
  assert.equal(action.inputs["fix-pr"]?.default, "false");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_FIX-PR"], "${{ inputs.fix-pr }}");
});
