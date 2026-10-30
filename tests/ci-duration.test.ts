import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import {
  collectRuns,
  durationSeconds,
  durationStats,
  ensureSlowIssue,
  formatDuration,
  ISSUE_LABEL,
  ISSUE_MARKER,
  ISSUE_TITLE,
  main,
  parseArguments,
  parseJobsResponse,
  parseRunsResponse,
  percentile,
  renderIssueBody,
  renderSummary,
  SCHEMA_VERSION,
  summarizeWorkflow,
  type Fetcher,
  type IssueClient,
} from "../tools/ci-duration.js";

/**
 * Recorded `GET /repos/{owner}/{repo}/actions/workflows/ci.yml/runs?status=completed&per_page=50`
 * response, trimmed to the fields the tool reads.
 */
const RECORDED_RUNS = JSON.stringify({
  total_count: 5,
  workflow_runs: [
    {
      id: 101,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-10-27T10:00:00Z",
      updated_at: "2026-10-27T10:04:00Z",
    },
    {
      id: 102,
      event: "pull_request",
      status: "completed",
      conclusion: "failure",
      run_started_at: "2026-10-27T11:00:00Z",
      updated_at: "2026-10-27T11:05:02Z",
    },
    {
      id: 103,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-10-27T12:00:00Z",
      updated_at: "2026-10-27T12:06:00Z",
    },
    {
      id: 104,
      event: "push",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-10-26T10:00:00Z",
      updated_at: "2026-10-26T10:03:00Z",
    },
    {
      id: 105,
      event: "merge_group",
      status: "completed",
      conclusion: "success",
      created_at: "2026-10-25T10:00:00Z",
      run_started_at: null,
      updated_at: "2026-10-25T10:02:00Z",
    },
  ],
});

/** One recorded `GET /actions/runs/{run_id}/jobs` response per run in RECORDED_RUNS. */
const RECORDED_JOBS: Record<number, Array<Record<string, unknown>>> = {
  101: [
    {
      name: "check (ubuntu-latest, node 24)",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-27T10:00:00Z",
      completed_at: "2026-10-27T10:03:20Z",
    },
    {
      name: "self-scan",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-27T10:00:00Z",
      completed_at: "2026-10-27T10:01:40Z",
    },
    {
      name: "coverage-badge",
      status: "completed",
      conclusion: "skipped",
      started_at: null,
      completed_at: null,
    },
  ],
  102: [
    {
      name: "check (ubuntu-latest, node 24)",
      status: "completed",
      conclusion: "failure",
      started_at: "2026-10-27T11:00:00Z",
      completed_at: "2026-10-27T11:04:10Z",
    },
    {
      name: "self-scan",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-27T11:00:00Z",
      completed_at: "2026-10-27T11:02:00Z",
    },
    {
      name: "lighthouse",
      status: "in_progress",
      conclusion: null,
      started_at: "2026-10-27T11:00:00Z",
      completed_at: null,
    },
  ],
  103: [
    {
      name: "check (ubuntu-latest, node 24)",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-27T12:00:00Z",
      completed_at: "2026-10-27T12:05:00Z",
    },
    {
      name: "self-scan",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-27T12:00:00Z",
      completed_at: "2026-10-27T12:02:20Z",
    },
  ],
  104: [
    {
      name: "check (ubuntu-latest, node 24)",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-26T10:00:00Z",
      completed_at: "2026-10-26T10:02:30Z",
    },
  ],
  105: [
    {
      name: "check (ubuntu-latest, node 24)",
      status: "completed",
      conclusion: "success",
      started_at: "2026-10-25T10:00:00Z",
      completed_at: "2026-10-25T10:01:40Z",
    },
  ],
};

function jobsResponse(runId: number): string {
  return JSON.stringify({ total_count: RECORDED_JOBS[runId]?.length ?? 0, jobs: RECORDED_JOBS[runId] ?? [] });
}

/** Serves the recorded API responses and fails any URL the tool should not request. */
function recordedFetcher(): Fetcher {
  return async (url) => {
    if (url.includes("/actions/workflows/")) return { status: 200, text: RECORDED_RUNS };
    const match = /\/actions\/runs\/(\d+)\/jobs/.exec(url);
    if (match) return { status: 200, text: jobsResponse(Number(match[1])) };
    return { status: 404, text: "" };
  };
}

function recordedReport() {
  const runs = parseRunsResponse(RECORDED_RUNS);
  const jobsByRun = new Map(runs.map((run) => [run.id, parseJobsResponse(jobsResponse(run.id))]));
  return summarizeWorkflow({ date: "2026-10-28", workflow: "ci.yml", runs, jobsByRun });
}

test("percentile interpolates between ranks and leaves an empty sample as null", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 90), 42);
  assert.equal(percentile([100, 200], 50), 150);
  assert.equal(percentile([100, 200, 300, 400], 90), 370);
  assert.throws(() => percentile([1], 101), /between 0 and 100/);
});

