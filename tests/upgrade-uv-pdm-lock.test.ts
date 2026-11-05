import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import type { ParsedVersion } from "../src/upgrade/pep440.js";
import { evaluateEntry, evaluateMarker, uvPdmLockAnalyzer } from "../src/upgrade/uv-pdm-lock.js";
import type { UpgradeIssue } from "../src/upgrade/types.js";
import { copyFixtureTree } from "./fixture-copies.js";

const parsed = (release: number[]): ParsedVersion => ({ epoch: 0, release });
const targetPython313 = { full: parsed([3, 13, 0]), minor: parsed([3, 13]) };
const blockLines = (fields: Record<string, number> = {}, wheelUrls: number[] = []) => ({
  fields: new Map(Object.entries(fields)),
  wheelUrls,
});
const wheel = (tag: string, abi: string) => ({ url: `https://files.example/pkg-1.0-${tag}-${abi}-linux.whl` });

const temporaryRoots: string[] = [];
let fixtures: string;
const fixture = (name: string) => resolve(fixtures, name);

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/upgrade/uv-pdm-lock"), temporaryRoots);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});
const target = { runtime: "python", version: "3.13" } as const;

test("a uv.lock whose packages state no Python bound reports nothing", async () => {
  const report = await checkUpgrade(fixture("ready"), target);
  assert.deepEqual(report, {
    schemaVersion: "evergreen.upgrade.v1",
    target,
    verdict: "ready",
    analyzers: ["uv-pdm-lock"],
    issues: [],
  });
});

test("the project's requires-python range that excludes the target is a blocker", async () => {
  const report = await checkUpgrade(fixture("uv-project-blocks"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "blocker",
      subject: "python",
      path: "uv.lock",
      line: 2,
      reason: 'The project\'s requires-python ">=3.8,<3.13" excludes Python 3.13.',
      evidence: { kind: "lockfile", value: "requires-python: >=3.8,<3.13" },
    },
  ]);
});

test("resolution-markers that exclude the target block, a fork that covers it does not, and unparsable markers are unknown", async () => {
  const report = await checkUpgrade(fixture("uv-marker-blocks"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "blocker",
      subject: "numpy@1.26.4",
      path: "uv.lock",
      line: 7,
      reason:
        "numpy@1.26.4 resolves only for Python versions matching \"python_full_version < '3.9'\", which excludes Python 3.13.",
      evidence: { kind: "lockfile", value: "resolution-markers: python_full_version < '3.9'" },
    },
    {
      analyzer: "uv-pdm-lock",
      level: "unknown",
      subject: "weird@0.9.0",
      path: "uv.lock",
      line: 29,
      reason: "Cannot read the Python bounds of weird@0.9.0 in uv.lock: resolution-markers: python_version ~= '3.9'.",
      evidence: { kind: "lockfile", value: "resolution-markers: python_version ~= '3.9'" },
    },
  ]);
});

test("version-specific wheels without an sdist block at the first excluding wheel's line", async () => {
  const report = await checkUpgrade(fixture("uv-wheel-blocks"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "blocker",
      subject: "pybind@2.11.1",
      path: "uv.lock",
      line: 8,
      reason: "pybind@2.11.1 has no wheel for Python 3.13 and no sdist to fall back on (cp36-cp36m, cp39-cp39).",
      evidence: { kind: "lockfile", value: "wheels: cp36-cp36m, cp39-cp39" },
    },
  ]);
});

test("a main-group PDM package that excludes the target is a blocker with exact evidence and line", async () => {
  const report = await checkUpgrade(fixture("pdm-blocked"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "blocker",
      subject: "numpy@1.24.0",
      path: "pdm.lock",
      line: 4,
      reason: 'numpy@1.24.0 declares requires_python ">=3.8,<3.12", which excludes Python 3.13.',
      evidence: { kind: "lockfile", value: "requires_python: >=3.8,<3.12" },
    },
  ]);
});

