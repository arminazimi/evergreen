import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import { pnpmLockAnalyzer, readPackages } from "../src/upgrade/pnpm-lock.js";
import type { UpgradeIssue } from "../src/upgrade/types.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

const temporaryRoots: string[] = [];
let fixtures: string;
const target = { runtime: "nodejs", version: "22" } as const;

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/upgrade/pnpm-lock"), temporaryRoots);
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

test("pnpm 6: ready packages are silent, production blockers and dev warnings are exact, invalid ranges are unknown", async () => {
  const root = resolve(fixtures, "v6");
  assert.equal(await pnpmLockAnalyzer.applies(root), true);
  assert.deepEqual(summarize(await pnpmLockAnalyzer.analyze(root, target)), [
    {
      level: "blocker",
      subject: "blocked-prod@2.0.0",
      path: "pnpm-lock.yaml",
      line: 26,
      evidence: "engines.node: >=24",
    },
    { level: "warning", subject: "dev-only@1.0.0", path: "pnpm-lock.yaml", line: 32, evidence: "engines.node: >=24" },
    {
      level: "unknown",
      subject: "invalid-range@1.0.0",
      path: "pnpm-lock.yaml",
      line: 37,
      evidence: "engines.node: >=not-a-version",
    },
  ]);
});

test("pnpm 6: identical name, version, and range across peer variants keep the first line", async () => {
  const issues = await pnpmLockAnalyzer.analyze(resolve(fixtures, "v6"), target);
  const blocked = issues.filter((issue) => issue.subject === "blocked-prod@2.0.0");
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]!.line, 26);
});

test("pnpm 9: engines come from packages, and the dev flag is resolved through importers and snapshots", async () => {
  const root = resolve(fixtures, "v9");
  assert.equal(await pnpmLockAnalyzer.applies(root), true);
  assert.deepEqual(summarize(await pnpmLockAnalyzer.analyze(root, target)), [
    {
      level: "blocker",
      subject: "blocked-prod@2.0.0",
      path: "pnpm-lock.yaml",
      line: 33,
      evidence: "engines.node: >=24",
    },
    { level: "warning", subject: "dev-only@1.0.0", path: "pnpm-lock.yaml", line: 38, evidence: "engines.node: >=24" },
    {
      level: "unknown",
      subject: "invalid-range@1.0.0",
      path: "pnpm-lock.yaml",
      line: 42,
      evidence: "engines.node: >=not-a-version",
    },
    { level: "blocker", subject: "prod-child@1.5.0", path: "pnpm-lock.yaml", line: 46, evidence: "engines.node: >=24" },
    { level: "warning", subject: "dev-child@1.5.0", path: "pnpm-lock.yaml", line: 50, evidence: "engines.node: >=24" },
  ]);
});

test("the reasons name the package, the range as written, and the target", async () => {
  const issues = await pnpmLockAnalyzer.analyze(resolve(fixtures, "v6"), target);
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
  const root = resolve(fixtures, "v9");
  assert.deepEqual(await pnpmLockAnalyzer.analyze(root, target), await pnpmLockAnalyzer.analyze(root, target));
});

test("lockfile 5 does not apply, so the answer stays unknown instead of guessing", async () => {
  const root = resolve(fixtures, "v5");
  assert.equal(await pnpmLockAnalyzer.applies(root), false);
  assert.deepEqual(await pnpmLockAnalyzer.analyze(root, target), []);
  const report = await checkUpgrade(root, target);
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
});

test("the analyzer only judges nodejs", async () => {
  const root = resolve(fixtures, "v6");
  const report = await checkUpgrade(root, { runtime: "python", version: "3.13" });
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
});

