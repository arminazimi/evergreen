import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { isIsoDate } from "../src/registry.js";
import { countMigrations, evaluate, hasUsableLicense, review, statesIntent } from "../benchmarks/mining/review.js";
import type { ActionHint, Candidate, Checks, Evidence, ReviewLog, TokenHint } from "../benchmarks/mining/review.js";

const readJson = async <T>(path: string) => JSON.parse(await readFile(resolve(path), "utf8")) as T;
const hints: Record<string, ActionHint> = {
  "github-actions.checkout.node20": { action: "actions/checkout", supportedFromMajor: 5 },
  "github-actions.setup-node.node20": { action: "actions/setup-node", supportedFromMajor: 5 },
};

type Case = { candidate: Candidate; evidence: Evidence };
const cases = () => readJson<Record<string, Case>>("tests/fixtures/mining-evidence.json");
const named = async (prefix: string) => Object.entries(await cases()).find(([id]) => id.startsWith(prefix))![1];

test("the review log matches its JSON Schema", async () => {
  const schema = await readJson<object>("schemas/migration-review-log.v1.schema.json");
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  assert.ok(validate(await readJson("benchmarks/mining/review-log.json")), JSON.stringify(validate.errors));
});

test("the review log has exactly one entry for every mined candidate, in order, and agrees with it", async () => {
  const log = await readJson<ReviewLog>("benchmarks/mining/review-log.json");
  const files = await readJson<string[]>("benchmarks/mining/candidates/index.json");
  const candidates = await Promise.all(files.map((file) => readJson<Candidate>(`benchmarks/mining/candidates/${file}`)));
  assert.deepEqual(log.entries.map((entry) => entry.candidate), candidates.map((candidate) => candidate.id).sort());
  for (const entry of log.entries) {
    const candidate = candidates.find((item) => item.id === entry.candidate)!;
    assert.deepEqual([entry.repository, entry.parentCommit, entry.migrationCommit, entry.ruleId], [candidate.repository, candidate.parentCommit, candidate.migrationCommit, candidate.ruleId], entry.candidate);
  }
});

