import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { JSON_PATH, MARKDOWN_PATH, build, evidenceFor, summarize } from "../benchmarks/differential/report.js";
import type { Comparison, DifferentialReport } from "../benchmarks/differential/renovate.js";

const comparison = (overrides: Partial<Comparison>): Comparison => ({
  family: "deprecated-package",
  path: "package.json",
  name: "left-pad",
  evergreen: [],
  renovate: "deprecated",
  outcome: "renovate-only",
  note: "n",
  ...overrides,
});

const sample = (repository: string, comparisons: Comparison[]): DifferentialReport => ({
  schemaVersion: "evergreen.differential.renovate.v1",
  repository,
  summary: { agree: 0, "evergreen-only": 0, "renovate-only": 0, inconclusive: 0 },
  comparisons,
  notComparable: [],
});

test("agreements are counted but only disagreements are listed, each with evidence", () => {
  const commit = "a".repeat(40);
  const summary = summarize(
    [
      sample("b/two", [comparison({ outcome: "agree", evergreen: ["npm.package.left-pad.deprecated"] })]),
      sample("a/one", [
        comparison({}),
        comparison({ family: "github-action", name: "actions/checkout", renovate: "skipped", outcome: "inconclusive" }),
      ]),
    ],
    new Map([["a/one", commit]]),
  );
  assert.deepEqual(summary.repositories.map((item) => item.repository), ["a/one", "b/two"]);
  assert.deepEqual(summary.totals, { agree: 1, "evergreen-only": 0, "renovate-only": 1, inconclusive: 1 });
  assert.equal(summary.disagreements.length, 2);
  for (const item of summary.disagreements) assert.ok(item.evidence.length > 0);
  assert.equal(summary.disagreements[0]!.evidence[0]!.url, `https://github.com/a/one/blob/${commit}/package.json`);
  assert.match(summary.disagreements[0]!.evidence[1]!.url, /npmjs\.com\/package\/left-pad/);
});

test("evidence names the Evergreen rule page and omits the pinned file when the commit is unknown", () => {
  const links = evidenceFor("x/y", null, comparison({ outcome: "evergreen-only", evergreen: ["container.node.eol-21-and-older"], renovate: "none" }));
  assert.deepEqual(links.map((link) => link.label), ["Evergreen rule container.node.eol-21-and-older"]);
});

test("the committed differential report matches the committed Renovate reports", async () => {
  const { markdown, json } = await build();
  assert.equal(await readFile(resolve(MARKDOWN_PATH), "utf8"), markdown);
  assert.equal(await readFile(resolve(JSON_PATH), "utf8"), json);
});