test("durations ignore missing, invalid, and reversed timestamps", () => {
  assert.equal(durationSeconds("2026-10-27T10:00:00Z", "2026-10-27T10:00:30Z"), 30);
  assert.equal(durationSeconds(undefined, "2026-10-27T10:00:30Z"), null);
  assert.equal(durationSeconds("2026-10-27T10:00:00Z", null), null);
  assert.equal(durationSeconds("not-a-date", "not-a-date"), null);
  assert.equal(durationSeconds("2026-10-27T10:00:30Z", "2026-10-27T10:00:00Z"), null);

  assert.deepEqual(durationStats([100, 200, 300, 400]), { samples: 4, p50Seconds: 250, p90Seconds: 370 });
  assert.deepEqual(durationStats([]), { samples: 0, p50Seconds: null, p90Seconds: null });
});

test("reads the recorded API response and computes p50 and p90 per event and per job", () => {
  const report = recordedReport();

  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.date, "2026-10-28");
  assert.equal(report.workflow, "ci.yml");
  assert.equal(report.runs, 5);
  assert.deepEqual(report.overall, { samples: 5, p50Seconds: 240, p90Seconds: 336.8 });
  assert.deepEqual(report.events.pull_request, { samples: 3, p50Seconds: 302, p90Seconds: 348.4 });
  assert.deepEqual(report.events.push, { samples: 1, p50Seconds: 180, p90Seconds: 180 });
  assert.deepEqual(report.events.merge_group, { samples: 1, p50Seconds: 120, p90Seconds: 120 });
  assert.deepEqual(report.jobs["check (ubuntu-latest, node 24)"], {
    samples: 5,
    p50Seconds: 200,
    p90Seconds: 280,
  });
  assert.deepEqual(report.jobs["self-scan"], { samples: 3, p50Seconds: 120, p90Seconds: 136 });
  assert.deepEqual(Object.keys(report.jobs), ["check (ubuntu-latest, node 24)", "self-scan"]);
  assert.equal(report.pullRequestP50Seconds, 302);
  assert.equal(report.slowPullRequests, true);
});

test("skipped and unfinished jobs do not contribute samples", () => {
  const report = recordedReport();
  assert.equal(report.jobs["coverage-badge"], undefined);
  assert.equal(report.jobs.lighthouse, undefined);
});

test("formats durations for humans", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(42), "42s");
  assert.equal(formatDuration(302), "5m 2s");
  assert.equal(formatDuration(348.4), "5m 48s");
  assert.equal(formatDuration(600), "10m 0s");
});

