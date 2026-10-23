import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { PhpDetector } from "../src/detectors/php/index.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";

const fixtures = resolve("tests/fixtures/php/laravel");

async function committedRules(): Promise<RegistryV2Rule[]> {
  return (JSON.parse(await readFile("registry/php.json", "utf8")) as { rules: RegistryV2Rule[] }).rules;
}

test("Laravel fixtures cover recently retired and supported majors", async () => {
  const laravelRules = (await committedRules()).filter((rule) => rule.purl === "pkg:composer/laravel/framework");
  const detector = new PhpDetector(async () => laravelRules);
  const cases = [
    { major: 10, expectedRule: "php.package.laravel.framework-10.end-of-support" },
    { major: 11, expectedRule: "php.package.laravel.framework-11.end-of-support" },
    { major: 12, expectedRule: undefined },
    { major: 13, expectedRule: undefined },
  ] as const;

  for (const fixture of cases) {
    const findings = await detector.scan({ root: resolve(fixtures, `v${fixture.major}`) });
    assert.deepEqual(
      findings.map((finding) => finding.ruleId),
      fixture.expectedRule ? [fixture.expectedRule] : [],
      `Laravel ${fixture.major}`,
    );
  }
});

test("Laravel rules cite the support policy and provide ordered upgrade packets", async () => {
  const laravelRules = (await committedRules()).filter((rule) => rule.purl === "pkg:composer/laravel/framework");
  validateRegistryV2({
    schemaVersion: "evergreen.registry.v2",
    ecosystem: "php",
    freshness: { maxReviewAgeDays: 90 },
    rules: laravelRules,
  });
  assert.deepEqual(
    laravelRules.map((rule) => [rule.id, rule.event, rule.deadline, rule.replacement]),
    [
      ["php.package.laravel.framework-10.end-of-support", "end-of-support", "2025-02-04", "Laravel 13"],
      ["php.package.laravel.framework-11.end-of-support", "end-of-support", "2026-03-12", "Laravel 13"],
    ],
  );

  for (const rule of laravelRules) {
    assert.ok(rule.sources.some((source) => source.url === "https://laravel.com/docs/releases#support-policy"));
    assert.ok(rule.sources.some((source) => /laravel\.com\/docs\/\d+\.x\/upgrade/.test(source.url)));
    assert.deepEqual(
      rule.migration?.steps.map((step) => step.id),
      ["raise-laravel-requirement", "apply-laravel-upgrade-guides", "regenerate-composer-lock"],
    );
    assert.deepEqual(
      rule.migration?.verification.map((check) => check.command),
      ["composer validate", "php artisan about", "php artisan test"],
    );
  }
});
