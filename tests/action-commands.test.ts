import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { addDays, answerComment, DEFAULT_IGNORE_DAYS, parseCommentCommand, replyMarker, renderExplainReply, renderIgnoreReply, runCommentCommands, trustedAssociations } from "../src/action-commands.js";
import type { IssueCommentPayload } from "../src/action-commands.js";
import { findingFingerprint } from "../src/baseline.js";
import type { BaselineEntry } from "../src/baseline.js";
import { builtInDetectors } from "../src/detectors/index.js";
import type { Finding } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "nodejs.runtime.eol-20:package.json",
    ruleId: "nodejs.runtime.eol-20",
    detector: "nodejs",
    title: "Node.js 20 has reached end of life",
    summary: "Node.js 20 reached end of life on 2026-04-30.",
    severity: "high",
    confidence: "exact",
    location: { path: "package.json", line: 3 },
    replacement: "Node.js 22",
    deadline: "2026-04-30",
    sources: [{ title: "Node.js previous releases", url: "https://nodejs.org/en/about/previous-releases" }],
    ...overrides,
  };
}

function comment(body: string, options: { association?: string; pullRequest?: boolean; id?: number } = {}): IssueCommentPayload {
  return {
    issue: { number: 7, ...(options.pullRequest === false ? {} : { pull_request: { url: "https://api.github.com/repos/o/r/pulls/7" } }) },
    comment: { id: options.id ?? 1001, body, author_association: options.association ?? "MEMBER", user: { login: "maintainer" } },
  };
}

function baselineEntry(body: string): BaselineEntry {
  const match = /```json\n([\s\S]*?)\n```/.exec(body);
  assert.ok(match, "the reply has no JSON baseline entry");
  return JSON.parse(match[1]!) as BaselineEntry;
}

test("parses explain and ignore commands from a comment line and ignores anything else", () => {
  assert.deepEqual(parseCommentCommand("/evergreen explain nodejs.runtime.eol-20:package.json"), {
    command: { kind: "explain", findingId: "nodejs.runtime.eol-20:package.json" },
  });
  assert.deepEqual(parseCommentCommand("Thanks! Please look at this.\n  /EVERGREEN explain abc:package.json  \n"), {
    command: { kind: "explain", findingId: "abc:package.json" },
  });
  assert.deepEqual(parseCommentCommand("/evergreen ignore abc:package.json Upgrade tracked in PLAT-12"), {
    command: { kind: "ignore", findingId: "abc:package.json", reason: "Upgrade tracked in PLAT-12" },
  });
  assert.equal(parseCommentCommand("This is not a command."), undefined);
  assert.equal(parseCommentCommand("/evergreen-extra explain abc"), undefined);
  for (const body of ["/evergreen", "/evergreen explain", "/evergreen ignore abc:package.json", "/evergreen frobnicate abc", `/evergreen ignore abc:package.json ${"x".repeat(501)}`]) {
    const parsed = parseCommentCommand(body);
    assert.ok(parsed && "error" in parsed, `expected a usage error for ${body.slice(0, 40)}`);
  }
});

test("answers only trusted pull request comments, and scans only when a command asks for a finding", async () => {
  let scans = 0;
  const loadFindings = async () => {
    scans += 1;
    return [finding()];
  };

  for (const association of ["NONE", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "FIRST_TIMER", "MANNEQUIN"]) {
    const decision = await answerComment(comment("/evergreen explain abc", { association }), { loadFindings });
    assert.equal(decision.kind, "skip");
    assert.match((decision as { reason: string }).reason, /association/);
  }
  assert.equal((await answerComment(comment("/evergreen explain abc", { pullRequest: false }), { loadFindings })).kind, "skip");
  assert.equal((await answerComment(comment("looks good to me"), { loadFindings })).kind, "skip");
  assert.equal(scans, 0, "a skipped comment must not scan the checkout");

  for (const association of trustedAssociations) {
    const decision = await answerComment(comment("/evergreen explain nodejs.runtime.eol-20:package.json", { association }), { loadFindings });
    assert.equal(decision.kind, "reply");
  }
  assert.equal(scans, trustedAssociations.length);
});

test("the explain reply carries the finding, its location, and its sources", () => {
  const body = renderExplainReply(finding());
  assert.match(body, /HIGH · Node\.js 20 has reached end of life/);
  assert.match(body, /Node\.js 20 reached end of life on 2026-04-30\./);
  assert.match(body, /`nodejs\.runtime\.eol-20`/);
  assert.match(body, /`package\.json:3`/);
  assert.match(body, /\*\*Replacement:\*\* Node\.js 22/);
  assert.match(body, /\[Node\.js previous releases\]\(https:\/\/nodejs\.org\/en\/about\/previous-releases\)/);
});

test("the ignore reply is a baseline entry with an expiry date and pushes nothing", () => {
  const entry = finding();
  const body = renderIgnoreReply(entry, 'Upgrade "tracked" in PLAT-12', { today: "2026-10-29", baselinePath: ".evergreen-baseline.json" });
  assert.match(body, /Nothing was pushed/);
  const parsed = baselineEntry(body);
  assert.equal(parsed.fingerprint, findingFingerprint(entry));
  assert.equal(parsed.ruleId, "nodejs.runtime.eol-20");
  assert.equal(parsed.path, "package.json");
  assert.equal(parsed.reason, 'Upgrade "tracked" in PLAT-12');
  assert.equal(parsed.created, "2026-10-29");
  assert.equal(parsed.expires, addDays("2026-10-29", DEFAULT_IGNORE_DAYS));
  assert.equal(parsed.expires, "2027-01-27");
  assert.match(body, /until \*\*2027-01-27\*\*/);
});