test("checkUpgrade reports a blocked verdict with the analyzer id and stable order", async () => {
  const report = await checkUpgrade(resolve(fixtures, "v6"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["pnpm-lock"]);
  assert.deepEqual(
    report.issues.map((issue) => `${issue.level}:${issue.subject}`),
    ["blocker:blocked-prod@2.0.0", "warning:dev-only@1.0.0", "unknown:invalid-range@1.0.0"],
  );
});

test("the CLI exits 1 for a blocker and prints the evidence at its line", async () => {
  const root = resolve(fixtures, "v6");
  const text = await run("upgrade-check", "--to", "nodejs@22", root);
  assert.equal(text.code, 1);
  assert.match(text.stdout, /^nodejs@22: blocked \(1 blockers/m);
  assert.ok(
    text.stdout.includes(
      'pnpm-lock.yaml:26  blocked-prod@2.0.0  blocked-prod@2.0.0 declares engines.node ">=24", which excludes Node.js 22.  [lockfile: engines.node: >=24]',
    ),
  );

  const json = await run("upgrade-check", "--to", "nodejs@22", root, "--json");
  assert.equal(json.code, 1);
  assert.equal((JSON.parse(json.stdout) as { verdict: string }).verdict, "blocked");
});

test("the CLI exits 0 when every eligible package accepts the target", async () => {
  const result = await run("upgrade-check", "--to", "nodejs@24", resolve(fixtures, "v6"));
  assert.equal(result.code, 0);
  assert.match(result.stdout, /^nodejs@24: ready/m);
  assert.ok(result.stdout.includes("invalid-range@1.0.0"));
});

test("readPackages keeps package order and ignores a document that does not parse", () => {
  const entries = readPackages(
    "lockfileVersion: '6.0'\npackages:\n  /a@1.0.0:\n    engines: {node: '>=20'}\n---\nlockfileVersion: [\n",
  );
  assert.deepEqual(
    entries.map((entry) => [entry.subject, entry.range, entry.line]),
    [["a@1.0.0", ">=20", 4]],
  );
});

test("readPackages reads the dev flag from the package entry in pnpm 6", () => {
  const entries = readPackages(`lockfileVersion: '6.0'
packages:
  /prod@1.0.0:
    engines: {node: '>=20'}
  /dev-flag@1.0.0:
    engines: {node: '>=20'}
    dev: true
  /dev-optional@1.0.0:
    engines: {node: '>=20'}
    devOptional: true
  /no-engines@1.0.0:
    resolution: {tarball: https://example.invalid/a.tgz}
  /not-a-version:
    engines: {node: '>=20'}
`);
  assert.deepEqual(
    entries.map((entry) => [entry.subject, entry.dev]),
    [
      ["prod@1.0.0", false],
      ["dev-flag@1.0.0", true],
      ["dev-optional@1.0.0", true],
    ],
  );
});

test("readPackages resolves the dev flag from importers and snapshots in pnpm 9", () => {
  const entries = readPackages(`lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      prod-pkg:
        version: 1.0.0
      peer-pkg:
        version: 1.0.0(dep@1.0.0)
    devDependencies:
      dev-root:
        version: 2.0.0
packages:
  /prod-pkg@1.0.0:
    engines: {node: '>=20'}
  /peer-pkg@1.0.0(dep@1.0.0):
    engines: {node: '>=20'}
  /dev-root@2.0.0:
    engines: {node: '>=20'}
  /dev-dep@3.0.0:
    engines: {node: '>=20'}
  /orphan@4.0.0:
    engines: {node: '>=20'}
snapshots:
  /prod-pkg@1.0.0: {}
  /peer-pkg@1.0.0(dep@1.0.0): {}
  /dev-root@2.0.0:
    dependencies:
      dev-dep: 3.0.0
  /dev-dep@3.0.0: {}
  /orphan@4.0.0: {}
`);
  assert.deepEqual(
    entries.map((entry) => [entry.subject, entry.dev]),
    [
      ["prod-pkg@1.0.0", false],
      ["peer-pkg@1.0.0", false],
      ["dev-root@2.0.0", true],
      ["dev-dep@3.0.0", true],
      ["orphan@4.0.0", false],
    ],
  );
});

test("readPackages ignores unsupported versions and documents without a packages map", () => {
  const entries = readPackages(`lockfileVersion: '7.0'
packages:
  /a@1.0.0:
    engines: {node: '>=20'}
---
lockfileVersion: '9.0'
importers: {}
snapshots: {}
---
lockfileVersion: '6.0'
snapshots: {}
`);
  assert.deepEqual(entries, []);
});
