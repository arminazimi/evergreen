import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  evaluateIssueBrief,
  evaluateIssues,
  fetchGoodFirstIssues,
  hasDoneCheck,
  hasFiles,
  hasSteps,
  main,
  parseArguments,
  renderSummary,
  type Issue,
} from "../tools/check-good-first-issues.js";

const COMPLETE_BODY = `
<!-- evergreen-roadmap-key: example.task -->
> **Epic:** #1 · **Phase:** v0.9.0

## Goal
Make Evergreen better.

## Agent brief

**Files**
- \`tools/check-good-first-issues.ts\`
- \`.github/workflows/labels.yml\`

**Steps**
1. Check that good first issues have complete briefs.
2. Report missing files, steps, or done-checks.

**Do not**
- Do not add network access to scans.

**Run**
\`\`\`bash
npm ci
npm run check
\`\`\`

## Done when
- [ ] Incomplete issues are reported weekly.
- [ ] npm run check passes.
`;

test("hasFiles detects file lists in brief", () => {
  assert.equal(hasFiles(COMPLETE_BODY), true);
  assert.equal(hasFiles("**Files**\n- `src/index.ts`\n\n**Steps**"), true);
  assert.equal(hasFiles("**Files**\n* `src/index.ts`\n\n**Steps**"), true);
  assert.equal(hasFiles("**Files**\n• `src/index.ts`\n\n**Steps**"), true);
  assert.equal(hasFiles("## Files\n- `src/index.ts`\n\n## Steps"), true);
  assert.equal(hasFiles("Files:\n- `src/index.ts`\n\nSteps:"), true);

  // Missing or empty
  assert.equal(hasFiles(""), false);
  assert.equal(hasFiles(null), false);
  assert.equal(hasFiles(undefined), false);
  assert.equal(hasFiles("**Files**\n\n**Steps**\n1. Do it"), false);
  assert.equal(hasFiles("## Goal\nSome goal without files\n\n## Steps\n1. Step"), false);
});

test("hasSteps detects steps in brief", () => {
  assert.equal(hasSteps(COMPLETE_BODY), true);
  assert.equal(hasSteps("**Steps**\n1. First step\n2. Second step\n\n## Done when"), true);
  assert.equal(hasSteps("**Steps**\n- Do step one\n- Do step two"), true);
  assert.equal(hasSteps("## Steps\n1. Do it"), true);
  assert.equal(hasSteps("Steps:\n1. Do it"), true);

  // Missing or empty
  assert.equal(hasSteps(""), false);
  assert.equal(hasSteps(null), false);
  assert.equal(hasSteps(undefined), false);
  assert.equal(hasSteps("**Steps**\n\n## Done when\n- [ ] done"), false);
  assert.equal(hasSteps("## Goal\nSome goal\n\n**Files**\n- `foo`"), false);
});

test("hasDoneCheck detects checkbox done criteria", () => {
  assert.equal(hasDoneCheck(COMPLETE_BODY), true);
  assert.equal(hasDoneCheck("## Done when\n- [ ] Tests pass\n- [x] Merged"), true);
  assert.equal(hasDoneCheck("## Done when\n[ ] Tests pass"), true);
  assert.equal(hasDoneCheck("**Done when**\n- [ ] Done"), true);
  assert.equal(hasDoneCheck("Done when:\n- [ ] Done"), true);
  assert.equal(hasDoneCheck("## Exit criteria\n- [ ] Milestone complete"), true);

  // Missing checkboxes or section
  assert.equal(hasDoneCheck(""), false);
  assert.equal(hasDoneCheck(null), false);
  assert.equal(hasDoneCheck(undefined), false);
  assert.equal(hasDoneCheck("## Done when\nAll tasks complete"), false);
  assert.equal(hasDoneCheck("## Goal\nNo done section"), false);
});

test("evaluateIssueBrief identifies defects", () => {
  const completeIssue: Issue = {
    number: 101,
    title: "Complete brief issue",
    body: COMPLETE_BODY,
    html_url: "https://github.com/arminazimi/evergreen/issues/101",
  };
  assert.equal(evaluateIssueBrief(completeIssue), null);

  const missingAll: Issue = {
    number: 102,
    title: "Vague issue",
    body: "Just a vague issue description.",
  };
  const defectAll = evaluateIssueBrief(missingAll);
  assert.ok(defectAll);
  assert.equal(defectAll.number, 102);
  assert.deepEqual(defectAll.defects, ["files", "steps", "done-check"]);
  assert.equal(defectAll.url, "https://github.com/arminazimi/evergreen/issues/102");

  const missingDone: Issue = {
    number: 103,
    title: "Missing done check",
    body: "**Files**\n- `file.ts`\n\n**Steps**\n1. Do something",
  };
  const defectDone = evaluateIssueBrief(missingDone);
  assert.ok(defectDone);
  assert.deepEqual(defectDone.defects, ["done-check"]);
});

test("evaluateIssues aggregates counts accurately", () => {
  const issues: Issue[] = [
    { number: 1, title: "Good 1", body: COMPLETE_BODY },
    { number: 2, title: "Good 2", body: COMPLETE_BODY },
    { number: 3, title: "Bad", body: "No brief" },
  ];
  const report = evaluateIssues(issues, new Date("2026-10-28T12:00:00Z"));
  assert.equal(report.total, 3);
  assert.equal(report.complete, 2);
  assert.equal(report.incomplete.length, 1);
  assert.equal(report.incomplete[0]?.number, 3);
  assert.equal(report.checkedAt, "2026-10-28T12:00:00.000Z");
});

