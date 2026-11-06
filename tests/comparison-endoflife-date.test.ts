import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { mappedProducts, notComparableReason, productFor } from "../benchmarks/comparison/endoflife/mapping.js";
import { renderJson, renderMarkdown } from "../benchmarks/comparison/endoflife/report.js";
import { buildResult } from "../benchmarks/comparison/endoflife/result.js";
import { scoreRule } from "../benchmarks/comparison/endoflife/score.js";
import { lifecycleDate, loadSnapshot } from "../benchmarks/comparison/endoflife/snapshot.js";
import type {
  ComparisonResult,
  CorpusEntry,
  RegistryRule,
  Snapshot,
} from "../benchmarks/comparison/endoflife/types.js";
import { cycleInRange, parseVersionRange } from "../benchmarks/comparison/endoflife/version-range.js";
import { vendorCheckedDate } from "../benchmarks/comparison/endoflife/vendor.js";

const snapshot: Snapshot = {
  schemaVersion: "evergreen.comparison.endoflife-date.snapshot.v1",
  retrievedAt: "2026-11-06",
  source: {
    homepage: "https://endoflife.date",
    catalog: "https://endoflife.date/api/all.json",
    cycles: "https://endoflife.date/api/{product}.json",
    license: "MIT",
    licenseUrl: "https://github.com/endoflife-date/endoflife.date/blob/master/LICENSE",
    note: "fixture",
  },
  catalog: ["google-kubernetes-engine", "nodejs", "ruby"],
  products: {
    nodejs: [
      { cycle: "18", eol: "2025-04-30" },
      { cycle: "20", eol: "2026-04-30" },
      { cycle: "21", eol: "2024-06-01" },
      { cycle: "22", eol: "2027-04-30" },
    ],
    ruby: [
      { cycle: "3.2", eol: "2026-03-31" },
      { cycle: "3.3", eol: false },
    ],
    "google-kubernetes-engine": [{ cycle: "1.33", support: "2026-06-30", eol: "2027-01-01" }],
    "aws-lambda": [{ cycle: "nodejs20.x", support: "2026-04-30", eol: "2027-08-31" }],
  },
};

const rule = (overrides: Partial<RegistryRule> = {}): RegistryRule => ({
  id: "nodejs.runtime.eol-20",
  ecosystem: "nodejs",
  purl: "pkg:generic/nodejs",
  vers: "vers:semver/>=20.0.0|<21.0.0",
  event: "end-of-life",
  deadline: "2026-04-30",
  ...overrides,
});

test("a single cycle and a group are recognised, and the upper bound is exclusive", () => {
  const single = parseVersionRange("vers:semver/>=20.0.0|<21.0.0");
  assert.equal(cycleInRange("20", single), true);
  assert.equal(cycleInRange("19", single), false);
  assert.equal(cycleInRange("21", single), false);

  const group = parseVersionRange("vers:semver/<22.0.0");
  assert.equal(cycleInRange("0.10", group), true);
  assert.equal(cycleInRange("21", group), true);
  assert.equal(cycleInRange("22", group), false);

  const intdot = parseVersionRange("vers:intdot/>=22.0.0|<22.10.0");
  assert.equal(cycleInRange("22.04", intdot), true);
  assert.equal(cycleInRange("24.04", intdot), false);
});

test("the lifecycle field follows the event, with AWS Lambda using the deprecation date", () => {
  const cycle = { cycle: "20", eol: "2027-01-01", support: "2026-04-30" };
  assert.equal(lifecycleDate(cycle, "nodejs", "end-of-life"), "2027-01-01");
  assert.equal(lifecycleDate(cycle, "nodejs", "end-of-support"), "2026-04-30");
  assert.equal(lifecycleDate(cycle, "aws-lambda", "end-of-life"), "2026-04-30");
});

test("a rule that matches the published date agrees; a different date disagrees", () => {
  assert.equal(scoreRule(rule(), snapshot).outcome, "agree");
  const different = scoreRule(rule({ deadline: "2026-04-29" }), snapshot);
  assert.equal(different.outcome, "disagree");
  assert.equal(different.endoflifeDate, "2026-04-30");
});

