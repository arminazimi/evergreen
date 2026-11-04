import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import {
  classifyConclusion,
  createGitHubIssueClient,
  FAILURE_CONCLUSIONS,
  fetchFailingJobs,
  findOpenAlertIssue,
  ISSUE_LABEL,
  ISSUE_MARKER,
  ISSUE_TITLE,
  main,
  parseArguments,
  parseJobsResponse,
  parseWorkflowRunEvent,
  reconcile,
  renderFailureBody,
  renderRecoveryComment,
  renderStillRedComment,
  shouldReconcile,
  TRACKED_BRANCH,
  type AlertRun,
  type Fetcher,
  type FailingJob,
  type IssueClient,
  type IssueRecord,
} from "../tools/main-red-alert.js";

const REPO = "arminazimi/evergreen";
const URL_ROOT = "https://github.com/arminazimi/evergreen/actions/runs";

/** A completed workflow_run event payload, trimmed to the fields the tool reads. */
function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: "completed",
    workflow_run: {
      id: 100,
      html_url: `${URL_ROOT}/100`,
      head_branch: "main",
      head_sha: "0123456789abcdef0123456789abcdef01234567",
      event: "push",
      conclusion: "failure",
      run_attempt: 1,
      run_number: 100,
      head_commit: { message: "fix: make CI pass" },
      ...overrides,
    },
  });
}

function run(overrides: Record<string, unknown> = {}): AlertRun {
  return parseWorkflowRunEvent(payload(overrides));
}

function runAt(id: number, conclusion: string, overrides: Record<string, unknown> = {}): AlertRun {
  return run({ id, run_number: id, html_url: `${URL_ROOT}/${id}`, conclusion, ...overrides });
}

const CHECK_JOB: FailingJob = { name: "check (ubuntu-latest, node 22)", conclusion: "failure" };

/** In-memory stand-in for the GitHub issue API; it never touches the network. */
class FakeIssueStore implements IssueClient {
  readonly issues: IssueRecord[];
  readonly comments: Array<{ number: number; body: string }> = [];
  readonly creates: Array<{ title: string; body: string; labels: string[] }> = [];
  lists = 0;
  closes = 0;

  constructor(initial: IssueRecord[] = []) {
    this.issues = initial.map((issue) => ({ ...issue }));
  }

  get openIssues(): IssueRecord[] {
    return this.issues.filter((issue) => issue.state === "open");
  }

  async listOpenIssues(): Promise<IssueRecord[]> {
    this.lists++;
    return this.openIssues;
  }

  async createIssue(_repo: string, title: string, body: string, labels: string[]): Promise<IssueRecord> {
    this.creates.push({ title, body, labels });
    const issue: IssueRecord = { number: 100 + this.creates.length, title, body, state: "open" };
    this.issues.push(issue);
    return issue;
  }

  async commentOnIssue(_repo: string, number: number, body: string): Promise<void> {
    this.comments.push({ number, body });
  }

  async closeIssue(_repo: string, number: number): Promise<IssueRecord> {
    this.closes++;
    const issue = this.issues.find((item) => item.number === number);
    if (!issue) throw new Error(`no issue #${number}`);
    issue.state = "closed";
    return issue;
  }
}

function jobsResponse(jobs: Array<Record<string, unknown>>): string {
  return JSON.stringify({ total_count: jobs.length, jobs });
}

