import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import { matchesSpecifier, parseVersion } from "../src/upgrade/pep440.js";

const fixture = (name: string) => resolve("tests/fixtures/upgrade/poetry-lock", name);
const target = { runtime: "python", version: "3.13" } as const;

/** PEP 440 and Poetry specifier cases, including the examples from PEP 440's own specification. */
const specifierCases: ReadonlyArray<readonly [string, string, boolean]> = [
  [">=1.0", "1.0", true],
  [">=1.0", "0.9", false],
  [">=1.0", "1.0.1", true],
  [">1.0", "1.0", false],
  [">1.0", "1.0.1", true],
  ["<2.0", "1.9.9", true],
  ["<2.0", "2.0", false],
  ["<=2.0", "2.0", true],
  ["<=2.0", "2.0.1", false],
  ["==1.0", "1.0.0", true],
  ["==1.0.0", "1.0", true],
  ["==1.0", "1.0.1", false],
  ["==1.0.*", "1.0.5", true],
  ["==1.0.*", "1.0", true],
  ["==1.0.*", "1.1.0", false],
  ["!=1.0", "1.0.0", false],
  ["!=1.0", "1.0.1", true],
  ["!=1.5.*", "1.5.1", false],
  ["!=1.0.*", "1.0", false],
  ["~=1.4.5", "1.4.6", true],
  ["~=1.4.5", "1.4.4", false],
  ["~=1.4.5", "1.5.0", false],
  ["~=2.2", "2.9", true],
  ["~=2.2", "3.0", false],
  ["~=3.13", "3.13.1", true],
  ["~=3.13", "3.14", true],
  ["~=3.13", "4.0", false],
  [">=1.0,<2.0", "1.5", true],
  [">=1.0,<2.0", "2.0", false],
  [">=1.0, !=1.5.*", "1.5.1", false],
  [">=1.0 <2.0", "1.5", true],
  [">=1.0 <2.0", "2.0", false],
  [">= 1.0", "1.0", true],
  ["^1.2.3", "1.9.9", true],
  ["^1.2.3", "2.0.0", false],
  ["^0.2.3", "0.2.9", true],
  ["^0.2.3", "0.3.0", false],
  ["^0.0.3", "0.0.3", true],
  ["^0.0.3", "0.0.4", false],
  ["~1.2.3", "1.2.9", true],
  ["~1.2.3", "1.3.0", false],
  ["~1.2", "1.2.9", true],
  ["~1.2", "1.3.0", false],
  ["~1", "1.9", true],
  ["~1", "2.0", false],
  ["1.0", "1.0", true],
  ["1.0", "1.0.1", false],
  ["*", "3.13", true],
  [">=3.8 || <3.7", "3.6", true],
  [">=3.8 || <3.7", "3.7.5", false],
  ["<3.6 || >=3.8", "3.7", false],
  [">=1.0rc1", "1.0", true],
  [">=1.0", "1.0rc1", false],
  [">=1.0b1", "1.0a1", false],
  [">1.0a1", "1.0b1", true],
  [">=1.0.post1", "1.0", false],
  ["==1.0.post1", "1.0.post1", true],
  [">=1.0.dev0", "1.0a1", true],
  [">=1.0", "1.0.dev1", false],
  ["==1.0+local", "1.0+local", true],
  ["==1.0", "1.0+local", true],
  [">=1!1.0", "1!1.5", true],
  [">=1.0", "1!2.0", true],
  [">=1!1.0", "0!2.0", false],
];

test("the matcher accepts and rejects the PEP 440 and Poetry pairs", () => {
  for (const [specifier, version, expected] of specifierCases) {
    assert.equal(matchesSpecifier(specifier, version), expected, `${specifier} against ${version}`);
  }
  assert.ok(specifierCases.length >= 30, "the table covers at least 30 pairs");
});

test("the matcher returns undefined only when a specifier or version cannot be parsed", () => {
  for (const specifier of ["banana", "", ">=1.0 ||", "~=1", "1.0.*.*", ">="]) {
    assert.equal(matchesSpecifier(specifier, "1.0"), undefined, specifier);
  }
  assert.equal(matchesSpecifier(">=1.0", "not-a-version"), undefined);
  assert.equal(parseVersion("banana"), undefined);
  assert.deepEqual(parseVersion("1!2.3rc1.post2.dev3+local")?.release, [2, 3]);
});

test("a ready lockfile reports the analyzer and no issues", async () => {
  const report = await checkUpgrade(fixture("ready"), target);
  assert.deepEqual(report, {
    schemaVersion: "evergreen.upgrade.v1",
    target,
    verdict: "ready",
    analyzers: ["poetry-lock"],
    issues: [],
  });
});

test("a main-group package that excludes the target is a blocker with exact evidence and line", async () => {
  const report = await checkUpgrade(fixture("blocked"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "poetry-lock",
      level: "blocker",
      subject: "numpy@1.24.0",
      path: "poetry.lock",
      line: 6,
      reason: 'numpy@1.24.0 declares python-versions ">=3.8,<3.12", which excludes Python 3.13.',
      evidence: { kind: "lockfile", value: "python-versions: >=3.8,<3.12" },
    },
  ]);
});

test("dev and other groups are warnings, in both the groups and category lockfile formats", async () => {
  const report = await checkUpgrade(fixture("dev-warning"), target);
  assert.equal(report.verdict, "ready", "a warning alone does not block");
  assert.deepEqual(
    report.issues.map((issue) => [issue.level, issue.subject, issue.line]),
    [
      ["warning", "black@23.1.0", 6],
      ["warning", "isort@5.12.0", 15],
    ],
  );
  assert.match(report.issues[0]!.reason, /in the dev group/);
});

test("an unparsable python-versions value is unknown, never a match", async () => {
  const report = await checkUpgrade(fixture("unparsable"), target);
  assert.deepEqual(report.issues, [
    {
      analyzer: "poetry-lock",
      level: "unknown",
      subject: "legacy@1.0.0",
      path: "poetry.lock",
      line: 6,
      reason: 'Cannot parse the python-versions constraint "unsupported" for legacy@1.0.0.',
      evidence: { kind: "lockfile", value: "python-versions: unsupported" },
    },
  ]);
});

test("a project-level Poetry python constraint that excludes the target is a blocker", async () => {
  const report = await checkUpgrade(fixture("project-exclusion"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "poetry-lock",
      level: "blocker",
      subject: "python",
      path: "pyproject.toml",
      line: 7,
      reason: 'The project\'s [tool.poetry.dependencies] python constraint ">=3.8,<3.12" excludes Python 3.13.',
      evidence: { kind: "manifest", value: "python: >=3.8,<3.12" },
    },
  ]);
});
