import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import { matchesDartConstraint, parseTargetVersion } from "../src/upgrade/dart-sdk.js";
import { runCli } from "./cli-runner.js";

const fixture = (name: string) => resolve("tests/fixtures/upgrade/dart-sdk", name);

test("matches caret constraints with pub's rule for 0.x releases", () => {
  assert.equal(matchesDartConstraint("3.5.0", "^3.5.0"), true);
  assert.equal(matchesDartConstraint("3.9.9", "^3.5.0"), true);
  assert.equal(matchesDartConstraint("4.0.0", "^3.5.0"), false);
  assert.equal(matchesDartConstraint("3.4.9", "^3.5.0"), false);
  assert.equal(matchesDartConstraint("0.3.2", "^0.3.2"), true);
  assert.equal(matchesDartConstraint("0.3.9", "^0.3.2"), true);
  assert.equal(matchesDartConstraint("0.4.0", "^0.3.2"), false);
  assert.equal(matchesDartConstraint("0.0.3", "^0.0.3"), true);
  assert.equal(matchesDartConstraint("0.0.4", "^0.0.3"), false);
});

test("matches operators, space-joined ranges, any, and exact versions", () => {
  assert.equal(matchesDartConstraint("3.5.0", ">=3.0.0 <4.0.0"), true);
  assert.equal(matchesDartConstraint("4.0.0", ">=3.0.0 <4.0.0"), false);
  assert.equal(matchesDartConstraint("2.19.6", ">=3.0.0"), false);
  assert.equal(matchesDartConstraint("3.5.0", "<=3.5.0"), true);
  assert.equal(matchesDartConstraint("3.5.1", ">3.5.0"), true);
  assert.equal(matchesDartConstraint("3.5.0", "any"), true);
  assert.equal(matchesDartConstraint("3.5.0", "3.5.0"), true);
  assert.equal(matchesDartConstraint("3.5.0", "3.5.1"), false);
  assert.equal(matchesDartConstraint("3.5.0", ">=3.0.0 || <4.0.0"), false);
  assert.equal(matchesDartConstraint("not-a-version", "any"), false);
});

test("orders pre-releases as semver does", () => {
  assert.equal(matchesDartConstraint("3.6.0-beta.1", ">=3.0.0 <4.0.0"), true);
  assert.equal(matchesDartConstraint("3.6.0-alpha", "<3.6.0-beta"), true);
  assert.equal(matchesDartConstraint("3.6.0-beta", "<3.6.0-alpha"), false);
  assert.equal(matchesDartConstraint("3.6.0-1", "<3.6.0-alpha"), true);
  assert.equal(matchesDartConstraint("3.6.0-alpha", "<3.6.0-alpha.1"), true);
  assert.equal(matchesDartConstraint("3.6.0-beta.1", "<3.6.0-beta.1"), false);
  assert.equal(matchesDartConstraint("3.6.0", "<3.6.0-beta"), false);
});

test("expands a partial target to its release", () => {
  assert.deepEqual(parseTargetVersion("3"), { text: "3.0.0", version: { major: 3, minor: 0, patch: 0, prerelease: [] } });
  assert.equal(parseTargetVersion("3.5")?.text, "3.5.0");
  assert.equal(parseTargetVersion("3.5.2")?.text, "3.5.2");
  assert.equal(parseTargetVersion("3.5.0-beta.1")?.text, "3.5.0-beta.1");
  assert.equal(parseTargetVersion("latest"), undefined);
});

test("is ready when both the lockfile and the manifest admit the target", async () => {
  const report = await checkUpgrade(fixture("ready"), { runtime: "dart", version: "3.5" });
  assert.equal(report.verdict, "ready");
  assert.deepEqual(report.analyzers, ["dart-sdk"]);
  assert.deepEqual(report.issues, []);
});

test("blocks a target outside the resolved package set's bound", async () => {
  const report = await checkUpgrade(fixture("lock-blocked"), { runtime: "dart", version: "3.5" });
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "dart-sdk",
      level: "blocker",
      subject: "resolved package set",
      path: "pubspec.lock",
      line: 11,
      reason: "The resolved package set requires Dart >=3.6.0 <4.0.0, which excludes 3.5.0.",
      evidence: { kind: "lockfile", value: ">=3.6.0 <4.0.0" },
    },
  ]);
});

test("blocks a target outside the manifest's bound", async () => {
  const report = await checkUpgrade(fixture("manifest-blocked"), { runtime: "dart", version: "3.5" });
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "dart-sdk",
      level: "blocker",
      subject: "environment.sdk",
      path: "pubspec.yaml",
      line: 3,
      reason: "pubspec.yaml requires Dart >=3.6.0 <4.0.0, which excludes 3.5.0.",
      evidence: { kind: "manifest", value: ">=3.6.0 <4.0.0" },
    },
  ]);
});

test("checks a Flutter target against the Flutter bounds", async () => {
  const report = await checkUpgrade(fixture("flutter"), { runtime: "flutter", version: "3.16" });
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "dart-sdk",
      level: "blocker",
      subject: "resolved package set",
      path: "pubspec.lock",
      line: 12,
      reason: "The resolved package set requires Flutter >=3.19.0, which excludes 3.16.0.",
      evidence: { kind: "lockfile", value: ">=3.19.0" },
    },
  ]);
});

test("reports unknown when neither file records the bound", async () => {
  const report = await checkUpgrade(fixture("unknown"), { runtime: "dart", version: "3.5" });
  assert.deepEqual(report.analyzers, ["dart-sdk"]);
  assert.deepEqual(report.issues, [
    {
      analyzer: "dart-sdk",
      level: "unknown",
      subject: "Dart SDK",
      path: "pubspec.lock",
      reason: "Neither pubspec.lock nor pubspec.yaml records a Dart SDK bound, so 3.5.0 cannot be checked.",
      evidence: { kind: "lockfile", value: "sdks" },
    },
  ]);
});

test("does not apply without pubspec.lock", async () => {
  const report = await checkUpgrade(resolve("tests/fixtures/upgrade/dart-sdk"), { runtime: "dart", version: "3.5" });
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
  assert.deepEqual(report.issues, []);
});

test("reports unknown instead of throwing when pubspec.lock cannot be read as a file", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  try {
    await mkdir(join(root, "pubspec.lock"));
    const report = await checkUpgrade(root, { runtime: "dart", version: "3.5" });
    assert.deepEqual(report.issues.map((entry) => entry.level), ["unknown"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the CLI exits 0 when the target is ready and 1 when it is blocked", async () => {
  const upgrade = (...args: string[]) => runCli(["upgrade-check", ...args]);

  const ready = await upgrade("--to", "dart@3.5", fixture("ready"));
  assert.equal(ready.code, 0, ready.stderr);
  assert.match(ready.stdout, /^dart@3\.5: ready/);

  const blocked = await upgrade("--to", "dart@3.5", fixture("lock-blocked"), "--json");
  assert.equal(blocked.code, 1);
  const report = JSON.parse(blocked.stdout) as { verdict: string; issues: Array<{ evidence: { value: string } }> };
  assert.equal(report.verdict, "blocked");
  assert.equal(report.issues[0]!.evidence.value, ">=3.6.0 <4.0.0");
});
