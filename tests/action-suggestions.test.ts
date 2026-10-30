import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import {
  FIX_SUGGESTION_MARKER,
  planFixSuggestions,
  renderSuggestion,
  renderSuggestionReview,
  runGitHubAction,
  suggestionComment,
  suggestionsFromPatch,
} from "../src/github-action.js";
import { upsertFixSuggestionsReview } from "../src/pr-comment.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const WORKFLOW = "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n";

const PATCH = [
  "--- a/.github/workflows/ci.yml",
  "+++ b/.github/workflows/ci.yml",
  "@@ -2,3 +2,3 @@",
  "   test:",
  "     steps:",
  "-      - uses: actions/checkout@v4",
  "+      - uses: actions/checkout@v5",
].join("\n");

const CHECKOUT_SUGGESTION = {
  path: ".github/workflows/ci.yml",
  startLine: 4,
  line: 4,
  replacement: ["      - uses: actions/checkout@v5"],
};

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

/** A commit with a clean tree, then a commit that applies `writeHead`. The worktree ends at `head`. */
async function committedChange(writeHead: (root: string) => Promise<void>): Promise<{ root: string; base: string; head: string }> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-suggestions-"));
  temporaryRoots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "evergreen@example.com"]);
  git(root, ["config", "user.name", "Evergreen test"]);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture", engines: { node: "24" } }, null, 2));
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]).trim();
  await writeHead(root);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "head"]);
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  return { root, base, head };
}

async function workflowChange(): Promise<{ root: string; base: string; head: string }> {
  return committedChange(async (root) => {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), WORKFLOW);
  });
}

test("a fixer patch becomes one suggestion per run of replaced lines", () => {
  assert.deepEqual(suggestionsFromPatch(".github/workflows/ci.yml", PATCH), [CHECKOUT_SUGGESTION]);
  assert.equal(renderSuggestion(CHECKOUT_SUGGESTION.replacement), "```suggestion\n      - uses: actions/checkout@v5\n```");
  assert.deepEqual(suggestionComment(CHECKOUT_SUGGESTION), {
    path: ".github/workflows/ci.yml",
    line: 4,
    side: "RIGHT",
    body: "```suggestion\n      - uses: actions/checkout@v5\n```",
  });

  const multiLine = [
    "@@ -3,4 +3,5 @@",
    " a",
    "-b",
    "-c",
    "+B",
    "+C",
    "+D",
    " e",
  ].join("\n");
  assert.deepEqual(suggestionsFromPatch("x.txt", multiLine), [
    { path: "x.txt", startLine: 4, line: 5, replacement: ["B", "C", "D"] },
  ]);

  const insertionOnly = ["@@ -3,2 +3,3 @@", " a", "+b", " c"].join("\n");
  const deletionOnly = ["@@ -3,3 +3,2 @@", " a", "-b", " c"].join("\n");
  assert.deepEqual(suggestionsFromPatch("x.txt", insertionOnly), [], "an insertion has no replaced line to anchor on");
  assert.deepEqual(suggestionsFromPatch("x.txt", deletionOnly), [], "a deletion has no replacement to suggest");
});

test("diff mode plans suggestions only for deterministic fixes on lines the pull request changed", async () => {
  const { root, base, head } = await workflowChange();
  const outcome = await runGitHubAction({
    root,
    reportPath: join(root, "report.json"),
    mode: "diff",
    diffRange: `${base}..${head}`,
    failOnSeverity: "none",
    suggestFixes: true,
  });
  assert.deepEqual(outcome.suggestions, [CHECKOUT_SUGGESTION]);
  assert.equal(renderSuggestionReview(1), `${FIX_SUGGESTION_MARKER}\nEvergreen can fix 1 lifecycle finding on lines this pull request changed. Apply a suggestion, or run \`npx evergreen-deprecation fix\` to make every change locally.`);

  const without = await runGitHubAction({
    root,
    reportPath: join(root, "without.json"),
    mode: "diff",
    diffRange: `${base}..${head}`,
    failOnSeverity: "none",
  });
  assert.deepEqual(without.suggestions, [], "the review is opt-in");
});