test("renderSummary formats complete and incomplete reports", () => {
  const allGood = evaluateIssues([{ number: 1, title: "Good", body: COMPLETE_BODY }]);
  const summaryGood = renderSummary(allGood);
  assert.match(summaryGood, /Total issues checked:\*\* 1/);
  assert.match(summaryGood, /Complete briefs:\*\* 1/);
  assert.match(summaryGood, /All open `good first issue`s have a complete brief/);

  const withBad = evaluateIssues([
    { number: 1, title: "Good", body: COMPLETE_BODY },
    { number: 2, title: "Bad issue", body: "" },
  ]);
  const summaryBad = renderSummary(withBad);
  assert.match(summaryBad, /Incomplete briefs:\*\* 1/);
  assert.match(summaryBad, /\| \[#2\]\(https:\/\/github\.com\/arminazimi\/evergreen\/issues\/2\) \| Bad issue \| files, steps, done-check \|/);
});

test("parseArguments handles flags and defaults", () => {
  const defaults = parseArguments([]);
  assert.equal(defaults.repo, "arminazimi/evergreen");
  assert.equal(defaults.state, "open");
  assert.equal(defaults.summaryPath, undefined);
  assert.equal(defaults.outPath, undefined);

  const custom = parseArguments([
    "--repo",
    "test/repo",
    "--state",
    "all",
    "--summary",
    "summary.md",
    "--out",
    "report.json",
    "--token",
    "secret-token",
  ]);
  assert.equal(custom.repo, "test/repo");
  assert.equal(custom.state, "all");
  assert.equal(custom.summaryPath, "summary.md");
  assert.equal(custom.outPath, "report.json");
  assert.equal(custom.token, "secret-token");

  assert.throws(() => parseArguments(["--unknown"]), /Unexpected argument/);
  assert.throws(() => parseArguments(["--repo"]), /needs a value/);
  assert.throws(() => parseArguments(["--state", "invalid"]), /Invalid --state/);
});

test("fetchGoodFirstIssues handles pagination and ignores pull requests", async () => {
  const requests: string[] = [];
  const mockFetcher = async (url: string, init?: RequestInit): Promise<Response> => {
    requests.push(url);
    const parsed = new URL(url);
    const page = parsed.searchParams.get("page");
    if (page === "1") {
      const page1: Issue[] = Array.from({ length: 100 }, (_, i) => ({
        number: i + 1,
        title: `Issue ${i + 1}`,
        body: COMPLETE_BODY,
        // Mark one as PR
        ...(i === 0 ? { pull_request: {} } : {}),
      }));
      return new Response(JSON.stringify(page1), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const page2: Issue[] = [
      { number: 101, title: "Issue 101", body: COMPLETE_BODY },
    ];
    return new Response(JSON.stringify(page2), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const issues = await fetchGoodFirstIssues({
    repo: "arminazimi/evergreen",
    token: "test-token",
    fetcher: mockFetcher,
  });

  assert.equal(requests.length, 2);
  // Total 101 items across pages, but issue 1 was a PR, so 100 issues returned
  assert.equal(issues.length, 100);
  assert.equal(issues.some((i) => i.number === 1), false);
  assert.equal(issues.some((i) => i.number === 101), true);
});

test("fetchGoodFirstIssues throws readable error on API failure", async () => {
  const failingFetcher = async (): Promise<Response> => {
    return new Response("Not Found", { status: 404, statusText: "Not Found" });
  };

  await assert.rejects(
    () => fetchGoodFirstIssues({ repo: "arminazimi/nonexistent", fetcher: failingFetcher }),
    /HTTP 404 Not Found/,
  );
});

test("labels.yml workflow contains weekly schedule and check-briefs job", async () => {
  const content = await readFile(".github/workflows/labels.yml", "utf8");
  assert.match(content, /schedule:\s*\n\s*-\s*cron:\s*["'][^"']+["']/);
  assert.match(content, /check-briefs:/);
  assert.match(content, /node dist\/tools\/check-good-first-issues\.js/);
  assert.match(content, /sync:\s*\n\s*if: github\.event_name != 'schedule'/);
});

test("main writes summary and report files and returns correct exit code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gfi-test-"));
  try {
    const summaryPath = join(dir, "summary.md");
    const outPath = join(dir, "report.json");

    const goodFetcher = async (): Promise<Response> => {
      const issues: Issue[] = [{ number: 1, title: "Issue 1", body: COMPLETE_BODY }];
      return new Response(JSON.stringify(issues), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const codeSuccess = await main(["--summary", summaryPath, "--out", outPath], goodFetcher);
    assert.equal(codeSuccess, 0);

    const summaryContent = await readFile(summaryPath, "utf8");
    assert.match(summaryContent, /### Good First Issues Brief Check/);
    assert.match(summaryContent, /Complete briefs:\*\* 1/);

    const reportContent = JSON.parse(await readFile(outPath, "utf8")) as { complete: number; total: number };
    assert.equal(reportContent.total, 1);
    assert.equal(reportContent.complete, 1);

    const badFetcher = async (): Promise<Response> => {
      const issues: Issue[] = [{ number: 2, title: "Bad Issue", body: "No brief here" }];
      return new Response(JSON.stringify(issues), { status: 200, headers: { "Content-Type": "application/json" } });
    };

    const codeFailure = await main([], badFetcher);
    assert.equal(codeFailure, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

