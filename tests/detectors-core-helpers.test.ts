import assert from "node:assert/strict";
import { test } from "node:test";

import { setupNodeVersions } from "../src/detectors/github-actions-node.js";
import {
  type GitHubActionRule,
  outdatedActionFinding,
  unresolvedShaReference,
} from "../src/detectors/github-actions.js";
import { stripJsonc } from "../src/jsonc.js";
import { collectIniRuntime, isRuntimeOption, toxPythonVersions } from "../src/detectors/python/parse-ini.js";

test("stripJsonc drops line and block comments but keeps newlines inside block comments", () => {
  const stripped = stripJsonc('{ // note\n"a": 1, /* one\ntwo */ "b": 2 }');
  assert.deepEqual(JSON.parse(stripped), { a: 1, b: 2 });
  assert.equal(stripped.split("\n").length, 3);
});

test("stripJsonc leaves comment markers and escapes inside strings alone", () => {
  const source = '{"url": "http://x//y", "q": "a\\"/*b*/", "c": 1}';
  assert.deepEqual(JSON.parse(stripJsonc(source)), { url: "http://x//y", q: 'a"/*b*/', c: 1 });
});

test("stripJsonc replaces trailing commas, even before comments, and keeps real ones", () => {
  assert.deepEqual(JSON.parse(stripJsonc('{"a": [1, 2, ], "b": 3, /* x */ }')), { a: [1, 2], b: 3 });
  assert.equal(stripJsonc("[1,\n2]"), "[1,\n2]");
});

test("stripJsonc tolerates unterminated comments and strings", () => {
  assert.equal(stripJsonc("1 /* open"), "1 ");
  assert.equal(stripJsonc("1 // open"), "1 ");
  assert.equal(stripJsonc('"open'), '"open');
});

test("isRuntimeOption names the one runtime option of each ini file", () => {
  assert.equal(isRuntimeOption("setup.cfg", "options", "python_requires"), true);
  assert.equal(isRuntimeOption("setup.cfg", "tox", "envlist"), false);
  assert.equal(isRuntimeOption("tox.ini", "tox", "env_list"), true);
  assert.equal(isRuntimeOption("tox.ini", "tox", undefined), false);
});

test("toxPythonVersions reads plain and braced py environments", () => {
  assert.deepEqual([...toxPythonVersions("py39, py{310,311}-lint, docs")], ["3.9", "3.10", "3.11"]);
  assert.deepEqual([...toxPythonVersions("lint, docs")], []);
});

test("collectIniRuntime joins a multi-line python_requires into one declaration", () => {
  const cfg = "[options]\npython_requires = >=3.8,\n    <3.13\n";
  assert.deepEqual(collectIniRuntime("setup.cfg", cfg, "setup.cfg"), [
    { path: "setup.cfg", line: 2, value: ">=3.8,,<3.13", kind: "compatibility range" },
  ]);
});

test("collectIniRuntime reads tox envlist entries and ignores other sections", () => {
  const ini = "[testenv]\nenvlist = py27\n[tox]\nenvlist =\n    py38\n    py312-lint  # comment\n";
  assert.deepEqual(
    collectIniRuntime("tox.ini", ini, "tox.ini").map(({ value, line }) => [value, line]),
    [
      ["3.8", 5],
      ["3.12", 6],
    ],
  );
});

const WORKFLOW = `jobs:
  build:
    strategy:
      matrix:
        node: [16, "18.x"]
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node }}
  other:
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/checkout@v4
        with:
          node-version: 14
      - uses: actions/setup-node@v4
        with:
          node-version: \${{ inputs.v }}
`;

test("setupNodeVersions follows a matrix reference to its list and flags other expressions", () => {
  assert.deepEqual(setupNodeVersions(WORKFLOW), [
    { value: "16", line: 5, expression: false },
    { value: "18.x", line: 5, expression: false },
    { value: "20", line: 14, expression: false },
    { value: "${{ inputs.v }}", line: 20, expression: true },
  ]);
});

test("setupNodeVersions returns nothing for invalid or job-less YAML", () => {
  assert.deepEqual(setupNodeVersions("jobs: [\n"), []);
  assert.deepEqual(setupNodeVersions("name: x\n"), []);
});

const SHA = "a".repeat(40);

test("unresolvedShaReference reports only SHA pins, naming the reason", () => {
  const base = { action: "actions/checkout", line: 4 };
  assert.equal(unresolvedShaReference({ ...base, ref: "v3" }, "w.yml"), undefined);
  assert.deepEqual(unresolvedShaReference({ ...base, ref: SHA.toUpperCase() }, "w.yml"), {
    component: "actions/checkout",
    reference: SHA,
    reason: "unknown-sha",
    location: { path: "w.yml", line: 4 },
  });
  assert.equal(
    unresolvedShaReference({ ...base, ref: SHA, comment: "# v3 -> v4" }, "w.yml")?.reason,
    "invalid-version-comment",
  );
});

test("outdatedActionFinding names where the resolved version came from", () => {
  const rule: GitHubActionRule = {
    id: "gha.checkout",
    ecosystem: "github-actions",
    title: "t",
    summary: "S.",
    severity: "high",
    action: "actions/checkout",
    supportedFromMajor: 4,
    sources: [],
  };
  const reference = { action: "actions/checkout", ref: SHA, line: 7 };
  const summary = (source: "tag" | "comment" | "map"): string =>
    outdatedActionFinding(reference, rule, { version: "v3.1", source }, "w.yml").summary;
  assert.equal(summary("tag"), `actions/checkout@${SHA}: S.`);
  assert.equal(summary("comment"), `actions/checkout@${SHA} (v3.1 from the trailing comment): S.`);
  assert.equal(summary("map"), `actions/checkout@${SHA} (v3.1 from the bundled SHA map): S.`);
  assert.equal(
    outdatedActionFinding(reference, rule, { version: "v3", source: "tag" }, "w.yml").id,
    "gha.checkout:w.yml:7",
  );
});