test("reads the run metadata from a workflow_run payload and rejects anything else", () => {
  const parsed = run();
  assert.equal(parsed.id, 100);
  assert.equal(parsed.url, `${URL_ROOT}/100`);
  assert.equal(parsed.headBranch, "main");
  assert.equal(parsed.headSha, "0123456789abcdef0123456789abcdef01234567");
  assert.equal(parsed.event, "push");
  assert.equal(parsed.conclusion, "failure");
  assert.equal(parsed.attempt, 1);
  assert.equal(parsed.runNumber, 100);
  assert.equal(parsed.commitMessage, "fix: make CI pass");

  assert.throws(() => parseWorkflowRunEvent("not json"), /not valid JSON/);
  assert.throws(() => parseWorkflowRunEvent("[]"), /no workflow_run/);
  assert.throws(() => parseWorkflowRunEvent("{}"), /no workflow_run/);
  assert.throws(() => parseWorkflowRunEvent(JSON.stringify({ workflow_run: { id: 1 } })), /html_url/);

  const missingAttempt = run({ run_attempt: null, run_number: null, head_commit: null });
  assert.equal(missingAttempt.attempt, 1);
  assert.equal(missingAttempt.runNumber, null);
  assert.equal(missingAttempt.commitMessage, null);
});

test("only a failed push to main needs an alert, and only success recovers it", () => {
  assert.deepEqual(FAILURE_CONCLUSIONS, ["failure", "timed_out", "startup_failure"]);
  assert.equal(classifyConclusion("failure"), "failure");
  assert.equal(classifyConclusion("timed_out"), "failure");
  assert.equal(classifyConclusion("startup_failure"), "failure");
  assert.equal(classifyConclusion("success"), "recovery");
  for (const conclusion of ["cancelled", "skipped", "neutral", "stale", "action_required"]) {
    assert.equal(classifyConclusion(conclusion), "ignore", conclusion);
  }

  assert.equal(shouldReconcile(runAt(1, "failure")), true);
  assert.equal(shouldReconcile(runAt(1, "success")), true);
  assert.equal(shouldReconcile(runAt(1, "failure", { event: "pull_request" })), false);
  assert.equal(shouldReconcile(runAt(1, "failure", { head_branch: "feature" })), false);
  assert.equal(shouldReconcile(runAt(1, "cancelled")), false);
});

