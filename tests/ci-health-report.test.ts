import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import {
  collectCompletedRuns,
  DEFAULT_WEEKS,
  formatRate,
  isoWeekKey,
  main,
  parseArguments,
  parseHealthRuns,
  renderHealthSummary,
  SCHEMA_VERSION,
  summarizeHealth,
  weekHealth,
  type Fetcher,
  type HealthRun,
} from "../tools/ci-health-report.js";

/**
 * Recorded `GET /repos/{owner}/{repo}/actions/workflows/ci.yml/runs?status=completed&per_page=100`
 * response, trimmed to the fields the tool reads. W44 holds two pull requests (one failed once and
 * rerun) and a push; W45 holds a cancelled and a successful pull request; run 206 has no end time.
 */
const RECORDED_RUNS = JSON.stringify({
  total_count: 6,
  workflow_runs: [
    {
      id: 201,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-10-27T10:00:00Z",
      updated_at: "2026-10-27T10:04:00Z",
      run_attempt: 1,
    },
    {
      id: 202,
      event: "pull_request",
      status: "completed",
      conclusion: "failure",
      run_started_at: "2026-10-27T11:00:00Z",
      updated_at: "2026-10-27T11:05:02Z",
      run_attempt: 2,
    },
    {
      id: 203,
      event: "push",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-10-28T09:00:00Z",
      updated_at: "2026-10-28T09:03:00Z",
      run_attempt: 1,
    },
    {
      id: 204,
      event: "pull_request",
      status: "completed",
      conclusion: "cancelled",
      run_started_at: "2026-11-02T10:00:00Z",
      updated_at: "2026-11-02T10:01:00Z",
      run_attempt: 1,
    },
    {
      id: 205,
      event: "pull_request",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-11-02T12:00:00Z",
      updated_at: "2026-11-02T12:06:00Z",
      run_attempt: 1,
    },
    {
      id: 206,
      event: "schedule",
      status: "completed",
      conclusion: "success",
      run_started_at: "2026-11-02T13:00:00Z",
      updated_at: null,
      run_attempt: 1,
    },
  ],
});

function recordedRuns(): HealthRun[] {
  return parseHealthRuns(RECORDED_RUNS);
}

function recordedFetcher(): Fetcher {
  return async (url) =>
    url.includes("/actions/workflows/") ? { status: 200, text: RECORDED_RUNS } : { status: 404, text: "" };
}

test("isoWeekKey labels ISO weeks in UTC, including year boundaries and 53-week years", () => {
  assert.equal(isoWeekKey("2026-10-27T12:00:00Z"), "2026-W44");
  assert.equal(isoWeekKey("2026-11-01T23:59:59Z"), "2026-W44");
  assert.equal(isoWeekKey("2026-11-02T00:00:00Z"), "2026-W45");
  assert.equal(isoWeekKey("2025-12-29T00:00:00Z"), "2026-W01");
  assert.equal(isoWeekKey("2026-01-04T23:00:00Z"), "2026-W01");
  assert.equal(isoWeekKey("2024-12-29T00:00:00Z"), "2024-W52");
  assert.equal(isoWeekKey("2024-12-30T00:00:00Z"), "2025-W01");
  assert.equal(isoWeekKey("2026-12-31T00:00:00Z"), "2026-W53");
  assert.equal(isoWeekKey("2027-01-01T00:00:00Z"), "2026-W53");
  assert.equal(isoWeekKey(null), null);
  assert.equal(isoWeekKey("not-a-date"), null);
});

test("parseHealthRuns reads the recorded response and skips entries without an id", () => {
  const runs = recordedRuns();
  assert.equal(runs.length, 6);
  const failed = runs.find((run) => run.id === 202);
  assert.ok(failed);
  assert.equal(failed.conclusion, "failure");
  assert.equal(failed.attempted, true);
  const noEnd = runs.find((run) => run.id === 206);
  assert.ok(noEnd);
  assert.equal(noEnd.endedAt, null);
});

test("parseHealthRuns falls back to created_at and tolerates missing fields", () => {
  const runs = parseHealthRuns(
    JSON.stringify({
      workflow_runs: [
        { id: 1, created_at: "2026-10-28T08:00:00Z", updated_at: "2026-10-28T08:02:00Z" },
        { id: 2, run_attempt: 3, run_started_at: "2026-10-28T09:00:00Z", updated_at: "2026-10-28T09:01:00Z" },
        "not-an-object",
        null,
        { event: 42 },
      ],
    }),
  );
  assert.equal(runs.length, 2);
  const first = runs[0];
  assert.ok(first);
  assert.equal(first.startedAt, "2026-10-28T08:00:00Z");
  assert.equal(first.event, "unknown");
  assert.equal(first.conclusion, null);
  assert.equal(first.attempted, false);
  const second = runs[1];
  assert.ok(second);
  assert.equal(second.attempted, true);
  assert.equal(second.startedAt, "2026-10-28T09:00:00Z");
});

test("parseHealthRuns rejects a response without a runs array", () => {
  assert.throws(() => parseHealthRuns("{}"), /no workflow_runs array/);
  assert.throws(() => parseHealthRuns("not json"), SyntaxError);
});

