import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { NpmDetector } from "../src/detectors/npm.js";
import { versContains } from "../src/vers.js";

const ANGULAR_PURL = "pkg:npm/%40angular/core";
const RULE_V20 = "npm.package.angular.core.v20.scheduled-end-of-life";
const RULE_V19 = "npm.package.angular.core.v19.end-of-support";
const RULE_PRE_V19 = "npm.package.angular.core.v18-and-older.end-of-support";
const fixtures = resolve("tests/fixtures/angular");

type Rule = {
  id: string;
  purl: string;
  vers: string;
  event: string;
  severity: string;
  deadline?: string;
  sources: Array<{ url: string }>;
  migration?: { steps: Array<{ id: string }>; verification: Array<{ command: string }> };
};

async function angularRules(): Promise<Rule[]> {
  const registry = JSON.parse(await readFile(resolve("registry/npm.json"), "utf8")) as { rules: Rule[] };
  return registry.rules.filter((rule) => rule.purl === ANGULAR_PURL);
}

test("reports v20 as scheduled end of life with its announced deadline", async () => {
  const findings = await new NpmDetector().scan({ root: resolve(fixtures, "positive/v20") });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, RULE_V20);
  assert.equal(findings[0]?.severity, "low");
  assert.equal(findings[0]?.deadline, "2026-11-28");
  assert.match(findings[0]?.summary ?? "", /resolved: 20\.3\.0/);
  assert.equal(findings[0]?.sources?.[0]?.url, "https://angular.dev/reference/releases");
  assert.equal(findings[0]?.usages?.length, 0);
});

test("reports v19 as no longer supported", async () => {
  const findings = await new NpmDetector().scan({ root: resolve(fixtures, "positive/v19") });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, RULE_V19);
  assert.equal(findings[0]?.severity, "high");
  assert.equal(findings[0]?.deadline, undefined);
  assert.match(findings[0]?.summary ?? "", /resolved: 19\.2\.0/);
});

test("reports v18 and older as no longer supported", async () => {
  const findings = await new NpmDetector().scan({ root: resolve(fixtures, "positive/v18") });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.ruleId, RULE_PRE_V19);
  assert.equal(findings[0]?.severity, "high");
  assert.match(findings[0]?.summary ?? "", /resolved: 18\.2\.0/);
});

test("reports nothing for supported majors and projects without Angular", async () => {
  const detector = new NpmDetector();

  assert.deepEqual(await detector.scan({ root: resolve(fixtures, "negative/v21") }), []);
  assert.deepEqual(await detector.scan({ root: resolve(fixtures, "negative/v22") }), []);
  assert.deepEqual(await detector.scan({ root: resolve(fixtures, "zero/no-angular") }), []);
});

test("version ranges put each release on exactly one lifecycle rule", async () => {
  const rules = await angularRules();
  const matching = (version: string): string[] =>
    rules.filter((rule) => versContains(rule.vers, version)).map((rule) => rule.id).sort();

  assert.deepEqual(matching("18.2.0"), [RULE_PRE_V19]);
  assert.deepEqual(matching("19.0.0-next.3"), [RULE_V19]);
  assert.deepEqual(matching("19.2.0"), [RULE_V19]);
  assert.deepEqual(matching("20.0.0-next.0"), [RULE_V20]);
  assert.deepEqual(matching("20.0.0-rc.1"), [RULE_V20]);
  assert.deepEqual(matching("20.3.0"), [RULE_V20]);
  assert.deepEqual(matching("21.0.0"), []);
  assert.deepEqual(matching("21.0.0-next.0"), []);
  assert.deepEqual(matching("22.0.0"), []);
});

test("every Angular rule cites the release schedule and has a verifiable migration", async () => {
  const rules = await angularRules();

  assert.equal(rules.length, 3);
  for (const rule of rules) {
    assert.ok(rule.sources.some((source) => source.url === "https://angular.dev/reference/releases"), rule.id);
    assert.ok(rule.sources.some((source) => source.url === "https://angular.dev/update-guide"), rule.id);
    assert.ok((rule.migration?.steps.length ?? 0) > 0, rule.id);
    assert.ok((rule.migration?.verification.length ?? 0) > 0, rule.id);
  }
  const scheduled = rules.find((rule) => rule.event === "scheduled-end-of-life");
  assert.equal(scheduled?.id, RULE_V20);
  assert.equal(scheduled?.deadline, "2026-11-28");
  assert.equal(scheduled?.severity, "low");
});
