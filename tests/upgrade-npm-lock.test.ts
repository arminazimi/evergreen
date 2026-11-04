import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import { npmLockAnalyzer, readPackages } from "../src/upgrade/npm-lock.js";
import type { UpgradeIssue } from "../src/upgrade/types.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

const temporaryRoots: string[] = [];
let fixtures: string;
const target = { runtime: "nodejs", version: "22" } as const;

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/upgrade/npm-lock"), temporaryRoots);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Summary {
  level: UpgradeIssue["level"];
  subject: string;
  path: string;
  line: number | undefined;
  evidence: string;
}

const summarize = (issues: UpgradeIssue[]): Summary[] =>
  issues.map((issue) => ({
    level: issue.level,
    subject: issue.subject,
    path: issue.path,
    line: issue.line,
    evidence: issue.evidence.value,
  }));

async function run(...args: string[]) {
  return runCli(args);
}

test("npm 3: ready packages are silent, production blockers and dev warnings are exact, invalid ranges are unknown", async () => {
  const root = resolve(fixtures, "v3");
  assert.equal(await npmLockAnalyzer.applies(root), true);
  assert.deepEqual(summarize(await npmLockAnalyzer.analyze(root, target)), [
    {
      level: "blocker",
      subject: "blocked-prod@2.0.0",
      path: "package-lock.json",
      line: 22,
      evidence: "engines.node: >=24",
    },
    {
      level: "blocker",
      subject: "nested-dup@3.0.0",
      path: "package-lock.json",
      line: 28,
      evidence: "engines.node: >=26",
    },
    {
      level: "warning",
      subject: "dev-only@1.0.0",
      path: "package-lock.json",
      line: 41,
      evidence: "engines.node: >=24",
    },
    {
      level: "warning",
      subject: "optional-dev@1.0.0",
      path: "package-lock.json",
      line: 48,
      evidence: "engines.node: >=24",
    },
    {
      level: "unknown",
      subject: "invalid-range@1.0.0",
      path: "package-lock.json",
      line: 54,
      evidence: "engines.node: >=not-a-version",
    },
  ]);
});

test("npm 3: identical name, version, and range across nested paths keep the first line", async () => {
  const issues = await npmLockAnalyzer.analyze(resolve(fixtures, "v3"), target);
  const duplicates = issues.filter((issue) => issue.subject === "nested-dup@3.0.0");
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0]!.line, 28);
});

test("npm 2 lockfiles are read the same way", async () => {
  const root = resolve(fixtures, "v2");
  assert.equal(await npmLockAnalyzer.applies(root), true);
  assert.deepEqual(summarize(await npmLockAnalyzer.analyze(root, target)), [
    {
      level: "blocker",
      subject: "legacy@1.0.0",
      path: "package-lock.json",
      line: 9,
      evidence: "engines.node: >=16 <18",
    },
  ]);
});

test("npm-shrinkwrap.json is read and reported under its own path", async () => {
  const root = resolve(fixtures, "shrinkwrap");
  assert.equal(await npmLockAnalyzer.applies(root), true);
  assert.deepEqual(summarize(await npmLockAnalyzer.analyze(root, target)), [
    { level: "blocker", subject: "pinned@4.0.0", path: "npm-shrinkwrap.json", line: 9, evidence: "engines.node: >=26" },
  ]);
});

test("lockfile version 1 reports one unknown that names the missing engines evidence", async () => {
  const root = resolve(fixtures, "v1");
  assert.equal(await npmLockAnalyzer.applies(root), true);
  assert.deepEqual(summarize(await npmLockAnalyzer.analyze(root, target)), [
    {
      level: "unknown",
      subject: "package-lock.json",
      path: "package-lock.json",
      line: 4,
      evidence: "lockfileVersion: 1",
    },
  ]);
  const issue = (await npmLockAnalyzer.analyze(root, target))[0]!;
  assert.equal(
    issue.reason,
    "package-lock.json uses lockfileVersion 1, which does not record package engines, so support for Node.js 22 is unknown.",
  );
});