test("summarizeHealth buckets runs by week and computes duration, failure, cancellation, and rerun numbers", () => {
  const report = summarizeHealth({ date: "2026-11-02", workflow: "ci.yml", runs: recordedRuns(), limit: 8 });
  assert.equal(report.schemaVersion, SCHEMA_VERSION);
  assert.equal(report.date, "2026-11-02");
  assert.equal(report.fetched, 6);
  assert.equal(report.weeks.length, 2);

  const w44 = report.weeks[0];
  assert.ok(w44);
  assert.deepEqual(w44, {
    week: "2026-W44",
    runs: 3,
    duration: { samples: 3, p50Seconds: 240, p90Seconds: 289.6 },
    failures: 1,
    cancelled: 0,
    reruns: 1,
    failureRate: 0.3333,
    cancellationRate: 0,
  });

  const w45 = report.weeks[1];
  assert.ok(w45);
  assert.deepEqual(w45, {
    week: "2026-W45",
    runs: 2,
    duration: { samples: 2, p50Seconds: 210, p90Seconds: 330 },
    failures: 0,
    cancelled: 1,
    reruns: 0,
    failureRate: 0,
    cancellationRate: 0.5,
  });
});

test("summarizeHealth keeps only the most recent weeks and runs without an end time get no week", () => {
  const latest = summarizeHealth({ date: "2026-11-02", workflow: "ci.yml", runs: recordedRuns(), limit: 1 });
  assert.deepEqual(
    latest.weeks.map((week) => week.week),
    ["2026-W45"],
  );
  const noEnd = summarizeHealth({
    date: "2026-11-02",
    workflow: "ci.yml",
    runs: recordedRuns().filter((run) => run.id === 206),
    limit: 8,
  });
  assert.deepEqual(noEnd.weeks, []);
  assert.equal(noEnd.fetched, 1);
});

test("weekHealth on an empty bucket would divide by zero, so summarizeHealth never builds one", () => {
  // Buckets exist only because a run landed in them; this pins the direct function for one run.
  const single = recordedRuns().filter((run) => run.id === 201);
  const health = weekHealth("2026-W44", single);
  assert.deepEqual(health.duration, { samples: 1, p50Seconds: 240, p90Seconds: 240 });
  assert.equal(health.failureRate, 0);
  assert.equal(health.cancellationRate, 0);
});

test("rates format as one-decimal percentages", () => {
  assert.equal(formatRate(0), "0.0%");
  assert.equal(formatRate(0.3333), "33.3%");
  assert.equal(formatRate(0.5), "50.0%");
  assert.equal(formatRate(1), "100.0%");
});