test("a grouped rule is compared with the latest date in its range", () => {
  const score = scoreRule(rule({ id: "container.node.eol-21-and-older", vers: "vers:semver/<22.0.0" }), snapshot);
  assert.equal(score.outcome, "agree");
  assert.deepEqual(score.cycles, ["18", "20", "21"]);
  assert.equal(score.endoflifeDate, "2026-04-30");
});

test("a rule with no date, or a cycle with no published date, is bucketed instead of guessed", () => {
  const noDate: RegistryRule = {
    id: "nodejs.runtime.eol-20",
    ecosystem: "nodejs",
    purl: "pkg:generic/nodejs",
    vers: "vers:semver/>=20.0.0|<21.0.0",
    event: "end-of-life",
  };
  assert.equal(scoreRule(noDate, snapshot).outcome, "no-rule-date");
  const missing = scoreRule(
    rule({ id: "ruby.runtime.eol-3.3", purl: "pkg:generic/ruby", vers: "vers:gem/>=3.3.0|<3.4.0" }),
    snapshot,
  );
  assert.equal(missing.outcome, "no-endoflife-date");
  assert.deepEqual(missing.missingCycles, ["3.3"]);
});

test("an unmapped package and a non-lifecycle event are not scored", () => {
  const packageRule = scoreRule(
    rule({ id: "npm.package.left-pad.deprecated", purl: "pkg:npm/left-pad", vers: "vers:npm/*" }),
    snapshot,
  );
  assert.equal(packageRule.outcome, "not-comparable");
  assert.equal(packageRule.reason, "package-level");
  const deprecated = scoreRule(rule({ event: "deprecated" }), snapshot);
  assert.equal(deprecated.outcome, "not-lifecycle-event");
});

test("an AWS Lambda rule matches the fixed cycle carried by its purl", () => {
  const lambda = scoreRule(
    rule({
      id: "serverless.aws-lambda.nodejs20.x",
      purl: "pkg:generic/aws-lambda-runtime/nodejs20.x",
      vers: "vers:semver/*",
      ecosystem: "serverless",
    }),
    snapshot,
  );
  assert.equal(lambda.outcome, "agree");
  assert.deepEqual(lambda.cycles, ["nodejs20.x"]);
});

test("the vendor-checked date is read only when the note names exactly one lifecycle date", () => {
  const note =
    "Vendor-checked by a reviewer on 2026-11-03 against https://example.com: the release is end-of-life on 2026-04-30. Outcome: confirmed.";
  assert.equal(vendorCheckedDate(note), "2026-04-30");
  assert.equal(vendorCheckedDate("Two dates: 2026-04-30 and 2026-05-01."), undefined);
  assert.equal(vendorCheckedDate("Reviewed at this commit, no vendor check."), undefined);
});

test("the tally counts every rule once and the buckets add up", () => {
  const entries: CorpusEntry[] = [
    {
      repository: "owner/repository",
      commit: "0123456789abcdef",
      expected: [
        {
          ruleId: "nodejs.runtime.eol-20",
          path: "package.json",
          line: 1,
          groundTruthSource: {
            kind: "maintainer-review",
            note: "Vendor-checked by a reviewer on 2026-11-03 against https://example.com: end-of-life on 2026-04-30.",
          },
        },
        { ruleId: "ruby.runtime.eol-3.2", path: "Gemfile.lock", line: 2 },
      ],
    },
  ];
  const rules = [
    rule(),
    rule({
      id: "ruby.runtime.eol-3.2",
      ecosystem: "ruby",
      purl: "pkg:generic/ruby",
      vers: "vers:gem/>=3.2.0|<3.3.0",
      deadline: "2026-04-01",
    }),
    rule({ id: "npm.package.left-pad.deprecated", ecosystem: "npm", purl: "pkg:npm/left-pad", vers: "vers:npm/*" }),
  ];
  const result = buildResult({ rules, snapshot, entries });
  const tally = result.agreement.all;
  assert.equal(tally.rules, 3);
  assert.equal(
    tally.measured +
      tally.notComparable +
      tally.notLifecycleEvent +
      tally.noSnapshot +
      tally.noCycle +
      tally.noRuleDate +
      tally.noEndoflifeDate,
    tally.rules,
  );
  assert.deepEqual([tally.agree, tally.disagree], [1, 1]);
  assert.equal(result.agreement.groundTruth.measured, 2);
  assert.equal(result.correctness.sample, 1);
  assert.equal(result.correctness.evergreenMatches, 1);
  assert.equal(result.correctness.endoflifeMatches, 1);
  assert.deepEqual(result.coverage.sharedProducts, ["nodejs", "ruby"]);
  const disagreement = result.disagreements[0];
  assert.equal(disagreement?.ruleId, "ruby.runtime.eol-3.2");
  assert.equal(disagreement?.inGroundTruth, true);
  assert.equal(
    disagreement?.references[0]?.url.startsWith("https://github.com/owner/repository/blob/0123456789abcdef/"),
    true,
  );
});

