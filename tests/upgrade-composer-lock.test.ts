import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { composerLockAnalyzer, matchesComposerConstraint } from "../src/upgrade/composer-lock.js";
import { checkUpgrade } from "../src/upgrade/index.js";
import type { UpgradeIssue, UpgradeTarget } from "../src/upgrade/types.js";

const target: UpgradeTarget = { runtime: "php", version: "8.4" };
const fixture = (name: string) => resolve("tests/fixtures/upgrade/composer-lock", name);

// Cases from the Composer version constraints documentation: https://getcomposer.org/doc/articles/versions.md
const cases: Array<[string, string, boolean | undefined]> = [
  ["^1.2.3", "1.2.3", true],
  ["^1.2.3", "1.2.4", true],
  ["^1.2.3", "1.2.2", false],
  ["^1.2.3", "2.0.0", false],
  ["^1.2", "1.9.9", true],
  ["^0.3", "0.3.9", true],
  ["^0.3", "0.4.0", false],
  ["^0.0.3", "0.0.4", false],
  ["~1.2", "1.9.0", true],
  ["~1.2", "2.0.0", false],
  ["~1.2.3", "1.2.9", true],
  ["~1.2.3", "1.3.0", false],
  [">=1.0", "1.0.0", true],
  [">=1.0", "0.9.9", false],
  [">1.0", "1.0.0", false],
  ["<2.0", "1.9.9", true],
  ["<2.0", "2.0.0", false],
  ["<=2.0", "2.0.0", true],
  ["!=1.0.0", "1.0.0", false],
  ["!=1.0.0", "1.0.1", true],
  ["1.0.*", "1.0.9", true],
  ["1.0.*", "1.1.0", false],
  ["1.0.x", "1.0.5", true],
  ["*", "8.4.0", true],
  ["1.0 - 2.0", "1.0.0", true],
  ["1.0 - 2.0", "2.0.9", true],
  ["1.0 - 2.0", "2.1.0", false],
  ["1.0.0 - 2.1.0", "2.1.0", true],
  ["^1.0 || ^2.0", "2.5.0", true],
  ["^1.0 || ^2.0", "3.0.0", false],
  ["^1.0 | ^2.0", "1.5.0", true],
  [">=1.0 <2.0", "1.5.0", true],
  [">=1.0, <2.0", "2.0.0", false],
  ["8.4.*", "8.4.17", true],
  ["<8.5", "8.4.99", true],
  [">=8.5", "8.4.99", false],
  ["^8.1", "8.4.0", true],
  ["~8.4.0", "8.5.0", false],
  ["8.4.0RC1", "8.4.0", false],
  ["8.4.0RC1", "8.4.0RC1", true],
  ["not-a-constraint", "8.4.0", undefined],
  ["^8.4 ||", "8.4.0", undefined],
];

test("the Composer constraint matcher agrees with the documented cases", () => {
  for (const [constraint, version, expected] of cases) {
    assert.equal(matchesComposerConstraint(constraint, version), expected, `${constraint} against ${version}`);
  }
});

test("production packages are blockers, dev packages are warnings, and platform pins follow the lockfile", async () => {
  const report = await checkUpgrade(fixture("blocked"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["composer-lock"]);
  const expected: UpgradeIssue[] = [
    {
      analyzer: "composer-lock",
      level: "blocker",
      subject: "acme/http-client@2.1.0",
      path: "composer.lock",
      line: 9,
      reason: "acme/http-client@2.1.0 requires php ^7.4, which excludes PHP 8.4.",
      evidence: { kind: "lockfile", value: "require.php: ^7.4" },
    },
    {
      analyzer: "composer-lock",
      level: "blocker",
      subject: "platform.php",
      path: "composer.lock",
      line: 24,
      reason: "The lockfile records platform.php >=8.5, which excludes PHP 8.4.",
      evidence: { kind: "lockfile", value: "platform.php: >=8.5" },
    },
    {
      analyzer: "composer-lock",
      level: "blocker",
      subject: "platform-overrides.php",
      path: "composer.lock",
      line: 27,
      reason: "The lockfile records platform-overrides.php 8.5.0, which excludes PHP 8.4.",
      evidence: { kind: "lockfile", value: "platform-overrides.php: 8.5.0" },
    },
    {
      analyzer: "composer-lock",
      level: "warning",
      subject: "acme/test-helper@3.0.0",
      path: "composer.lock",
      line: 19,
      reason: "acme/test-helper@3.0.0 requires php >=8.5, which excludes PHP 8.4.",
      evidence: { kind: "lockfile", value: "require.php: >=8.5" },
    },
  ];
  assert.deepEqual(report.issues, expected);
});

test("a repository whose constraints cover the target is ready", async () => {
  const report = await checkUpgrade(fixture("ready"), target);
  assert.equal(report.verdict, "ready");
  assert.deepEqual(report.analyzers, ["composer-lock"]);
  assert.deepEqual(report.issues, []);
});

test("the project's own composer.json require.php excludes the target as a manifest blocker", async () => {
  const report = await checkUpgrade(fixture("manifest"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "composer-lock",
      level: "blocker",
      subject: "composer.json",
      path: "composer.json",
      line: 4,
      reason: "composer.json requires php ~8.3.0, which excludes PHP 8.4.",
      evidence: { kind: "manifest", value: "require.php: ~8.3.0" },
    },
  ]);
});

test("a constraint the matcher cannot read is reported as unknown, never as a blocker", async () => {
  const report = await checkUpgrade(fixture("unknown"), target);
  assert.deepEqual(report.issues, [
    {
      analyzer: "composer-lock",
      level: "unknown",
      subject: "acme/http-client@2.1.0",
      path: "composer.lock",
      line: 6,
      reason: "The constraint ^8.4 || in require.php is not one this analyzer understands, so support for PHP 8.4 is unknown.",
      evidence: { kind: "lockfile", value: "require.php: ^8.4 ||" },
    },
  ]);
});

test("a release line target is tested as both its first and last patch, so narrow lower bounds are not blockers", async () => {
  assert.deepEqual((await checkUpgrade(fixture("target"), target)).issues, []);
  const exact = await checkUpgrade(fixture("target"), { runtime: "php", version: "8.4.0" });
  assert.equal(exact.verdict, "blocked");
  assert.equal(exact.issues.length, 1);
  assert.equal(exact.issues[0]!.subject, "acme/http-client@2.1.0");
});

test("the analyzer applies only when composer.lock exists", async () => {
  assert.equal(await composerLockAnalyzer.applies(fixture("ready")), true);
  assert.equal(await composerLockAnalyzer.applies(resolve("tests/fixtures/upgrade/composer-lock")), false);
});