test("an unknown finding id gets a helpful reply instead of an error", async () => {
  const decision = await answerComment(comment("/evergreen explain missing-id"), { loadFindings: async () => [finding()] });
  assert.equal(decision.kind, "reply");
  const body = (decision as { body: string }).body;
  assert.match(body, /could not find a lifecycle finding with id `missing-id`/);
  assert.match(body, /evergreen-deprecation scan/);
});

test("runCommentCommands replies once, updates on a re-run, and stays silent for untrusted authors", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-commands-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  const target = (await scanRepository(root, builtInDetectors)).findings[0];
  assert.ok(target, "the fixture repository should have a finding");

  const eventPath = join(root, "event.json");
  const writeEvent = async (payload: IssueCommentPayload) => writeFile(eventPath, JSON.stringify(payload), "utf8");

  const requests: Array<{ method: string; url: string; body?: string }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    requests.push({ method, url: String(input), ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    if (method === "GET") return Response.json([]);
    return Response.json({ id: 9001 });
  };

  await writeEvent(comment(`/evergreen explain ${target.id}`));
  const options = { root, eventPath, repository: "o/r", token: "t", apiUrl: "https://api.github.test", fetchImpl };
  assert.equal(await runCommentCommands(options), "replied");
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.method, "GET");
  assert.match(requests[0]!.url, /\/repos\/o\/r\/issues\/7\/comments\?per_page=100&page=1$/);
  assert.equal(requests[1]!.method, "POST");
  assert.match(requests[1]!.url, /\/repos\/o\/r\/issues\/7\/comments$/);
  const posted = JSON.parse(requests[1]!.body!) as { body: string };
  assert.ok(posted.body.startsWith(`${replyMarker(1001)}\n### `));
  assert.match(posted.body, new RegExp(target.summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  await writeEvent(comment(`/evergreen ignore ${target.id} Upgrade tracked in PLAT-12`, { id: 1002 }));
  requests.length = 0;
  await runCommentCommands(options);
  const ignored = JSON.parse(requests[1]!.body!) as { body: string };
  const entry = baselineEntry(ignored.body);
  assert.equal(entry.fingerprint, findingFingerprint(target));
  assert.equal(entry.reason, "Upgrade tracked in PLAT-12");
  assert.equal(entry.expires, addDays(entry.created!, DEFAULT_IGNORE_DAYS));

  await writeEvent(comment(`/evergreen explain ${target.id}`, { association: "NONE" }));
  requests.length = 0;
  assert.equal(await runCommentCommands(options), "skipped");
  assert.equal(requests.length, 0, "an untrusted comment must not call the API");

  await writeEvent(comment(`/evergreen explain ${target.id}`, { id: 1003 }));
  requests.length = 0;
  const updatingFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    requests.push({ method: init?.method ?? "GET", url: String(input), ...(typeof init?.body === "string" ? { body: init.body } : {}) });
    if ((init?.method ?? "GET") === "GET") return Response.json([{ id: 55, body: `${replyMarker(1003)}\nan older reply` }]);
    return Response.json({ id: 55 });
  };
  await runCommentCommands({ ...options, fetchImpl: updatingFetch });
  assert.equal(requests[1]!.method, "PATCH");
  assert.match(requests[1]!.url, /\/repos\/o\/r\/issues\/comments\/55$/);
});

test("the Action answers an issue_comment event when commands is true", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-commands-action-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  const target = (await scanRepository(root, builtInDetectors)).findings[0];
  assert.ok(target);

  const bodies: string[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.method === "POST") {
        bodies.push(JSON.parse(Buffer.concat(chunks).toString("utf8")).body as string);
        response.end(JSON.stringify({ id: 1 }));
        return;
      }
      response.end("[]");
    });
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const eventPath = join(root, "event.json");
  await writeFile(eventPath, JSON.stringify(comment(`/evergreen explain ${target.id}`)), "utf8");

  try {
    const child = spawn(process.execPath, [resolve("dist/src/action.js")], {
      env: {
        ...process.env,
        GITHUB_WORKSPACE: root,
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_EVENT_NAME: "issue_comment",
        GITHUB_REPOSITORY: "o/r",
        GITHUB_API_URL: `http://127.0.0.1:${address.port}`,
        INPUT_COMMANDS: "true",
        "INPUT_GITHUB-TOKEN": "test-token",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    const code = await new Promise<number>((done, reject) => {
      child.once("error", reject);
      child.once("close", (status) => done(status ?? 1));
    });
    assert.equal(code, 0);
    assert.equal(stderr, "");
    assert.match(stdout, /Evergreen created its reply to comment 1001/);
    assert.equal(bodies.length, 1);
    assert.ok(bodies[0]!.startsWith(`${replyMarker(1001)}\n### `));
    assert.match(bodies[0]!, /\*\*Location:\*\* `package\.json/);
  } finally {
    await new Promise<void>((closed) => server.close(() => closed()));
  }
});