test("a ground-truth rule missing from the registry fails loudly", () => {
  const entries: CorpusEntry[] = [
    {
      repository: "owner/repository",
      commit: "0123456789abcdef",
      expected: [{ ruleId: "missing.rule", path: "package.json" }],
    },
  ];
  assert.throws(
    () => buildResult({ rules: [], snapshot, entries }),
    /ground-truth rule "missing\.rule" is not in the registry/,
  );
});

test("the same result renders the same JSON and Markdown", () => {
  const rules = [
    rule(),
    rule({
      id: "ruby.runtime.eol-3.2",
      purl: "pkg:generic/ruby",
      vers: "vers:gem/>=3.2.0|<3.3.0",
      deadline: "2026-04-01",
    }),
  ];
  const first = buildResult({ rules, snapshot, entries: [] });
  const second = buildResult({ rules: [...rules].reverse(), snapshot, entries: [] });
  assert.equal(renderJson(first), renderJson(second));
  assert.equal(renderMarkdown(first), renderMarkdown(second));
  assert.equal(renderJson(first).endsWith("\n"), true);
});

test("mapping covers a product for every mapped purl and gives every other purl a reason", () => {
  for (const product of mappedProducts()) assert.equal(typeof product, "string");
  assert.deepEqual(productFor("pkg:generic/nodejs"), { product: "nodejs" });
  assert.deepEqual(productFor("pkg:generic/aws-lambda-runtime/nodejs20.x"), {
    product: "aws-lambda",
    cycle: "nodejs20.x",
  });
  assert.equal(notComparableReason("pkg:npm/left-pad")?.code, "package-level");
  assert.equal(notComparableReason("pkg:generic/aws-aurora/mysql")?.code, "different-cycle-model");
  assert.equal(notComparableReason("pkg:generic/google-kubernetes-engine")?.code, "different-support-model");
  assert.equal(notComparableReason("pkg:unknown/example")?.code, "no-product");
});

test("the committed snapshot has cycles for every mapped product", async () => {
  const loaded = await loadSnapshot(resolve("benchmarks/comparison/endoflife-date.snapshot.json"));
  for (const product of mappedProducts()) assert.ok(loaded.products[product]?.length, product);
  assert.ok(loaded.products["aws-lambda"]?.length);
  assert.equal(loaded.catalog.includes("nodejs"), true);
  assert.equal(loaded.catalog.length > (loaded.products["nodejs"]?.length ?? 0), true);
});

test("the committed result counts add up and its disagreements carry both sources", async () => {
  const result = JSON.parse(
    await readFile(resolve("benchmarks/comparison/endoflife-date.json"), "utf8"),
  ) as ComparisonResult;
  const tally = result.agreement.all;
  assert.equal(tally.rules, result.evergreen.registryRules);
  assert.equal(
    tally.measured +
      tally.notComparable +
      tally.notLifecycleEvent +
      tally.noSnapshot +
      tally.noCycle +
      tally.noRuleDate +
      tally.noEndoflifeDate,
    tally.rules,
  );
  assert.equal(tally.measured, tally.agree + tally.disagree);
  assert.equal(result.agreement.groundTruth.rules, result.evergreen.groundTruthRules);
  for (const disagreement of result.disagreements) {
    assert.match(disagreement.evergreenDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(disagreement.endoflifeDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(disagreement.sources.endoflife, /^https:\/\/endoflife\.date\//);
    assert.match(disagreement.sources.evergreen, /^https:\/\/github\.com\/arminazimi\/evergreen\//);
  }
});
