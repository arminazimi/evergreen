import assert from "node:assert/strict";
import { test } from "node:test";

import type { RegistryV2Rule } from "../../src/registry.js";
import type {
  CandidateIssueRunner,
  IssueRecord,
  RenderedCandidateIssue,
} from "../../tools/importers/candidate-issues.js";
import {
  extractDisagreementKey,
  findDisagreements,
  main,
  renderDisagreementIssue,
  renderDisagreementText,
  reportDisagreements,
  selectDisagreementsToOpen,
} from "../../tools/importers/disagreements.js";
import type { DraftRegistry } from "../../tools/importers/types.js";

function rule(id: string, extra: Record<string, unknown> = {}): RegistryV2Rule {
  return {
    id,
    ecosystem: "go",
    purl: "pkg:generic/go",
    vers: "vers:semver/<1.22.0",
    event: "end-of-life",
    title: id,
    summary: id,
    severity: "high",
    deadline: "2025-02-11",
    sources: [{ title: `${id} source`, url: `https://example.com/${id}` }],
    provenance: { observedAt: "2026-10-01", reviewer: "pending-review" },
    ...extra,
  } as RegistryV2Rule;
}

const draft = (importer: string, rules: RegistryV2Rule[]): DraftRegistry => ({
  importer,
  ecosystem: "go",
  observedAt: "2026-10-15",
  rules,
  notes: [],
});

const agree = [draft("go-1", [rule("a")]), draft("go-2", [rule("b")])];
const seeded = [draft("go-1", [rule("a")]), draft("go-2", [rule("b", { deadline: "2025-08-13" })])];

test("sources that agree produce no disagreement", () => {
  assert.deepEqual(findDisagreements(agree), []);
  assert.equal(renderDisagreementText([]), "No source disagreements.\n");
});

test("a seeded deadline disagreement is detected with both claims", () => {
  const found = findDisagreements(seeded);
  assert.equal(found.length, 1);
  assert.deepEqual(found[0]!.fields, ["deadline"]);
  assert.deepEqual(
    found[0]!.claims.map((claim) => [claim.importer, claim.deadline]),
    [
      ["go-1", "2025-02-11"],
      ["go-2", "2025-08-13"],
    ],
  );
  assert.match(renderDisagreementText(found), /deadline[\s\S]*go-1: end-of-life 2025-02-11[\s\S]*1 disagreement/);
});

test("event differences and missing deadlines are disagreements; one importer alone is not", () => {
  const found = findDisagreements([
    draft("a", [rule("a1", { event: "deprecated" })]),
    draft("b", [rule("b1", { deadline: undefined })]),
  ]);
  assert.deepEqual(found[0]!.fields, ["event", "deadline"]);
  assert.match(renderDisagreementText(found), /no deadline/);
  assert.deepEqual(findDisagreements([draft("a", [rule("x"), rule("y", { deadline: "2030-01-01" })])]), []);
  assert.deepEqual(
    findDisagreements([draft("a", [rule("x")]), draft("b", [rule("y", { vers: "vers:semver/<1.0.0" })])]),
    [],
  );
});

test("the issue names both claims and carries a dedupe marker", () => {
  const issue = renderDisagreementIssue(findDisagreements(seeded)[0]!);
  assert.match(issue.title, /sources disagree about pkg:generic\/go/);
  assert.equal(extractDisagreementKey(issue.body), issue.ruleId);
  assert.match(issue.body, /2025-02-11/);
  assert.match(issue.body, /2025-08-13/);
  assert.match(issue.body, /\[b source\]\(https:\/\/example.com\/b\)/);
  assert.equal(extractDisagreementKey("no marker"), null);
  assert.equal(extractDisagreementKey(undefined), null);
});

test("selection skips tracked components and respects the cap", () => {
  const found = findDisagreements(seeded);
  const marker = renderDisagreementIssue(found[0]!).body;
  const tracked: IssueRecord[] = [{ title: "t", body: marker, state: "CLOSED" }];
  const skipped = selectDisagreementsToOpen(found, tracked);
  assert.deepEqual(skipped.toOpen, []);
  assert.equal(skipped.skippedTracked.length, 1);
  assert.equal(skipped.openCount, 0);

  const capped = selectDisagreementsToOpen(found, [{ title: "t", body: marker.replace(found[0]!.key, "other") }], 1);
  assert.equal(capped.toOpen.length, 0);
  assert.equal(capped.capped, true);
  assert.equal(capped.openCount, 1);
});

function fakeRunner(existing: IssueRecord[] = []): CandidateIssueRunner & { created: RenderedCandidateIssue[] } {
  const created: RenderedCandidateIssue[] = [];
  return {
    created,
    listExistingIssues: async () => existing,
    createIssue: async (issue) => {
      created.push(issue);
      return {};
    },
  };
}

test("reportDisagreements opens one issue, then never again", async () => {
  const runner = fakeRunner();
  const first = await reportDisagreements(seeded, { runner });
  assert.equal(first.opened.length, 1);
  assert.equal(runner.created.length, 1);

  const again = fakeRunner([{ title: runner.created[0]!.title, body: runner.created[0]!.body, state: "OPEN" }]);
  const second = await reportDisagreements(seeded, { runner: again });
  assert.equal(second.opened.length, 0);
  assert.equal(again.created.length, 0);

  const dry = fakeRunner();
  const preview = await reportDisagreements(seeded, { runner: dry, dryRun: true });
  assert.equal(preview.opened.length, 1);
  assert.equal(dry.created.length, 0);

  const none = await reportDisagreements(agree, { runner: fakeRunner() });
  assert.equal(none.opened.length, 0);
});

test("a failed issue listing aborts a real run but not a dry run", async () => {
  const broken: CandidateIssueRunner = {
    listExistingIssues: async () => {
      throw new Error("gh missing");
    },
    createIssue: async () => ({}),
  };
  await assert.rejects(reportDisagreements(seeded, { runner: broken }), /gh missing/);
  const result = await reportDisagreements(seeded, { runner: broken, dryRun: true });
  assert.equal(result.opened.length, 1);
});

test("main validates its arguments", async () => {
  await assert.rejects(main(["only-one.json"]), /Usage/);
  await assert.rejects(main(["a.json", "b.json", "--bogus"]), /Unknown option/);
  await assert.rejects(main(["a.json", "b.json", "--max-open"]), /non-negative/);
  await assert.rejects(main(["a.json", "b.json", "--repo"]), /owner\/repo/);
});