test("a failure opens exactly one issue, later failures comment on it, and recovery closes it", async () => {
  const store = new FakeIssueStore();

  const first = await reconcile({ run: runAt(100, "failure"), jobs: [CHECK_JOB] }, REPO, store);
  assert.equal(first.action, "created");
  assert.equal(store.issues.length, 1);
  assert.equal(store.creates.length, 1);
  assert.equal(store.creates[0]!.title, ISSUE_TITLE);
  assert.deepEqual(store.creates[0]!.labels, [ISSUE_LABEL]);
  assert.match(store.creates[0]!.body, new RegExp(ISSUE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(store.creates[0]!.body, /`check \(ubuntu-latest, node 22\)` \(failure\)/);
  assert.match(store.creates[0]!.body, new RegExp(`${URL_ROOT}/100`));
  assert.match(store.creates[0]!.body, /`main` is red/);

  const second = await reconcile({ run: runAt(101, "timed_out"), jobs: [CHECK_JOB] }, REPO, store);
  assert.equal(second.action, "commented");
  assert.equal(second.issue?.number, first.issue?.number);
  assert.equal(store.issues.length, 1, "a second failure must not open a second issue");
  assert.equal(store.creates.length, 1);
  assert.equal(store.comments.length, 1);
  assert.equal(store.comments[0]!.number, first.issue?.number);
  assert.match(store.comments[0]!.body, /still red/);
  assert.match(store.comments[0]!.body, new RegExp(`${URL_ROOT}/101`));

  const third = await reconcile({ run: runAt(102, "failure"), jobs: [CHECK_JOB] }, REPO, store);
  assert.equal(third.action, "commented");
  assert.equal(store.issues.length, 1);
  assert.equal(store.comments.length, 2);

  const recovered = await reconcile({ run: runAt(103, "success") }, REPO, store);
  assert.equal(recovered.action, "closed");
  assert.equal(recovered.issue?.number, first.issue?.number);
  assert.equal(store.issues.length, 1);
  assert.equal(store.closes, 1);
  assert.equal(store.openIssues.length, 0);
  assert.equal(store.comments.length, 3);
  assert.match(store.comments[2]!.body, /recovered/);
  assert.match(store.comments[2]!.body, new RegExp(`${URL_ROOT}/103`));

  const greenAgain = await reconcile({ run: runAt(104, "success") }, REPO, store);
  assert.equal(greenAgain.action, "none");
  assert.equal(store.comments.length, 3);
  assert.equal(store.closes, 1);
  assert.equal(store.issues.length, 1);

  assert.equal(store.creates.length, 1, "four runs produced exactly one issue");
});

test("a new failure after recovery opens a new issue for the new incident", async () => {
  const store = new FakeIssueStore([{ number: 5, title: ISSUE_TITLE, body: ISSUE_MARKER, state: "closed" }]);
  const result = await reconcile({ run: runAt(200, "failure"), jobs: [CHECK_JOB] }, REPO, store);
  assert.equal(result.action, "created");
  assert.equal(store.issues.length, 2);
  assert.equal(store.openIssues.length, 1);
  assert.notEqual(store.openIssues[0]!.number, 5);
});

test("finds the open issue by its marker even when the title changed", async () => {
  const store = new FakeIssueStore([
    { number: 8, title: "Old title from a previous edit", body: `Notes\n\n${ISSUE_MARKER}\n`, state: "open" },
    { number: 9, title: "unrelated", body: "nothing here", state: "open" },
  ]);
  assert.equal(findOpenAlertIssue(store.issues)?.number, 8);

  const result = await reconcile({ run: runAt(300, "failure"), jobs: [CHECK_JOB] }, REPO, store);
  assert.equal(result.action, "commented");
  assert.equal(result.issue?.number, 8);
  assert.equal(store.creates.length, 0);
});

test("ignored runs make no API call at all", async () => {
  const store = new FakeIssueStore();
  for (const event of [
    runAt(400, "failure", { event: "pull_request" }),
    runAt(400, "failure", { head_branch: "renovate/npm" }),
    runAt(400, "cancelled"),
    runAt(400, "skipped"),
  ]) {
    const result = await reconcile({ run: event }, REPO, store);
    assert.equal(result.action, "none");
    assert.match(result.reason ?? "", /ignored/);
  }
  assert.equal(store.lists, 0);
  assert.equal(store.creates.length, 0);
  assert.equal(store.comments.length, 0);
});

test("a dry run reports the plan and writes nothing", async () => {
  const store = new FakeIssueStore();
  const create = await reconcile({ run: runAt(500, "failure"), jobs: [CHECK_JOB], dryRun: true }, REPO, store);
  assert.equal(create.action, "would-create");
  assert.equal(store.issues.length, 0);
  assert.equal(store.creates.length, 0);

  store.issues.push({ number: 12, title: ISSUE_TITLE, body: ISSUE_MARKER, state: "open" });
  const comment = await reconcile({ run: runAt(501, "failure"), jobs: [CHECK_JOB], dryRun: true }, REPO, store);
  assert.equal(comment.action, "would-comment");
  assert.equal(store.comments.length, 0);

  const close = await reconcile({ run: runAt(502, "success"), dryRun: true }, REPO, store);
  assert.equal(close.action, "would-close");
  assert.equal(store.openIssues.length, 1);
  assert.equal(store.closes, 0);
  assert.equal(store.comments.length, 0);
});

test("the issue body still alerts when the failing job names cannot be read", () => {
  const body = renderFailureBody(runAt(600, "failure"), [], "GitHub returned HTTP 403 for the run's jobs.");
  assert.match(body, /Failing job names are unavailable: GitHub returned HTTP 403/);
  assert.match(body, /`main` is red/);

  const noJobs = renderFailureBody(runAt(601, "startup_failure"), []);
  assert.match(noJobs, /No failed job was reported/);

  const comment = renderStillRedComment(runAt(602, "failure"), [], "HTTP 500");
  assert.match(comment, /still red/);
  assert.match(comment, /HTTP 500/);

  const recovery = renderRecoveryComment(runAt(603, "success"));
  assert.match(recovery, /recovered/);
  assert.match(recovery, new RegExp(`${URL_ROOT}/603`));
});

test("filters the run's jobs down to the failed ones", async () => {
  const text = jobsResponse([
    { name: "check (ubuntu-latest, node 24)", status: "completed", conclusion: "success" },
    { name: "check (ubuntu-latest, node 22)", status: "completed", conclusion: "failure" },
    { name: "lighthouse", status: "completed", conclusion: "timed_out" },
    { name: "docs", status: "in_progress", conclusion: null },
  ]);
  assert.deepEqual(parseJobsResponse(text), [
    { name: "check (ubuntu-latest, node 22)", conclusion: "failure" },
    { name: "lighthouse", conclusion: "timed_out" },
  ]);
  assert.throws(() => parseJobsResponse("{}"), /no jobs array/);

  const requested: string[] = [];
  const fetcher: Fetcher = async (url, headers) => {
    requested.push(url);
    assert.equal(headers?.Authorization, "Bearer secret");
    return { status: 200, text };
  };
  const jobs = await fetchFailingJobs(REPO, 42, fetcher, "secret");
  assert.equal(jobs.length, 2);
  assert.equal(requested[0], `https://api.github.com/repos/${REPO}/actions/runs/42/jobs?filter=latest&per_page=100`);
  await assert.rejects(() => fetchFailingJobs(REPO, 42, async () => ({ status: 403, text: "" }), "secret"), /HTTP 403/);
});

test("the GitHub client uses the documented endpoints", async () => {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    });
    return new Response(JSON.stringify({ number: 7, title: ISSUE_TITLE, state: "open" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const client = createGitHubIssueClient("secret", fakeFetch);
  await client.createIssue(REPO, ISSUE_TITLE, "body", [ISSUE_LABEL]);
  await client.commentOnIssue(REPO, 7, "still red");
  await client.closeIssue(REPO, 7);

  assert.deepEqual(
    requests.map((request) => request.method),
    ["POST", "POST", "PATCH"],
  );
  assert.equal(requests[0]!.url, `https://api.github.com/repos/${REPO}/issues`);
  assert.equal(requests[1]!.url, `https://api.github.com/repos/${REPO}/issues/7/comments`);
  assert.equal(requests[2]!.url, `https://api.github.com/repos/${REPO}/issues/7`);
  assert.match(requests[0]!.body!, /"labels":\["area: devops"\]/);
  assert.match(requests[2]!.body!, /"state":"closed"/);
  assert.match(requests[2]!.body!, /"state_reason":"completed"/);
});

test("parses arguments and requires an event payload", () => {
  const options = parseArguments(["--event", "event.json", "--token", "t", "--dry-run"], {});
  assert.equal(options.eventPath, "event.json");
  assert.equal(options.repo, "arminazimi/evergreen");
  assert.equal(options.token, "t");
  assert.equal(options.dryRun, true);

  const fromEnv = parseArguments([], {
    GITHUB_EVENT_PATH: "/tmp/event.json",
    GITHUB_REPOSITORY: "other/repo",
    GITHUB_TOKEN: "env-token",
  });
  assert.equal(fromEnv.eventPath, "/tmp/event.json");
  assert.equal(fromEnv.repo, "other/repo");
  assert.equal(fromEnv.token, "env-token");
  assert.equal(fromEnv.summaryPath, undefined);

  assert.throws(() => parseArguments([], {}), /GITHUB_EVENT_PATH is required/);
  assert.throws(() => parseArguments(["--event"]), /needs a value/);
  assert.throws(() => parseArguments(["--nope"]), /Unexpected argument/);
});

test("main reads the payload, names the failed job, and appends the step summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-main-red-alert-"));
  try {
    const summaryPath = join(dir, "summary.md");
    const store = new FakeIssueStore();
    const fetcher: Fetcher = async () => ({
      status: 200,
      text: jobsResponse([{ name: CHECK_JOB.name, status: "completed", conclusion: "failure" }]),
    });
    const code = await main(["--event", "event.json", "--repo", REPO, "--token", "secret", "--summary", summaryPath], {
      readTextFile: async () => payload({ conclusion: "failure" }),
      issueClient: store,
      fetcher,
    });
    assert.equal(code, 0);
    assert.equal(store.creates.length, 1);
    assert.match(store.creates[0]!.body, /check \(ubuntu-latest, node 22\)/);

    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, /### Main CI alert/);
    assert.match(summary, /concluded `failure`/);
    assert.match(summary, /Opened issue #101/);

    const ignored = new FakeIssueStore();
    const ignoredCode = await main(["--event", "event.json"], {
      readTextFile: async () => payload({ conclusion: "cancelled" }),
      issueClient: ignored,
    });
    assert.equal(ignoredCode, 0);
    assert.equal(ignored.lists, 0);
    assert.equal(ignored.creates.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("main fails clearly when it must write and has no token", async () => {
  const previous = { token: process.env.GITHUB_TOKEN, ghToken: process.env.GH_TOKEN };
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  try {
    await assert.rejects(
      () =>
        main(["--event", "event.json"], {
          readTextFile: async () => payload(),
          fetcher: async () => ({ status: 200, text: jobsResponse([]) }),
        }),
      /token is required/,
    );
  } finally {
    if (previous.token !== undefined) process.env.GITHUB_TOKEN = previous.token;
    if (previous.ghToken !== undefined) process.env.GH_TOKEN = previous.ghToken;
  }
});

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface WorkflowJob {
  if?: string;
  permissions?: Record<string, string>;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  steps?: WorkflowStep[];
}

interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, WorkflowJob>;
}

test("ci-health reacts to completed CI runs on main with a single serialized reconciler", async () => {
  const text = await readFile(resolve(".github/workflows/ci-health.yml"), "utf8");
  const workflow = parseYaml(text) as Workflow;

  assert.deepEqual(Object.keys(workflow.on), ["workflow_run", "schedule", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.workflow_run, {
    workflows: ["CI"],
    types: ["completed"],
    branches: [TRACKED_BRANCH],
  });
  assert.deepEqual(workflow.permissions, { contents: "read" });

  const job = workflow.jobs["main-red"]!;
  assert.ok(job, "expected a main-red job");
  assert.match(job.if!, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(job.if!, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.deepEqual(job.permissions, { actions: "read", contents: "read", issues: "write" });
  assert.equal(job.concurrency?.group, "main-red-alert");
  assert.equal(job.concurrency?.["cancel-in-progress"], false);

  const checkout = job.steps!.find((step) => step.uses?.startsWith("actions/checkout@"))!;
  assert.ok(checkout, "expected a checkout step");
  assert.equal(checkout.with?.ref, undefined, "the default branch must be checked out, not the failing commit");
  assert.equal(checkout.with?.["persist-credentials"], false);

  const alert = job.steps!.find((step) => step.run?.includes("dist/tools/main-red-alert.js"))!;
  assert.ok(alert, "expected a step that runs the reconciler");
  assert.equal(alert.env?.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  assert.equal(alert.env?.GITHUB_REPOSITORY, "${{ github.repository }}");
  assert.match(alert.run!, /--event "\$GITHUB_EVENT_PATH"/);
  assert.match(alert.run!, /--summary "\$GITHUB_STEP_SUMMARY"/);
  assert.doesNotMatch(alert.run!, /--dry-run/);

  for (const step of job.steps!.filter((item) => item.uses)) {
    // `./` and `$/` resolve inside this repository, so neither carries a pinned ref.
    if (step.uses!.startsWith("$/") || step.uses!.startsWith("./")) continue;
    assert.match(step.uses!, /@[0-9a-f]{40}$/, step.uses);
  }

  // The duration and quarantine jobs keep their own triggers.
  const schedule = workflow.on.schedule as Array<{ cron: string }>;
  assert.equal(schedule.length, 2);
});
