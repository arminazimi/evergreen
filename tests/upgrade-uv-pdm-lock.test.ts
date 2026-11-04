import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";

import { checkUpgrade } from "../src/upgrade/index.js";
import { copyFixtureTree } from "./fixture-copies.js";

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