test("a finding without a deterministic fix, or on a line the pull request did not change, gets no suggestion", async () => {
  const { root, base, head } = await committedChange(async (root) => {
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "fixture", engines: { node: "24" }, dependencies: { request: "2.88.2" } }, null, 2),
    );
  });
  const outcome = await runGitHubAction({
    root,
    reportPath: join(root, "report.json"),
    mode: "diff",
    diffRange: `${base}..${head}`,
    failOnSeverity: "none",
    suggestFixes: true,
  });
  assert.ok(outcome.result.findings.some((finding) => finding.ruleId === "npm.package.request.deprecated"));
  assert.deepEqual(outcome.suggestions, [], "no fixer claims a deprecated package, so there is nothing to suggest");

  const workflow = await workflowChange();
  const scan = await scanRepository(workflow.root, builtInDetectors);
  assert.equal((await planFixSuggestions(scan, new Map([[".github/workflows/ci.yml", [{ start: 4, end: 4 }]]]))).length, 1);
  assert.deepEqual(
    await planFixSuggestions(scan, new Map([[".github/workflows/ci.yml", [{ start: 1, end: 3 }]]])),
    [],
    "the fix rewrites line 4, which this range does not cover",
  );
});

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

interface StoredComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  start_line: number | null;
}

/** A fake GitHub API that stores one review and its comments, and records every call. */
function fakeGitHub(): { calls: Call[]; reviews: Array<{ id: number; body: string }>; comments: StoredComment[]; restore: () => void } {
  const calls: Call[] = [];
  const reviews: Array<{ id: number; body: string }> = [];
  const comments: StoredComment[] = [];
  const realFetch = globalThis.fetch;
  let nextCommentId = 100;

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(String(url)).pathname;
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ method, path, ...(body === undefined ? {} : { body }) });
    const reviewPath = /^\/repos\/o\/r\/pulls\/7\/reviews$/;
    const reviewCommentsPath = /^\/repos\/o\/r\/pulls\/7\/reviews\/(\d+)\/comments$/;
    const reviewPathWithId = /^\/repos\/o\/r\/pulls\/7\/reviews\/(\d+)$/;
    const commentPath = /^\/repos\/o\/r\/pulls\/comments\/(\d+)$/;

    if (method === "GET" && reviewPath.test(path)) return new Response(JSON.stringify(reviews));
    if (method === "GET" && reviewCommentsPath.test(path)) return new Response(JSON.stringify(comments));
    if (method === "POST" && reviewPath.test(path)) {
      const review = { id: 7, body: String(body!.body) };
      reviews.push(review);
      for (const comment of body!.comments as Array<Record<string, unknown>>) {
        comments.push({
          id: nextCommentId++,
          body: String(comment.body),
          path: String(comment.path),
          line: Number(comment.line),
          start_line: comment.start_line === undefined ? null : Number(comment.start_line),
        });
      }
      return new Response(JSON.stringify(review));
    }
    if (method === "PUT" && reviewPathWithId.test(path)) {
      const review = reviews.find((candidate) => candidate.id === Number(reviewPathWithId.exec(path)![1]));
      if (review) review.body = String(body!.body);
      return new Response(JSON.stringify(review));
    }
    if (method === "PATCH" && commentPath.test(path)) {
      const comment = comments.find((candidate) => candidate.id === Number(commentPath.exec(path)![1]))!;
      comment.body = String(body!.body);
      return new Response(JSON.stringify(comment));
    }
    if (method === "DELETE" && commentPath.test(path)) {
      const index = comments.findIndex((candidate) => candidate.id === Number(commentPath.exec(path)![1]));
      if (index >= 0) comments.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;

  return { calls, reviews, comments, restore: () => { globalThis.fetch = realFetch; } };
}