test("a dev-group PDM package is a warning, which does not block", async () => {
  const report = await checkUpgrade(fixture("pdm-dev-warning"), target);
  assert.equal(report.verdict, "ready", "a warning alone does not block");
  assert.deepEqual(
    report.issues.map((issue) => [issue.level, issue.subject, issue.line]),
    [["warning", "black@23.1.0", 4]],
  );
  assert.match(report.issues[0]!.reason, /in the dev group/);
});

test("an unparsable requires_python value is unknown, never a match", async () => {
  const report = await checkUpgrade(fixture("pdm-unparsable"), target);
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "unknown",
      subject: "legacy@1.0.0",
      path: "pdm.lock",
      line: 4,
      reason: 'Cannot parse the requires_python constraint "banana" for legacy@1.0.0.',
      evidence: { kind: "lockfile", value: "requires_python: banana" },
    },
  ]);
});

test("the project's [metadata] requires_python that excludes the target is a blocker", async () => {
  const report = await checkUpgrade(fixture("pdm-metadata-blocks"), target);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "blocker",
      subject: "python",
      path: "pdm.lock",
      line: 10,
      reason: 'The project\'s [metadata] requires_python ">=3.8,<3.13" excludes Python 3.13.',
      evidence: { kind: "lockfile", value: "requires_python: >=3.8,<3.13" },
    },
  ]);
});

test("an invalid lockfile is unknown, never a match", async () => {
  const report = await checkUpgrade(fixture("invalid-toml"), target);
  assert.deepEqual(report.issues, [
    {
      analyzer: "uv-pdm-lock",
      level: "unknown",
      subject: "uv.lock",
      path: "uv.lock",
      line: 1,
      reason: "uv.lock is not valid TOML, so requires-python cannot be read.",
      evidence: { kind: "lockfile", value: "uv.lock: invalid TOML" },
    },
  ]);
});

test("evaluateMarker classifies Python clauses", () => {
  assert.equal(evaluateMarker("python_full_version < '3.9'", targetPython313), "excludes");
  assert.equal(evaluateMarker("python_version >= '3.8'", targetPython313), "allows");
  assert.equal(evaluateMarker("python_version >= '3.8' and sys_platform == 'linux'", targetPython313), "allows");
  assert.equal(evaluateMarker("sys_platform == 'linux'", targetPython313), "allows");
  assert.equal(evaluateMarker("python_version ~= '3.9'", targetPython313), "unknown");
  assert.equal(evaluateMarker("python_version >= '3.8' or sys_platform == 'linux'", targetPython313), "unknown");
  assert.equal(evaluateMarker("python_version >= '3.8'", undefined), "unknown");
});

test("evaluateEntry reads resolution-markers before wheels", () => {
  assert.deepEqual(
    evaluateEntry(
      { "resolution-markers": ["python_version >= '3.8'"], wheels: [wheel("cp39", "cp39m")] },
      blockLines({ "resolution-markers": 5, wheels: 6 }),
      targetPython313,
    ),
    { verdict: "allows", value: "resolution-markers", line: 5 },
  );
  assert.deepEqual(
    evaluateEntry(
      {
        "resolution-markers": ["python_version < '3.9'", "python_version >= '3.14'"],
        wheels: [wheel("cp39", "abi3")],
      },
      blockLines({ "resolution-markers": 7, wheels: 8 }),
      targetPython313,
    ),
    { verdict: "excludes", value: "resolution-markers: python_version < '3.9'", line: 7 },
  );
});

test("evaluateEntry reports markers it cannot read as unknown", () => {
  assert.deepEqual(
    evaluateEntry(
      { "resolution-markers": "python_version < '3.9'" },
      blockLines({ "resolution-markers": 3 }),
      targetPython313,
    ),
    { verdict: "unknown", value: "resolution-markers", line: 3 },
  );
  assert.deepEqual(
    evaluateEntry(
      { "resolution-markers": ["python_version ~= '3.9'"] },
      blockLines({ "resolution-markers": 4 }),
      targetPython313,
    ),
    { verdict: "unknown", value: "resolution-markers: python_version ~= '3.9'", line: 4 },
  );
});

