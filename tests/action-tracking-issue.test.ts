import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { readTrackingSnapshot, renderTrackingIssue, trackingIssueEventAllowed, TRACKING_ISSUE_BODY_LIMIT, TRACKING_ISSUE_MARKER, TRACKING_ISSUE_TITLE, upsertTrackingIssue } from "../src/action-tracking-issue.js";
import type { Finding } from "../src/domain.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(id: string, severity: Finding["severity"], title: string, path: string, line?: number, deadline?: string, replacement?: string): Finding {
  return {
    id,
    ruleId: id.split(":")[0]!,
    detector: "npm",
    title,
    summary: "summary",
    severity,
    confidence: "exact",
    location: line === undefined ? { path } : { path, line },
    sources: [{ title: "Vendor notice", url: "https://example.com/notice" }],
    ...(deadline ? { deadline } : {}),
    ...(replacement ? { replacement } : {}),
  };
}

const options = { repository: "o/r", serverUrl: "https://github.com", ref: "abc", today: "2026-10-29" };

test("the issue body lists findings by end-of-life date with links and stores a hidden snapshot", () => {
  const body = renderTrackingIssue(
    [
      finding("later:1", "high", "Later", "package.json", 7, "2026-02-01", "node@22"),
      finding("sooner:1", "critical", "Sooner", "Dockerfile", 2, "2026-01-01"),
      finding("undated:1", "low", "No date", "a/package.json"),
      finding("escaped:1", "low", "Back\\slash | pipe", "package.json", 9, "2026-04-01", "a\\b | c"),
    ],
    undefined,
    options,
  );

  assert.ok(body.startsWith(`${TRACKING_ISSUE_MARKER}\n<!-- evergreen-tracking-snapshot: `));
  assert.ok(body.includes("Back\\\\slash \\| pipe"), "table cells escape backslashes and pipes");
  assert.ok(body.includes("a\\\\b \\| c"));
  assert.match(body, /## First run/);
  assert.match(body, /\*\*4\*\* lifecycle findings; \*\*3\*\* have reached the end-of-life date\./);
  assert.ok(body.indexOf("| 2026-01-01 (past) | critical | Sooner |") < body.indexOf("| 2026-02-01 (past) | high | Later |"), "dated findings are sorted by date");
  assert.ok(body.indexOf("Later") < body.indexOf("## Findings without an end-of-life date"), "undated findings come after the dated table");
  assert.match(body, /\| \[`package\.json:7`\]\(https:\/\/github\.com\/o\/r\/blob\/abc\/package\.json#L7\) \| node@22 \|/);
  assert.match(body, /\| \[`a\/package\.json`\]\(https:\/\/github\.com\/o\/r\/blob\/abc\/a\/package\.json\) \| — \|/);

  const snapshot = readTrackingSnapshot(body);
  assert.ok(snapshot);
  assert.equal(snapshot.updated, "2026-10-29");
  assert.deepEqual(snapshot.findings.map((stored) => stored.id), ["sooner:1", "later:1", "escaped:1", "undated:1"]);
});

test("the body says what is new and resolved since the previous run", () => {
  const first = finding("a:1", "high", "First", "package.json", 1, "2026-01-01");
  const second = finding("b:1", "low", "Second", "Dockerfile", 2, "2026-02-01");
  const third = finding("c:1", "critical", "Third", ".nvmrc", 1, "2026-03-01");
  const previous = readTrackingSnapshot(renderTrackingIssue([first, second], undefined, options));
  assert.ok(previous);

  const body = renderTrackingIssue([second, third], previous, { ...options, today: "2026-11-05" });
  assert.match(body, /## Changed since the last run on 2026-10-29/);
  assert.match(body, /\*\*1\*\* new, \*\*1\*\* resolved\./);
  assert.match(body, /\| New \| critical \| Third \| \[`\.nvmrc:1`\]\(https:\/\/github\.com\/o\/r\/blob\/abc\/\.nvmrc#L1\) \|/);
  assert.match(body, /\| Resolved \| high \| First \| `package\.json:1` \|/);

  const unchanged = renderTrackingIssue([first, second], previous, { ...options, today: "2026-11-05" });
  assert.match(unchanged, /No lifecycle findings changed\./);
});

test("an empty scan says so and keeps the markers for the next run", () => {
  const previous = readTrackingSnapshot(renderTrackingIssue([finding("a:1", "high", "First", "package.json", 1)], undefined, options));
  assert.ok(previous);
  const body = renderTrackingIssue([], previous, { ...options, today: "2026-11-05" });
  assert.match(body, /## No lifecycle findings/);
  assert.match(body, /Nothing to track as of 2026-11-05\./);
  assert.match(body, /\*\*0\*\* new, \*\*1\*\* resolved\./);
  assert.ok(readTrackingSnapshot(body));
});

test("the path input prefix is kept in file links", () => {
  const body = renderTrackingIssue([finding("a:1", "high", "One", "package.json", 3)], undefined, { ...options, pathPrefix: "services/api" });
  assert.match(body, /\[`services\/api\/package\.json:3`\]\(https:\/\/github\.com\/o\/r\/blob\/abc\/services\/api\/package\.json#L3\)/);
});

test("a body over the limit shortens the findings table but keeps every finding in the snapshot", () => {
  const many = Array.from({ length: 150 }, (_, index) =>
    finding(`r${index}:1`, "medium", `Long finding ${index} ${"x".repeat(150)}`, `package-${index}.json`, 1, "2026-01-01"),
  );
  const body = renderTrackingIssue(many, undefined, options);
  assert.ok(body.length <= TRACKING_ISSUE_BODY_LIMIT, `${body.length} characters`);
  const snapshot = readTrackingSnapshot(body);
  assert.ok(snapshot);
  assert.equal(snapshot.findings.length, many.length, "the snapshot still holds every finding");
  const rows = body.split("\n").filter((line) => line.startsWith("| 2026-01-01 (past) |")).length;
  assert.ok(rows > 0 && rows < many.length, `showed ${rows} of ${many.length}`);
  assert.match(body, /…and \d+ more findings; the hidden snapshot still tracks every finding\./);
});

test("a body that cannot fit even after shortening is not written", async () => {
  const many = Array.from({ length: 600 }, (_, index) =>
    finding(`r${index}:1`, "medium", `Long finding ${index} ${"x".repeat(150)}`, `package-${index}.json`, 1, "2026-01-01"),
  );
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return Response.json([]);
  }) as typeof fetch;
  try {
    const target = { apiUrl: "https://api.github.com", repository: "o/r", token: "t" };
    assert.equal(await upsertTrackingIssue(target, many, "2026-10-29"), "too-large");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls, 1, "only the issue lookup runs; no create or update request");
});

test("tracking-issue acts on schedule and manual runs, not pull requests", () => {
  assert.equal(trackingIssueEventAllowed(undefined), true);
  assert.equal(trackingIssueEventAllowed("schedule"), true);
  assert.equal(trackingIssueEventAllowed("workflow_dispatch"), true);
  assert.equal(trackingIssueEventAllowed("pull_request"), false);
  assert.equal(trackingIssueEventAllowed("push"), false);
});

test("upsertTrackingIssue creates one issue, updates it, closes it, and reopens it", async () => {
  interface Issue {
    number: number;
    state: "open" | "closed";
    title?: string;
    body?: string;
  }
  const issues: Issue[] = [];
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  const realFetch = globalThis.fetch;
  let next = 1;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const parsed = new URL(String(url));
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, path: parsed.pathname, ...(body ? { body } : {}) });
    if (method === "GET" && parsed.pathname.endsWith("/issues")) return Response.json(issues);
    if (method === "POST" && parsed.pathname.endsWith("/issues")) {
      const issue: Issue = { number: next++, state: "open", title: String(body?.title), body: String(body?.body) };
      issues.push(issue);
      return Response.json(issue, { status: 201 });
    }
    const matched = /\/issues\/(\d+)$/.exec(parsed.pathname);
    if (method === "PATCH" && matched) {
      const issue = issues.find((item) => item.number === Number(matched[1]))!;
      Object.assign(issue, body);
      return Response.json(issue);
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  try {
    const target = { apiUrl: "https://api.github.com", repository: "o/r", token: "t" };
    const first = finding("a:1", "high", "First", "package.json", 1, "2026-01-01");
    assert.equal(await upsertTrackingIssue(target, [first], "2026-10-29"), "created");
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.title, TRACKING_ISSUE_TITLE);
    assert.match(issues[0]?.body ?? "", /## First run/);

    assert.equal(await upsertTrackingIssue(target, [first], "2026-10-30"), "updated");
    assert.equal(issues.length, 1, "a re-run edits the same issue");
    assert.match(issues[0]?.body ?? "", /No lifecycle findings changed\./);

    assert.equal(await upsertTrackingIssue(target, [], "2026-10-31"), "closed");
    assert.equal(issues[0]?.state, "closed");
    assert.match(issues[0]?.body ?? "", /## No lifecycle findings/);

    assert.equal(await upsertTrackingIssue(target, [], "2026-11-01"), "none");
    assert.equal(await upsertTrackingIssue(target, [first], "2026-11-02"), "reopened");
    assert.equal(issues[0]?.state, "open");
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.equal(calls.filter((call) => call.method === "POST").length, 1, "only the first run creates an issue");
  const reopen = calls.at(-1);
  assert.equal(reopen?.method, "PATCH");
  assert.equal(reopen?.body?.state, "open");
});

async function runAction(root: string, env: Record<string, string>): Promise<{ code: number; stdout: string }> {
  const runner = join(root, ".runner");
  await mkdir(runner, { recursive: true });
  await Promise.all([writeFile(join(runner, "outputs.txt"), ""), writeFile(join(runner, "summary.md"), "")]);
  const child = spawn(process.execPath, [resolve("dist/src/action.js")], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: runner,
      GITHUB_OUTPUT: join(runner, "outputs.txt"),
      GITHUB_STEP_SUMMARY: join(runner, "summary.md"),
      INPUT_ATTRIBUTION: "false",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.resume();
  let stdout = "";
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  const code = await new Promise<number>((done, reject) => {
    child.once("error", reject);
    child.once("close", (status) => done(status ?? 1));
  });
  return { code, stdout };
}

interface MockIssue {
  number: number;
  state: "open" | "closed";
  title?: string;
  body?: string;
}

async function trackingServer(): Promise<{ apiUrl: string; issues: MockIssue[]; requests: string[]; close: () => Promise<void> }> {
  const issues: MockIssue[] = [];
  const requests: string[] = [];
  let next = 1;
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const method = request.method ?? "GET";
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined;
      requests.push(`${method} ${url.pathname}${url.search}`);
      response.setHeader("content-type", "application/json");
      if (method === "GET" && url.pathname.endsWith("/issues")) {
        response.end(JSON.stringify(issues));
        return;
      }
      if (method === "POST" && url.pathname.endsWith("/issues")) {
        const issue: MockIssue = { number: next++, state: "open", title: String(body?.title), body: String(body?.body) };
        issues.push(issue);
        response.statusCode = 201;
        response.end(JSON.stringify(issue));
        return;
      }
      const matched = /\/issues\/(\d+)$/.exec(url.pathname);
      if (method === "PATCH" && matched) {
        const issue = issues.find((item) => item.number === Number(matched[1]))!;
        Object.assign(issue, body);
        response.end(JSON.stringify(issue));
        return;
      }
      response.statusCode = 404;
      response.end("{}");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return {
    apiUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    issues,
    requests,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

test("the Action keeps one tracking issue through create, update, close, and reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-tracking-action-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  const server = await trackingServer();
  const env = {
    GITHUB_API_URL: server.apiUrl,
    GITHUB_REPOSITORY: "o/r",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_SHA: "abc",
    GITHUB_EVENT_NAME: "schedule",
    "INPUT_GITHUB-TOKEN": "t",
    "INPUT_TRACKING-ISSUE": "true",
    "INPUT_FAIL-ON-SEVERITY": "none",
  };
  try {
    const created = await runAction(root, env);
    assert.equal(created.code, 0);
    assert.match(created.stdout, /Evergreen created its lifecycle tracking issue\./);
    assert.equal(server.issues.length, 1);
    assert.match(server.issues[0]?.body ?? "", /Findings by end-of-life date/);
    assert.match(server.issues[0]?.body ?? "", /https:\/\/github\.com\/o\/r\/blob\/abc\/package\.json#L1/);

    const updated = await runAction(root, env);
    assert.equal(updated.code, 0);
    assert.match(updated.stdout, /Evergreen updated its lifecycle tracking issue\./);
    assert.equal(server.issues.length, 1);

    await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "24" } }));
    const closed = await runAction(root, env);
    assert.equal(closed.code, 0);
    assert.match(closed.stdout, /Evergreen closed its lifecycle tracking issue\./);
    assert.equal(server.issues[0]?.state, "closed");
    assert.match(server.issues[0]?.body ?? "", /No lifecycle findings/);

    const clean = await runAction(root, env);
    assert.equal(clean.code, 0);
    assert.match(clean.stdout, /Evergreen has no tracking issue to change\./);

    await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
    const reopened = await runAction(root, env);
    assert.equal(reopened.code, 0);
    assert.match(reopened.stdout, /Evergreen reopened its lifecycle tracking issue\./);
    assert.equal(server.issues[0]?.state, "open");
    assert.equal(server.requests.filter((request) => request.startsWith("POST ")).length, 1);
  } finally {
    await server.close();
  }
});

test("the Action skips the tracking issue on pull request runs", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-tracking-pr-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  const run = await runAction(root, {
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_REPOSITORY: "o/r",
    "INPUT_GITHUB-TOKEN": "t",
    "INPUT_TRACKING-ISSUE": "true",
    "INPUT_FAIL-ON-SEVERITY": "none",
  });
  assert.equal(run.code, 0);
  assert.match(run.stdout, /tracking issue skipped/);
});

test("action.yml declares tracking-issue off by default and passes it to the scan step", async () => {
  const action = parseYaml(await readFile(resolve("action.yml"), "utf8")) as { inputs: Record<string, { default?: string }>; runs: { steps: Array<{ env?: Record<string, string> }> } };
  assert.equal(action.inputs["tracking-issue"]?.default, "false");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_TRACKING-ISSUE"], "${{ inputs.tracking-issue }}");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_GITHUB-TOKEN"], "${{ inputs.github-token }}");
});