const target = { apiUrl: "https://api.github.com", repository: "o/r", pullRequest: 7, token: "t" };

test("the suggestion review is created once and a re-run updates it instead of adding another", async () => {
  const api = fakeGitHub();
  try {
    const review = { body: renderSuggestionReview(1), commitId: "head-sha", comments: [suggestionComment(CHECKOUT_SUGGESTION)] };
    assert.equal(await upsertFixSuggestionsReview(target, review), "created");
    const posted = api.calls.find((call) => call.method === "POST")!;
    assert.equal(posted.path, "/repos/o/r/pulls/7/reviews");
    assert.equal(posted.body?.commit_id, "head-sha");
    assert.equal(posted.body?.event, "COMMENT");
    assert.deepEqual(posted.body?.comments, [
      { path: ".github/workflows/ci.yml", line: 4, side: "RIGHT", body: "```suggestion\n      - uses: actions/checkout@v5\n```" },
    ]);
    assert.equal(api.reviews.length, 1);

    const before = api.calls.length;
    assert.equal(await upsertFixSuggestionsReview(target, review), "updated");
    assert.deepEqual(api.calls.slice(before).map((call) => `${call.method} ${call.path}`), [
      "GET /repos/o/r/pulls/7/reviews",
      "GET /repos/o/r/pulls/7/reviews/7/comments",
    ], "an unchanged re-run rewrites nothing and adds no review");
    assert.equal(api.reviews.length, 1);

    const beforeBodyChange = api.calls.length;
    assert.equal(await upsertFixSuggestionsReview(target, { ...review, body: renderSuggestionReview(2) }), "updated");
    assert.deepEqual(api.calls.slice(beforeBodyChange).map((call) => `${call.method} ${call.path}`), [
      "GET /repos/o/r/pulls/7/reviews",
      "PUT /repos/o/r/pulls/7/reviews/7",
      "GET /repos/o/r/pulls/7/reviews/7/comments",
    ], "a different body updates the same review");
  } finally {
    api.restore();
  }
});

test("a re-run rewrites changed suggestions, deletes stale ones, and posts new lines as one more review", async () => {
  const api = fakeGitHub();
  try {
    const first = { body: renderSuggestionReview(2), commitId: "head-sha", comments: [
      suggestionComment(CHECKOUT_SUGGESTION),
      suggestionComment({ path: ".nvmrc", startLine: 1, line: 1, replacement: ["24"] }),
    ] };
    await upsertFixSuggestionsReview(target, first);
    const [checkout, nvmrc] = api.comments;
    assert.deepEqual([checkout!.path, nvmrc!.path], [".github/workflows/ci.yml", ".nvmrc"]);

    const second = { body: renderSuggestionReview(2), commitId: "next-sha", comments: [
      suggestionComment({ ...CHECKOUT_SUGGESTION, replacement: ["      - uses: actions/checkout@v6"] }),
      suggestionComment({ path: ".github/workflows/release.yml", startLine: 2, line: 2, replacement: ["      - uses: actions/upload-artifact@v7"] }),
    ] };
    const before = api.calls.length;
    assert.equal(await upsertFixSuggestionsReview(target, second), "updated");
    const calls = api.calls.slice(before).map((call) => `${call.method} ${call.path}`);
    assert.deepEqual(calls, [
      "GET /repos/o/r/pulls/7/reviews",
      "GET /repos/o/r/pulls/7/reviews/7/comments",
      "PATCH /repos/o/r/pulls/comments/100",
      "DELETE /repos/o/r/pulls/comments/101",
      "POST /repos/o/r/pulls/7/reviews",
    ]);
    assert.equal(api.comments.length, 2, "the stale comment is gone and the new one arrived");
  } finally {
    api.restore();
  }
});