test("evaluateEntry falls back to wheels only when there is no sdist", () => {
  assert.deepEqual(
    evaluateEntry(
      { sdist: {}, wheels: [wheel("cp39", "cp39m")] },
      blockLines({ wheels: 2, __block: 1 }),
      targetPython313,
    ),
    { verdict: "none", value: "resolution-markers", line: 1 },
  );
  assert.deepEqual(
    evaluateEntry({ wheels: [wheel("cp39", "abi3")] }, blockLines({ wheels: 2, __block: 1 }), targetPython313),
    { verdict: "allows", value: "wheels", line: 2 },
  );
});

test("evaluateEntry reports wheel bounds and the first excluding wheel's line", () => {
  assert.deepEqual(
    evaluateEntry({ wheels: [wheel("cp39", "cp39m")] }, blockLines({ wheels: 2, __block: 1 }, [7]), targetPython313),
    { verdict: "excludes", value: "wheels: cp39-cp39m", line: 7 },
  );
  assert.deepEqual(evaluateEntry({ wheels: [{}] }, blockLines({ wheels: 3, __block: 1 }), targetPython313), {
    verdict: "unknown",
    value: "wheels",
    line: 3,
  });
  assert.deepEqual(
    evaluateEntry({ wheels: [wheel("cp3x", "cp3x")] }, blockLines({ wheels: 4, __block: 1 }), targetPython313),
    { verdict: "unknown", value: "wheels: cp3x", line: 4 },
  );
  assert.deepEqual(
    evaluateEntry({ wheels: [wheel("py3", "none")] }, blockLines({ wheels: 5, __block: 1 }), targetPython313),
    { verdict: "allows", value: "wheels", line: 5 },
  );
  assert.deepEqual(evaluateEntry({}, blockLines({ __block: 9 }), targetPython313), {
    verdict: "none",
    value: "resolution-markers",
    line: 9,
  });
});

/** Writes the files into a temporary repository removed with the rest of the suite. */
async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-uv-pdm-"));
  temporaryRoots.push(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(resolve(root, name), contents, "utf8");
  return root;
}

const summarize = (issues: UpgradeIssue[]): string[] =>
  issues.map((issue) => `${issue.level} ${issue.subject} ${issue.path}:${issue.line ?? "-"} ${issue.evidence.value}`);

test("the analyzer applies to a uv or PDM lockfile and to nothing else", async () => {
  assert.equal(await uvPdmLockAnalyzer.applies(await repo({ "uv.lock": "version = 1\n" })), true);
  assert.equal(await uvPdmLockAnalyzer.applies(await repo({ "pdm.lock": "lock_version = 4\n" })), true);
  assert.equal(await uvPdmLockAnalyzer.applies(await repo({ "requirements.txt": "" })), false);
});

test("uv judges every entry of one package name together", async () => {
  const covering = await repo({
    "uv.lock": `requires-python = ">=3.8"

[[package]]
name = "dup"
version = "1.0.0"
resolution-markers = ["python_full_version < '3.10'"]

[[package]]
name = "dup"
version = "2.0.0"
resolution-markers = ["python_full_version >= '3.13'"]
`,
  });
  assert.deepEqual(await uvPdmLockAnalyzer.analyze(covering, target), []);

  const excluded = await repo({
    "uv.lock": `[[package]]
name = "dup"
version = "1.0.0"
resolution-markers = ["python_full_version < '3.10'"]

[[package]]
name = "dup"
version = "2.0.0"
resolution-markers = ["python_full_version < '3.11'"]
`,
  });
  const issues = await uvPdmLockAnalyzer.analyze(excluded, target);
  assert.deepEqual(summarize(issues), ["blocker dup uv.lock:4 resolution-markers: python_full_version < '3.10'"]);
  assert.equal(
    issues[0]?.reason,
    "dup resolves only for Python versions matching \"python_full_version < '3.10'\", which excludes Python 3.13.",
  );

  const unreadable = await repo({
    "uv.lock": `[[package]]
name = "mystery"
version = "1.0.0"
resolution-markers = ["python_version >= 'banana'"]
wheels = [{ url = "https://files.example/pkg-1.0-cp39-cp39-linux.whl" }]
`,
  });
  assert.deepEqual(summarize(await uvPdmLockAnalyzer.analyze(unreadable, target)), [
    "unknown mystery@1.0.0 uv.lock:4 resolution-markers: python_version >= 'banana'",
  ]);
});