test("renders the summary, including the five-minute verdict", () => {
  const summary = renderSummary(recordedReport());
  assert.match(summary, /### CI duration/);
  assert.match(summary, /Measured the last 5 completed runs of `ci\.yml`/);
  assert.match(summary, /\| All runs \| 5 \| 4m 0s \| 5m 37s \|/);
  assert.match(summary, /\| pull_request \| 3 \| 5m 2s \| 5m 48s \|/);
  assert.match(summary, /\| check \(ubuntu-latest, node 24\) \| 5 \| 3m 20s \| 4m 40s \|/);
  assert.match(summary, /over the five-minute target: 5m 2s/);

  const fast = renderSummary({ ...recordedReport(), slowPullRequests: false, pullRequestP50Seconds: 250 });
  assert.match(fast, /within the five-minute target: 4m 10s/);
});

test("renders one issue body with the marker, the label text, and the slowest jobs", () => {
  const body = renderIssueBody(recordedReport());
  assert.match(body, new RegExp(ISSUE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(body, /\*\*5m 2s\*\*/);
  assert.match(body, /\| Pull requests \| 3 \| 5m 2s \| 5m 48s \|/);
  assert.ok(body.indexOf("check (ubuntu-latest, node 24)") < body.indexOf("self-scan"));
});

test("opens one issue, updates the existing one, and does nothing while fast", async () => {
  const report = recordedReport();
  const created: Array<{ repo: string; title: string; body: string; labels: string[] }> = [];
  const emptyClient: IssueClient = {
    async listOpenIssues() {
      return [];
    },
    async createIssue(repo, title, body, labels) {
      created.push({ repo, title, body, labels });
      return { number: 12, title, body, state: "open", html_url: "https://github.com/arminazimi/evergreen/issues/12" };
    },
    async updateIssue() {
      throw new Error("should not update");
    },
  };
  const createdResult = await ensureSlowIssue(report, "arminazimi/evergreen", emptyClient);
  assert.equal(createdResult.action, "created");
  assert.equal(createdResult.issue?.number, 12);
  assert.deepEqual(created, [
    { repo: "arminazimi/evergreen", title: ISSUE_TITLE, body: renderIssueBody(report), labels: [ISSUE_LABEL] },
  ]);

  const updated: number[] = [];
  const existingClient: IssueClient = {
    async listOpenIssues() {
      return [{ number: 7, title: ISSUE_TITLE, state: "open", body: ISSUE_MARKER }];
    },
    async createIssue() {
      throw new Error("should not create");
    },
    async updateIssue(_repo, number, body) {
      updated.push(number);
      return { number, title: ISSUE_TITLE, body, state: "open" };
    },
  };
  assert.equal((await ensureSlowIssue(report, "arminazimi/evergreen", existingClient)).action, "updated");
  assert.deepEqual(updated, [7]);
  assert.equal((await ensureSlowIssue({ ...report, slowPullRequests: false }, "arminazimi/evergreen", existingClient)).action, "none");
});

test("parses arguments, defaults the metrics path to the date, and rejects bad input", () => {
  const options = parseArguments([], new Date("2026-10-30T12:00:00Z"));
  assert.equal(options.workflow, "ci.yml");
  assert.equal(options.date, "2026-10-30");
  assert.equal(options.outPath, resolve("metrics/ci/2026-10-30.json"));
  assert.equal(options.openIssue, false);

  const custom = parseArguments([
    "--repo",
    "test/repo",
    "--workflow",
    "other.yml",
    "--date",
    "2026-10-01",
    "--summary",
    "summary.md",
    "--out",
    "out.json",
    "--token",
    "secret",
    "--open-issue",
  ]);
  assert.equal(custom.repo, "test/repo");
  assert.equal(custom.workflow, "other.yml");
  assert.equal(custom.date, "2026-10-01");
  assert.equal(custom.summaryPath, "summary.md");
  assert.equal(custom.outPath, resolve("out.json"));
  assert.equal(custom.token, "secret");
  assert.equal(custom.openIssue, true);

  assert.throws(() => parseArguments(["--unknown"]), /Unexpected argument/);
  assert.throws(() => parseArguments(["--repo"]), /needs a value/);
  assert.throws(() => parseArguments(["--date", "10-30-2026"]), /YYYY-MM-DD/);
});

test("collectRuns reads the newest completed runs and each run's jobs", async () => {
  const requested: string[] = [];
  const fetcher: Fetcher = async (url, headers) => {
    requested.push(url);
    assert.equal(headers?.Accept, "application/vnd.github+json");
    assert.equal(headers?.Authorization, "Bearer secret");
    return recordedFetcher()(url, headers);
  };
  const collected = await collectRuns({
    repo: "arminazimi/evergreen",
    workflow: "ci.yml",
    fetcher,
    token: "secret",
  });
  assert.equal(collected.runs.length, 5);
  assert.equal(collected.jobsByRun.get(101)?.length, 3);
  assert.match(requested[0]!, /\/actions\/workflows\/ci\.yml\/runs\?status=completed&per_page=50$/);
  assert.match(requested[1]!, /\/actions\/runs\/101\/jobs\?per_page=100$/);
  assert.equal(requested.length, 6);
});

test("collectRuns fails with the URL when GitHub returns an error", async () => {
  await assert.rejects(
    () => collectRuns({ repo: "x/y", workflow: "ci.yml", fetcher: async () => ({ status: 500, text: "" }) }),
    /HTTP 500.*actions\/workflows\/ci\.yml\/runs/,
  );
});

test("main writes the metrics file and appends the step summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-ci-duration-"));
  try {
    const summaryPath = join(dir, "summary.md");
    const outPath = join(dir, "2026-10-28.json");
    const code = await main(
      ["--repo", "arminazimi/evergreen", "--date", "2026-10-28", "--summary", summaryPath, "--out", outPath],
      { fetcher: recordedFetcher() },
    );
    assert.equal(code, 0);

    const saved = JSON.parse(await readFile(outPath, "utf8")) as {
      schemaVersion: string;
      runs: number;
      slowPullRequests: boolean;
    };
    assert.equal(saved.schemaVersion, SCHEMA_VERSION);
    assert.equal(saved.runs, 5);
    assert.equal(saved.slowPullRequests, true);

    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, /### CI duration/);
    assert.match(summary, /pull_request \| 3 \| 5m 2s/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}

interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, { permissions?: Record<string, string>; steps: WorkflowStep[] }>;
}

test("ci-health runs weekly, writes the summary and metrics, and opens at most one issue", async () => {
  const text = await readFile(resolve(".github/workflows/ci-health.yml"), "utf8");
  const workflow = parseYaml(text) as Workflow;

  assert.deepEqual(Object.keys(workflow.on), ["schedule", "workflow_dispatch"]);
  const schedule = workflow.on.schedule as Array<{ cron: string }>;
  assert.equal(schedule.length, 1);
  assert.match(schedule[0]!.cron, /^\S+ \S+ \* \* [0-6]$/);
  assert.deepEqual(workflow.permissions, { contents: "read" });

  const job = workflow.jobs.measure!;
  assert.equal(job.permissions?.actions, "read");
  assert.equal(job.permissions?.contents, "read");
  assert.equal(job.permissions?.issues, "write");

  const measure = job.steps.find((step) => step.run?.includes("dist/tools/ci-duration.js"))!;
  assert.ok(measure);
  assert.equal(measure.env?.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  assert.match(measure.run!, /--summary "\$GITHUB_STEP_SUMMARY"/);
  assert.match(measure.run!, /--open-issue/);

  const upload = job.steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"))!;
  assert.ok(upload);
  assert.equal(upload.with?.path, "metrics/ci");

  for (const step of job.steps.filter((item) => item.uses)) {
    assert.match(step.uses!, /@[0-9a-f]{40}$/, step.uses);
  }
});