test("action.yml declares suggest-fixes off by default and passes it to the scan step", async () => {
  const action = parseYaml(await readFile(resolve("action.yml"), "utf8")) as {
    inputs: Record<string, { default?: string }>;
    runs: { steps: Array<{ env?: Record<string, string> }> };
  };
  assert.equal(action.inputs["suggest-fixes"]?.default, "false");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_SUGGEST-FIXES"], "${{ inputs.suggest-fixes }}");
});

async function runAction(root: string, event: unknown, extra: Record<string, string> = {}): Promise<{ code: number; stdout: string }> {
  const runner = join(root, ".runner");
  await mkdir(runner, { recursive: true });
  const output = join(runner, "outputs.txt");
  const summary = join(runner, "summary.md");
  const eventPath = join(root, "event.json");
  await Promise.all([writeFile(output, ""), writeFile(summary, ""), writeFile(eventPath, JSON.stringify(event))]);

  const child = spawn(process.execPath, [resolve("dist/src/action.js")], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: runner,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      GITHUB_EVENT_PATH: eventPath,
      INPUT_MODE: "diff",
      "INPUT_SUGGEST-FIXES": "true",
      "INPUT_FAIL-ON-SEVERITY": "none",
      INPUT_ATTRIBUTION: "false",
      ...extra,
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

function pullRequestEvent(base: string, head: string, headRepository: { full_name: string; fork: boolean }) {
  return {
    pull_request: {
      number: 7,
      base: { sha: base, repo: { full_name: "o/r" } },
      head: { sha: head, repo: headRepository },
    },
  };
}

test("the runner posts one review of suggestions to the pull request", async () => {
  const { root, base, head } = await workflowChange();
  const requests: Array<{ method: string; path: string; body: string }> = [];
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: string) => { raw += chunk; });
    request.on("end", () => {
      requests.push({ method: request.method ?? "GET", path: request.url ?? "", body: raw });
      response.setHeader("content-type", "application/json");
      response.end(request.method === "GET" ? "[]" : JSON.stringify({ id: 1 }));
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address() as AddressInfo;
  try {
    const run = await runAction(root, pullRequestEvent(base, head, { full_name: "o/r", fork: false }), {
      GITHUB_API_URL: `http://127.0.0.1:${port}`,
      GITHUB_REPOSITORY: "o/r",
      "INPUT_GITHUB-TOKEN": "t",
    });
    assert.equal(run.code, 0);
    assert.match(run.stdout, /Evergreen created its fix suggestions review\./);

    const posted = requests.find((request) => request.method === "POST")!;
    assert.equal(posted.path, "/repos/o/r/pulls/7/reviews");
    const body = JSON.parse(posted.body) as { commit_id: string; event: string; body: string; comments: Array<{ path: string; line: number; side: string; body: string }> };
    assert.equal(body.commit_id, head);
    assert.equal(body.event, "COMMENT");
    assert.ok(body.body.startsWith(FIX_SUGGESTION_MARKER));
    assert.deepEqual(body.comments, [
      { path: ".github/workflows/ci.yml", line: 4, side: "RIGHT", body: "```suggestion\n      - uses: actions/checkout@v5\n```" },
    ]);
  } finally {
    server.close();
  }
});

test("a pull request from a fork is skipped with a notice and no API call", async () => {
  const { root, base, head } = await workflowChange();
  let requests = 0;
  const server = createServer((_request, response) => {
    requests += 1;
    response.end("[]");
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address() as AddressInfo;
  try {
    const run = await runAction(root, pullRequestEvent(base, head, { full_name: "someone/evergreen", fork: true }), {
      GITHUB_API_URL: `http://127.0.0.1:${port}`,
      GITHUB_REPOSITORY: "o/r",
      "INPUT_GITHUB-TOKEN": "t",
    });
    assert.equal(run.code, 0);
    assert.match(run.stdout, /suggest-fixes skipped/);
    assert.match(run.stdout, /read-only token/);
    assert.equal(requests, 0, "a fork never reaches the API");
  } finally {
    server.close();
  }
});