test("uv reports the project's requires-python it cannot parse", async () => {
  const root = await repo({ "uv.lock": 'requires-python = "banana"\nversion = 1\n' });
  assert.deepEqual(await uvPdmLockAnalyzer.analyze(root, target), [
    {
      analyzer: "uv-pdm-lock",
      level: "unknown",
      subject: "python",
      path: "uv.lock",
      line: 1,
      reason: 'Cannot parse the project\'s requires-python constraint "banana".',
      evidence: { kind: "lockfile", value: "requires-python: banana" },
    },
  ]);
});

test("PDM weighs requires_python by group and skips packages without one", async () => {
  const root = await repo({
    "pdm.lock": `[metadata]
requires_python = ">=3.8,<3.12"

[[package]]
name = "requests"
version = "2.31.0"
requires_python = ">=3.8,<3.12"
groups = ["default"]

[[package]]
name = "black"
version = "23.1.0"
requires_python = ">=3.8,<3.12"
groups = ["dev", "lint"]

[[package]]
name = "legacy"
version = "1.0.0"
requires_python = ">=3.8,<3.12"
groups = "dev"

[[package]]
name = "no-constraint"
version = "1.0.0"

[[package]]
version = "9.0.0"
requires_python = ">=3.8,<3.12"

[[package]]
name = "unparsable"
requires_python = "banana"
`,
  });
  const issues = await uvPdmLockAnalyzer.analyze(root, target);
  assert.deepEqual(summarize(issues), [
    "blocker python pdm.lock:2 requires_python: >=3.8,<3.12",
    "blocker requests@2.31.0 pdm.lock:7 requires_python: >=3.8,<3.12",
    "warning black@23.1.0 pdm.lock:13 requires_python: >=3.8,<3.12",
    "blocker legacy@1.0.0 pdm.lock:19 requires_python: >=3.8,<3.12",
    "unknown unparsable pdm.lock:32 requires_python: banana",
  ]);
  assert.deepEqual(
    issues.map((issue) => issue.reason),
    [
      'The project\'s [metadata] requires_python ">=3.8,<3.12" excludes Python 3.13.',
      'requests@2.31.0 declares requires_python ">=3.8,<3.12", which excludes Python 3.13.',
      'black@23.1.0 is in the dev, lint group and its requires_python ">=3.8,<3.12" excludes Python 3.13.',
      'legacy@1.0.0 declares requires_python ">=3.8,<3.12", which excludes Python 3.13.',
      'Cannot parse the requires_python constraint "banana" for unparsable.',
    ],
  );
});

test("PDM reports an unreadable lockfile and stops there", async () => {
  const root = await repo({
    "pdm.lock": "package = [[[\n",
    "pyproject.toml": '[project]\nrequires-python = ">=3.8"\n',
  });
  assert.deepEqual(await uvPdmLockAnalyzer.analyze(root, target), [
    {
      analyzer: "uv-pdm-lock",
      level: "unknown",
      subject: "pdm.lock",
      path: "pdm.lock",
      line: 1,
      reason: "pdm.lock is not valid TOML, so requires_python cannot be read.",
      evidence: { kind: "lockfile", value: "pdm.lock: invalid TOML" },
    },
  ]);
});

test("uv judges a lockfile whose packages are one inline array", async () => {
  const root = await repo({
    "uv.lock":
      'package = [{ name = "inline", version = "1.0.0", resolution-markers = ["python_full_version < \'3.10\'"] }]\n',
  });
  const issues = await uvPdmLockAnalyzer.analyze(root, target);
  assert.deepEqual(summarize(issues), [
    "blocker inline@1.0.0 uv.lock:1 resolution-markers: python_full_version < '3.10'",
  ]);
  assert.equal(
    issues[0]?.reason,
    "inline@1.0.0 resolves only for Python versions matching \"python_full_version < '3.10'\", which excludes Python 3.13.",
  );
});