test("the reasons name the package, the range as written, and the target", async () => {
  const issues = await npmLockAnalyzer.analyze(resolve(fixtures, "v3"), target);
  assert.equal(
    issues.find((issue) => issue.subject === "blocked-prod@2.0.0")?.reason,
    'blocked-prod@2.0.0 declares engines.node ">=24", which excludes Node.js 22.',
  );
  assert.equal(
    issues.find((issue) => issue.subject === "invalid-range@1.0.0")?.reason,
    'invalid-range@1.0.0 declares engines.node ">=not-a-version", which is not a valid semver range.',
  );
});

test("the same lockfile yields the same issues", async () => {
  const root = resolve(fixtures, "v3");
  assert.deepEqual(await npmLockAnalyzer.analyze(root, target), await npmLockAnalyzer.analyze(root, target));
});

test("the analyzer only judges nodejs", async () => {
  const report = await checkUpgrade(resolve(fixtures, "v3"), { runtime: "python", version: "3.13" });
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
});

test("checkUpgrade reports a blocked verdict with the analyzer id and stable order", async () => {
  const report = await checkUpgrade(resolve(fixtures, "v3"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["npm-lock"]);
  assert.deepEqual(
    report.issues.map((issue) => `${issue.level}:${issue.subject}`),
    [
      "blocker:blocked-prod@2.0.0",
      "blocker:nested-dup@3.0.0",
      "warning:dev-only@1.0.0",
      "warning:optional-dev@1.0.0",
      "unknown:invalid-range@1.0.0",
    ],
  );
});

test("the CLI exits 1 for a blocker and prints the evidence at its line", async () => {
  const root = resolve(fixtures, "v3");
  const text = await run("upgrade-check", "--to", "nodejs@22", root);
  assert.equal(text.code, 1);
  assert.match(text.stdout, /^nodejs@22: blocked \(2 blockers/m);
  assert.ok(
    text.stdout.includes(
      'package-lock.json:22  blocked-prod@2.0.0  blocked-prod@2.0.0 declares engines.node ">=24", which excludes Node.js 22.  [lockfile: engines.node: >=24]',
    ),
  );

  const json = await run("upgrade-check", "--to", "nodejs@22", root, "--json");
  assert.equal(json.code, 1);
  assert.equal((JSON.parse(json.stdout) as { verdict: string }).verdict, "blocked");
});

test("the CLI exits 0 when every eligible package accepts the target", async () => {
  const result = await run("upgrade-check", "--to", "nodejs@26", resolve(fixtures, "v3"));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^nodejs@26: ready/m);
  assert.ok(result.stdout.includes("invalid-range@1.0.0"));
});

test("a two-part target is checked as its .0 release and an unreadable target reports nothing", async () => {
  const root = resolve(fixtures, "v3");
  const twoPart = await npmLockAnalyzer.analyze(root, { runtime: "nodejs", version: "26.1" });
  assert.deepEqual(
    twoPart.map((issue) => issue.subject),
    ["invalid-range@1.0.0"],
  );
  assert.deepEqual(await npmLockAnalyzer.analyze(root, { runtime: "nodejs", version: "nightly" }), []);
});

test("readPackages reads only node_modules entries with engines.node and keeps package order", () => {
  const entries = readPackages(
    '{\n  "lockfileVersion": 3,\n  "packages": {\n    "": { "engines": { "node": ">=18" } },\n    "node_modules/a": { "version": "1.0.0", "engines": { "node": ">=20 <22" } },\n    "node_modules/b": { "version": "2.0.0" },\n    "node_modules/c": { "version": "3.0.0", "engines": { "npm": ">=9" } }\n  }\n}\n',
  );
  assert.deepEqual(entries, [{ name: "a", version: "1.0.0", range: ">=20 <22", line: 5, dev: false }]);
});