test("every decision follows from its checks, and rejections say why", async () => {
  const log = await readJson<ReviewLog>("benchmarks/mining/review-log.json");
  assert.ok(log.entries.length >= 30);
  for (const entry of log.entries) {
    assert.ok(isIsoDate(entry.reviewedAt), entry.candidate);
    assert.ok(entry.reviewer.trim(), entry.candidate);
    const failed = Object.entries(entry.checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (entry.decision === "accepted") {
      assert.deepEqual(failed, [], `${entry.candidate} is accepted with failed checks`);
      assert.ok(hasUsableLicense(entry.license), entry.candidate);
    } else {
      assert.ok(failed.length > 0, `${entry.candidate} is rejected without a failed check`);
      assert.equal(entry.reasons.length, failed.length, entry.candidate);
    }
  }
  assert.ok(log.entries.some((entry) => entry.decision === "accepted") && log.entries.some((entry) => entry.decision === "rejected"));
});

test("replaying the recorded evidence gives the decisions in the log", async () => {
  const log = await readJson<ReviewLog>("benchmarks/mining/review-log.json");
  for (const [id, { candidate, evidence }] of Object.entries(await cases())) {
    const entry = log.entries.find((item) => item.candidate === id)!;
    const again = review(candidate, evidence, hints[candidate.ruleId]!, entry.reviewer, entry.reviewedAt);
    assert.deepEqual(again, entry, id);
  }
});

test("accepts a bump that moves the action to a supported major, including a pin with a version comment", async () => {
  const checkout = await named("concept7");
  assert.deepEqual(Object.values(evaluate(checkout.candidate, checkout.evidence, hints["github-actions.checkout.node20"]!).checks), Array(7).fill(true));
  assert.equal(evaluate(checkout.candidate, checkout.evidence, hints["github-actions.checkout.node20"]!).moves, 4);

  const pinned = await named("akenon");
  assert.match(pinned.evidence.files[0]!.patch, /\+\s+- uses: actions\/setup-node@[0-9a-f]{40}\s+# v\d/);
  assert.equal(evaluate(pinned.candidate, pinned.evidence, hints["github-actions.setup-node.node20"]!).checks.directMigration, true);
});

test("unrelated changes in the same commit do not hide the migration", async () => {
  const mixed = await named("flant");
  const { checks, moves } = evaluate(mixed.candidate, mixed.evidence, hints["github-actions.checkout.node20"]!);
  assert.equal(moves, 7);
  assert.equal(checks.directMigration, true);
  assert.ok(mixed.evidence.files.some((file) => /go-version/.test(file.patch)), "the fixture really contains unrelated edits");
});

test("rejects a repository without a usable license and says so", async () => {
  const unlicensed = await named("shymega");
  const entry = review(unlicensed.candidate, unlicensed.evidence, hints["github-actions.checkout.node20"]!, "reviewer", "2026-10-16");
  assert.equal(entry.decision, "rejected");
  assert.deepEqual(entry.reasons, ["The repository has no usable license (none)."]);
  assert.equal(entry.checks.directMigration, true, "only the license failed");
});

test("each criterion can reject a candidate on its own", async () => {
  const { candidate, evidence } = await named("concept7");
  const hint = hints["github-actions.checkout.node20"]!;
  const failing = (change: (value: { candidate: Candidate; evidence: Evidence }) => void): (keyof Checks)[] => {
    const copy = structuredClone({ candidate, evidence });
    change(copy);
    const { checks } = evaluate(copy.candidate, copy.evidence, hint);
    return (Object.keys(checks) as (keyof Checks)[]).filter((name) => !checks[name]);
  };
  // With no reported locations there is also nothing for the diff to have migrated.
  assert.deepEqual(failing((c) => { c.candidate.before = []; }), ["parentReportsRule", "directMigration"]);
  assert.deepEqual(failing((c) => { c.candidate.after = [...c.candidate.before]; }), ["migrationClearsRule"]);
  assert.deepEqual(failing((c) => { c.evidence.parents = ["a".repeat(40), "b".repeat(40)]; }), ["singleParent"]);
  assert.deepEqual(failing((c) => { c.evidence.files = c.evidence.files.map((file) => ({ ...file, patch: "" })); }), ["directMigration"]);
  assert.deepEqual(failing((c) => { c.evidence.message = "wip"; }), ["intentStated"]);
  assert.deepEqual(failing((c) => { c.evidence.license = "NOASSERTION"; }), ["licensed"]);
  for (const flag of ["private", "fork", "archived"] as const) assert.deepEqual(failing((c) => { c.evidence.repo[flag] = true; }), ["publicAndActive"], flag);
});

test("a change to a supported major, or in a file the scan did not report, is not a migration", () => {
  const hint = hints["github-actions.checkout.node20"]!;
  const patch = (from: string, to: string) => `@@ -1 +1 @@\n-      - uses: actions/checkout@${from}\n+      - uses: actions/checkout@${to}\n`;
  const reported = new Set([".github/workflows/ci.yml"]);
  const file = (path: string, text: string) => [{ filename: path, patch: text }];
  assert.equal(countMigrations(file(".github/workflows/ci.yml", patch("v4", "v5")), reported, hint), 1);
  assert.equal(countMigrations(file(".github/workflows/ci.yml", patch("v5", "v6")), reported, hint), 0, "already supported");
  assert.equal(countMigrations(file(".github/workflows/ci.yml", patch("v3", "v4")), reported, hint), 0, "still unsupported");
  assert.equal(countMigrations(file(".github/workflows/other.yml", patch("v4", "v5")), reported, hint), 0, "not a reported file");
  assert.equal(countMigrations(file(".github/workflows/ci.yml", patch("v4", "v5").replace(/checkout/g, "cache")), reported, hint), 0, "another action");
  assert.equal(countMigrations(file(".github/workflows/ci.yml", `-      - uses: actions/checkout@v4\n+      - uses: actions/checkout@${"a".repeat(40)} # v5.0.1\n`), reported, hint), 1, "pin with a comment");
});

test("recognizes a stated intent and a usable license", () => {
  const hint = hints["github-actions.checkout.node20"]!;
  for (const message of ["Bump actions/checkout from 4 to 5", "chore(ci): upgrade checkout to clear the Node 20 warning", "ci: update actions to v5"]) assert.equal(statesIntent(message, hint), true, message);
  for (const message of ["wip", "fix typo", "", null, "Add feature"]) assert.equal(statesIntent(message, hint), false, String(message));
  assert.deepEqual(["MIT", "Apache-2.0", "NOASSERTION", "NONE", null].map(hasUsableLicense), [true, true, false, false, false]);
});

test("package and runtime migrations are recognized from removed lines and the commit message", () => {
  const sass: TokenHint = { tokens: ["node-sass"], runtime: false };
  const reported = new Set(["package.json"]);
  const manifest = (patch: string) => [{ filename: "package.json", patch }];
  assert.equal(countMigrations(manifest('@@ -5 +5 @@\n-    "node-sass": "^4.14.1",\n+    "sass": "^1.32.0",\n'), reported, sass), 1);
  assert.equal(countMigrations(manifest('@@ -5 +5 @@\n-    "node-sass-importer": "^1.0.0",\n+    "x": "1",\n'), reported, sass), 0, "a different package");
  assert.equal(countMigrations(manifest('@@ -5 +5 @@\n+    "node-sass": "^4.14.1",\n'), reported, sass), 0, "an addition is not a migration");
  assert.equal(countMigrations([{ filename: "other/package.json", patch: '-    "node-sass": "1"\n' }], reported, sass), 0, "not a reported file");

  const node: TokenHint = { tokens: ["node"], runtime: true };
  assert.equal(countMigrations([{ filename: ".nvmrc", patch: "@@ -1 +1 @@\n-18\n+22\n" }], new Set([".nvmrc"]), node), 1, "a version-pin file names no runtime");
  assert.equal(countMigrations(manifest('@@ -1 +1 @@\n-    "node": ">=18"\n+    "node": ">=22"\n'), reported, node), 1);

  assert.equal(statesIntent("Replace node-sass with sass", sass), true);
  assert.equal(statesIntent("Update dependencies", sass), false, "does not name the package");
  assert.equal(statesIntent("node-sass", sass), false, "no verb");
  assert.equal(statesIntent("Drop Node 18 support", node), true);
  assert.equal(statesIntent("Require python 3.10", { tokens: ["python"], runtime: true }), true);
  assert.equal(statesIntent("fix typo", node), false);
});
