import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { RegistryV2, RegistryV2Rule } from "../../src/registry.js";
import type {
  CandidateIssueRunner,
  IssueRecord,
  RenderedCandidateIssue,
} from "../../tools/importers/candidate-issues.js";
import {
  extractFreshnessKey,
  loadFreshnessTargets,
  main,
  measureFreshness,
  missedSources,
  parseFreshnessTargets,
  renderFreshnessIssue,
  renderFreshnessText,
  reportMisses,
  selectMissesToOpen,
} from "../../tools/importers/freshness.js";
import { importers } from "../../tools/importers/index.js";

const rule = (id: string, importer: string | undefined, reviewedAt: string) =>
  ({
    id,
    provenance: { observedAt: reviewedAt, reviewedAt, reviewer: "someone", ...(importer ? { importer } : {}) },
  }) as unknown as RegistryV2Rule;

const registries = (rules: RegistryV2Rule[]) => [{ name: "go", registry: { rules } as unknown as RegistryV2 }];
const targets = { maxAgeDays: { "go-1": 30, "go-2": 30, "npm-deprecated": 90 } };

test("a source is met inside its target, missed past it, and unmeasured without rules", () => {
  const report = measureFreshness(
    registries([
      rule("a", "go-1", "2026-09-01"),
      rule("b", "go-1", "2026-10-30"),
      rule("c", "go-2", "2026-09-01"),
      rule("d", undefined, "2020-01-01"),
      rule("e", "other", "2020-01-01"),
    ]),
    targets,
    "2026-11-07",
  );
  assert.deepEqual(
    report.sources.map((s) => [s.importer, s.status, s.ageDays, s.rules, s.lastReviewedAt]),
    [
      ["go-1", "met", 8, 2, "2026-10-30"],
      ["go-2", "missed", 67, 1, "2026-09-01"],
      ["npm-deprecated", "no-rules", null, 0, null],
    ],
  );
  assert.deepEqual(
    missedSources(report).map((s) => s.importer),
    ["go-2"],
  );
  assert.match(renderFreshnessText(report), /! go-2: missed; target 30 days; 67 days since 2026-09-01/);
});

test("the target day itself is met and a review after the reference day counts as zero days", () => {
  const report = measureFreshness(
    registries([rule("a", "go-1", "2026-10-08"), rule("b", "go-2", "2026-12-01")]),
    targets,
    "2026-11-07",
  );
  assert.deepEqual(report.sources.map((s) => [s.ageDays, s.status]).slice(0, 2), [
    [30, "met"],
    [0, "met"],
  ]);
  assert.throws(() => measureFreshness([], targets, "soon"), /--today/);
});

test("targets must be whole days and non-empty", () => {
  assert.throws(() => parseFreshnessTargets({}), /maxAgeDays/);
  assert.throws(() => parseFreshnessTargets({ maxAgeDays: { a: 0 } }), /"a"/);
  assert.throws(() => parseFreshnessTargets({ maxAgeDays: { a: 1.5 } }), /"a"/);
});

test("every registered importer has a target and no target names an unknown importer", async () => {
  const { maxAgeDays } = await loadFreshnessTargets();
  assert.deepEqual(Object.keys(maxAgeDays).sort(), importers.map((importer) => importer.id).sort());
  const text = await readFile("tools/importers/freshness.json", "utf8");
  assert.equal(text, `${JSON.stringify(JSON.parse(text), null, 2)}\n`);
});

const missed = measureFreshness(registries([rule("c", "go-2", "2026-09-01")]), targets, "2026-11-07").sources.filter(
  (s) => s.status === "missed",
);

test("the issue names the source, the target, the age, and carries a marker", () => {
  const issue = renderFreshnessIssue(missed[0]!, "2026-11-07");
  assert.equal(extractFreshnessKey(issue.body), "go-2");
  assert.match(issue.title, /go-2 source missed its 30-day freshness target/);
  assert.match(issue.body, /67 days before 2026-11-07/);
  assert.match(issue.body, /Do not add network access to scans/);
});

test("an open issue stops a repeat, a closed one does not, and the open cap holds", () => {
  const body = renderFreshnessIssue(missed[0]!, "2026-11-07").body;
  const open: IssueRecord = { title: "t", body, state: "OPEN" };
  assert.deepEqual(selectMissesToOpen(missed, [open]).skippedTracked, ["go-2"]);
  assert.equal(selectMissesToOpen(missed, [open]).toOpen.length, 0);
  assert.equal(selectMissesToOpen(missed, [{ ...open, state: "CLOSED" }]).toOpen.length, 1);
  const capped = selectMissesToOpen(missed, [open], 1);
  assert.equal(capped.toOpen.length, 0);
});

function fakeRunner(existing: IssueRecord[] = []) {
  const created: RenderedCandidateIssue[] = [];
  const runner: CandidateIssueRunner = {
    listExistingIssues: async () => existing,
    createIssue: async (issue) => {
      created.push(issue);
      return {};
    },
  };
  return { runner, created };
}

test("a miss opens exactly one issue; a met target and a dry run open none", async () => {
  const report = measureFreshness(registries([rule("c", "go-2", "2026-09-01")]), targets, "2026-11-07");
  const live = fakeRunner();
  assert.equal((await reportMisses(report, { runner: live.runner })).opened.length, 1);
  assert.equal(live.created.length, 1);
  const dry = fakeRunner();
  await reportMisses(report, { runner: dry.runner, dryRun: true });
  assert.equal(dry.created.length, 0);
  const fresh = measureFreshness(registries([rule("c", "go-2", "2026-11-01")]), targets, "2026-11-07");
  const none = fakeRunner();
  assert.equal((await reportMisses(fresh, { runner: none.runner })).opened.length, 0);
  assert.equal(none.created.length, 0);
});

test("main exits 10 on a miss in the real registry only when a target is missed", async () => {
  const { runner, created } = fakeRunner();
  assert.equal(await main(["--today", "2026-11-07", "--dry-run"], runner), 0);
  assert.equal(created.length, 0);
  assert.equal(await main(["--today", "2030-01-01", "--dry-run"], runner), 10);
  await assert.rejects(main(["--bogus"], runner), /Unknown argument/);
});
