import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import { matchesSpecifier, parseVersion } from "../src/upgrade/pep440.js";
import { poetryLockAnalyzer } from "../src/upgrade/poetry-lock.js";
import type { UpgradeIssue } from "../src/upgrade/types.js";
import { copyFixtureTree } from "./fixture-copies.js";

const temporaryRoots: string[] = [];
let fixtures: string;
const fixture = (name: string) => resolve(fixtures, name);

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/upgrade/poetry-lock"), temporaryRoots);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});
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

/** Writes the files into a temporary repository removed with the rest of the suite. */
async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-poetry-"));
  temporaryRoots.push(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(resolve(root, name), contents, "utf8");
  return root;
}

const summarize = (issues: UpgradeIssue[]): string[] =>
  issues.map((issue) => `${issue.level} ${issue.subject} ${issue.path}:${issue.line ?? "-"} ${issue.evidence.value}`);

test("analyze reports an unreadable lockfile and stops there", async () => {
  const root = await repo({
    "poetry.lock": "package = [[[\n",
    "pyproject.toml": '[tool.poetry.dependencies]\npython = ">=3.8,<3.12"\n',
  });
  assert.deepEqual(await poetryLockAnalyzer.analyze(root, target), [
    {
      analyzer: "poetry-lock",
      level: "unknown",
      subject: "poetry.lock",
      path: "poetry.lock",
      line: 1,
      reason: "poetry.lock is not valid TOML, so python-versions cannot be read.",
      evidence: { kind: "lockfile", value: "poetry.lock: invalid TOML" },
    },
  ]);
});

test("analyze reads only the package fields, not nested tables", async () => {
  const root = await repo({
    "poetry.lock": `lockfileVersion = "1.1"

[[package]]
name = "numpy"
version = "1.24.0"
python-versions = ">=3.8,<3.12"

[package.dependencies]
python-versions = ">=3.12"

[[package]]
name = "no-version"
python-versions = ">=3.8,<3.12"

[[package]]
python-versions = ">=3.8,<3.12"

[[package]]
name = "no-python-versions"
version = "1.0.0"

[[package]]
name = "unparsable"
python-versions = "unsupported"
`,
  });
  assert.deepEqual(summarize(await poetryLockAnalyzer.analyze(root, target)), [
    "blocker numpy@1.24.0 poetry.lock:6 python-versions: >=3.8,<3.12",
    "blocker no-version poetry.lock:13 python-versions: >=3.8,<3.12",
    "unknown unparsable poetry.lock:24 python-versions: unsupported",
  ]);
});

test("analyze weighs the category and groups formats the same way", async () => {
  const root = await repo({
    "poetry.lock": `[[package]]
name = "black"
version = "23.1.0"
python-versions = ">=3.8,<3.12"
category = "dev"

[[package]]
name = "isort"
version = "5.12.0"
python-versions = ">=3.8,<3.12"
category = "main"

[[package]]
name = "mypy"
version = "1.0.0"
python-versions = ">=3.8,<3.12"
groups = ["dev", "typing"]
`,
  });
  const issues = await poetryLockAnalyzer.analyze(root, target);
  assert.deepEqual(summarize(issues), [
    "warning black@23.1.0 poetry.lock:4 python-versions: >=3.8,<3.12",
    "blocker isort@5.12.0 poetry.lock:10 python-versions: >=3.8,<3.12",
    "warning mypy@1.0.0 poetry.lock:16 python-versions: >=3.8,<3.12",
  ]);
  assert.deepEqual(
    issues.map((issue) => issue.reason),
    [
      'black@23.1.0 is in the dev group and its python-versions ">=3.8,<3.12" excludes Python 3.13.',
      'isort@5.12.0 declares python-versions ">=3.8,<3.12", which excludes Python 3.13.',
      'mypy@1.0.0 is in the dev, typing group and its python-versions ">=3.8,<3.12" excludes Python 3.13.',
    ],
  );
});

test("analyze reads the project constraint from the string and table forms", async () => {
  const lock = `[[package]]
name = "six"
version = "1.16.0"
python-versions = "*"
`;
  const expected = {
    analyzer: "poetry-lock",
    level: "blocker",
    subject: "python",
    path: "pyproject.toml",
    line: 2,
    reason: 'The project\'s [tool.poetry.dependencies] python constraint ">=3.8,<3.12" excludes Python 3.13.',
    evidence: { kind: "manifest", value: "python: >=3.8,<3.12" },
  } satisfies UpgradeIssue;

  const stringForm = await repo({
    "poetry.lock": lock,
    "pyproject.toml": '[tool.poetry.dependencies]\npython = ">=3.8,<3.12"\n',
  });
  assert.deepEqual(await poetryLockAnalyzer.analyze(stringForm, target), [expected]);

  const tableForm = await repo({
    "poetry.lock": lock,
    "pyproject.toml":
      '[tool.poetry.dependencies]\npython = {version = ">=3.8,<3.12", markers = "python_version < \'3.12\'"}\n',
  });
  assert.deepEqual(await poetryLockAnalyzer.analyze(tableForm, target), [expected]);
});

test("analyze reports an unreadable manifest, an unparsable constraint, and nothing without one", async () => {
  const lock = `[[package]]\nname = "six"\nversion = "1.16.0"\npython-versions = "*"\n`;

  const unreadable = await repo({ "poetry.lock": lock, "pyproject.toml": "tool = [[[\n" });
  assert.deepEqual(await poetryLockAnalyzer.analyze(unreadable, target), [
    {
      analyzer: "poetry-lock",
      level: "unknown",
      subject: "python",
      path: "pyproject.toml",
      line: 1,
      reason: "pyproject.toml is not valid TOML, so the project's Python constraint cannot be read.",
      evidence: { kind: "manifest", value: "pyproject.toml: invalid TOML" },
    },
  ]);

  const unparsable = await repo({
    "poetry.lock": lock,
    "pyproject.toml": '[tool.poetry.dependencies]\npython = "banana"\n',
  });
  assert.deepEqual(summarize(await poetryLockAnalyzer.analyze(unparsable, target)), [
    "unknown python pyproject.toml:2 python: banana",
  ]);

  const absent = await repo({
    "poetry.lock": lock,
    "pyproject.toml": '[tool.poetry]\nname = "proj"\n\n[tool.poetry.dependencies]\nclick = "*"\n',
  });
  assert.deepEqual(await poetryLockAnalyzer.analyze(absent, target), []);

  const withoutManifest = await repo({ "poetry.lock": lock });
  assert.equal(await poetryLockAnalyzer.applies(withoutManifest), true);
  assert.deepEqual(await poetryLockAnalyzer.analyze(withoutManifest, target), []);
  assert.equal(await poetryLockAnalyzer.applies(await repo({ "pyproject.toml": "[tool.poetry]\n" })), false);
});