test("renderHealthSummary prints the weekly table and names the flake signal", () => {
  const summary = renderHealthSummary(
    summarizeHealth({ date: "2026-11-02", workflow: "ci.yml", runs: recordedRuns(), limit: 8 }),
  );
  assert.match(summary, /### CI health by week/);
  assert.match(summary, /Bucketed the last 6 completed runs of `ci\.yml`/);
  assert.match(summary, /\| Week \| Runs \| p50 \| p90 \| Failure rate \| Cancellation rate \| Reruns \|/);
  assert.match(summary, /\| 2026-W44 \| 3 \| 4m 0s \| 4m 50s \| 33\.3% \| 0\.0% \| 1 \|/);
  assert.match(summary, /\| 2026-W45 \| 2 \| 3m 30s \| 5m 30s \| 0\.0% \| 50\.0% \| 0 \|/);
  assert.match(summary, /run-tests\.mjs --list-weekly-flaky/);

  const empty = renderHealthSummary(summarizeHealth({ date: "2026-11-02", workflow: "ci.yml", runs: [], limit: 8 }));
  assert.match(empty, /\| — \| 0 \| — \| — \| 0\.0% \| 0\.0% \| 0 \|/);
});

test("collectCompletedRuns requests the completed-runs page with the API headers", async () => {
  const requested: string[] = [];
  const fetcher: Fetcher = async (url, headers) => {
    requested.push(url);
    assert.equal(headers?.Accept, "application/vnd.github+json");
    assert.equal(headers?.Authorization, "Bearer secret");
    return recordedFetcher()(url, headers);
  };
  const runs = await collectCompletedRuns({
    repo: "arminazimi/evergreen",
    workflow: "ci.yml",
    fetcher,
    token: "secret",
  });
  assert.equal(runs.length, 6);
  assert.equal(requested.length, 1);
  assert.match(requested[0] ?? "", /\/actions\/workflows\/ci\.yml\/runs\?status=completed&per_page=100$/);
});

test("collectCompletedRuns fails with the URL when GitHub returns an error", async () => {
  await assert.rejects(
    () => collectCompletedRuns({ repo: "x/y", workflow: "ci.yml", fetcher: async () => ({ status: 403, text: "" }) }),
    /HTTP 403.*actions\/workflows\/ci\.yml\/runs/,
  );
});

test("parses arguments, defaults the metrics path to the dated health file, and rejects bad input", () => {
  const options = parseArguments([], new Date("2026-11-02T12:00:00Z"));
  assert.equal(options.workflow, "ci.yml");
  assert.equal(options.date, "2026-11-02");
  assert.equal(options.outPath, resolve("metrics/ci/health-2026-11-02.json"));
  assert.equal(options.weeks, DEFAULT_WEEKS);
  assert.equal(options.summaryPath, undefined);

  const custom = parseArguments([
    "--repo",
    "test/repo",
    "--workflow",
    "other.yml",
    "--date",
    "2026-11-01",
    "--weeks",
    "12",
    "--summary",
    "summary.md",
    "--out",
    "out.json",
    "--token",
    "secret",
  ]);
  assert.equal(custom.repo, "test/repo");
  assert.equal(custom.workflow, "other.yml");
  assert.equal(custom.date, "2026-11-01");
  assert.equal(custom.weeks, 12);
  assert.equal(custom.summaryPath, "summary.md");
  assert.equal(custom.outPath, resolve("out.json"));
  assert.equal(custom.token, "secret");

  assert.throws(() => parseArguments(["--unknown"]), /Unexpected argument/);
  assert.throws(() => parseArguments(["positional"]), /Unexpected argument/);
  assert.throws(() => parseArguments(["--repo"]), /needs a value/);
  assert.throws(() => parseArguments(["--date", "11-02-2026"]), /YYYY-MM-DD/);
  assert.throws(() => parseArguments(["--weeks", "0"]), /positive integer/);
  assert.throws(() => parseArguments(["--weeks", "1.5"]), /positive integer/);
  assert.throws(() => parseArguments(["--weeks", "eight"]), /positive integer/);
});

test("main writes the weekly health JSON and appends the step summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-ci-health-report-"));
  try {
    const summaryPath = join(dir, "summary.md");
    const outPath = join(dir, "health-2026-11-02.json");
    const code = await main(
      [
        "--repo",
        "arminazimi/evergreen",
        "--date",
        "2026-11-02",
        "--weeks",
        "2",
        "--summary",
        summaryPath,
        "--out",
        outPath,
      ],
      { fetcher: recordedFetcher() },
    );
    assert.equal(code, 0);

    const saved = JSON.parse(await readFile(outPath, "utf8")) as {
      schemaVersion: string;
      fetched: number;
      weeks: Array<{ week: string; failureRate: number; cancellationRate: number; reruns: number }>;
    };
    assert.equal(saved.schemaVersion, SCHEMA_VERSION);
    assert.equal(saved.fetched, 6);
    assert.deepEqual(
      saved.weeks.map((week) => week.week),
      ["2026-W44", "2026-W45"],
    );
    const w44 = saved.weeks[0];
    assert.ok(w44);
    assert.equal(w44.failureRate, 0.3333);
    assert.equal(w44.reruns, 1);

    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, /### CI health by week/);
    assert.match(summary, /2026-W45 \| 2 \| 3m 30s \| 5m 30s \| 0\.0% \| 50\.0%/);
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
  jobs: Record<string, { steps?: WorkflowStep[] }>;
}

test("ci-health runs the weekly health report inside the existing weekly measure job", async () => {
  const text = await readFile(resolve(".github/workflows/ci-health.yml"), "utf8");
  const workflow = parseYaml(text) as Workflow;

  // The weekly measure job already exists (tests/ci-duration.test.ts pins its triggers); this
  // report adds one step to it and must not change the trigger keys, schedules, or permissions.
  assert.deepEqual(Object.keys(workflow.on), ["workflow_run", "schedule", "workflow_dispatch"]);
  assert.equal((workflow.on.schedule as Array<{ cron: string }>).length, 2);
  assert.deepEqual(workflow.permissions, { contents: "read" });

  const measure = workflow.jobs.measure;
  assert.ok(measure?.steps);
  const steps = measure.steps;
  const healthIndex = steps.findIndex((step) => step.run?.includes("dist/tools/ci-health-report.js"));
  assert.ok(healthIndex >= 0, "expected a step that runs tools/ci-health-report.js");
  const health = steps[healthIndex];
  assert.ok(health?.run);
  assert.match(health.run, /--summary "\$GITHUB_STEP_SUMMARY"/);
  assert.match(health.run, /--weeks 8/);
  assert.equal(health.env?.GITHUB_TOKEN, "${{ secrets.GITHUB_TOKEN }}");
  assert.equal(health.env?.GITHUB_REPOSITORY, "${{ github.repository }}");

  // It must run before the artifact upload so metrics/ci/health-<date>.json ships in the artifact.
  const uploadIndex = steps.findIndex((step) => step.uses?.startsWith("actions/upload-artifact@"));
  assert.ok(uploadIndex >= 0);
  assert.ok(healthIndex < uploadIndex, "the health step must run before the metrics upload");
  assert.equal(steps[uploadIndex]?.with?.path, "metrics/ci");

  for (const step of steps.filter((item) => item.uses)) {
    // `./` and `$/` resolve inside this repository, so neither carries a pinned ref.
    if (step.uses!.startsWith("$/") || step.uses!.startsWith("./")) continue;
    assert.match(step.uses ?? "", /@[0-9a-f]{40}$/, step.uses ?? "");
  }
});
