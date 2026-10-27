import assert from "node:assert/strict";
import { test } from "node:test";

import { parseArguments, parsePlan, pullRequestBody, rolloutTargets, usesEvergreen, workflowYaml, USAGE, PULL_REQUEST_TITLE } from "../tools/org-rollout.js";
import type { Repository } from "../tools/org-rollout.js";

const repo = (name: string, overrides: Partial<Repository> = {}): Repository =>
  ({ name, default_branch: "main", archived: false, fork: false, ...overrides });

test("rollout targets leave out archived repositories, forks, and empty repositories", () => {
  const repos = [
    repo("acme/active"),
    repo("acme/archived", { archived: true }),
    repo("acme/fork", { fork: true }),
    repo("acme/empty", { default_branch: "" }),
  ];
  assert.deepEqual(rolloutTargets(repos).map((entry) => entry.name), ["acme/active"]);
});

test("recognizes existing Evergreen pins across quoting styles and other actions", () => {
  assert.equal(usesEvergreen("- uses: arminazimi/evergreen@v0.7.1"), true);
  assert.equal(usesEvergreen("uses: 'arminazimi/evergreen@main'"), true);
  assert.equal(usesEvergreen("uses: arminazimi/other@v0"), false);
  assert.equal(usesEvergreen("uses: arminazimi/evergreen-sim@v0"), false);
  assert.equal(usesEvergreen(""), false);
});

test("the generated workflow pins the action, reads silently, and needs no setup", () => {
  const yaml = workflowYaml("v0.7.1", "0 4 * * 1");
  assert.match(yaml, /^name: Evergreen lifecycle scan\n\non:\n {2}pull_request:\n {2}schedule:\n {4}- cron: '0 4 \* \* 1'\n {2}workflow_dispatch:\n/m);
  assert.match(yaml, /- uses: arminazimi\/evergreen@v0\.7\.1\n {8}with:\n {10}fail-on-severity: high/);
  assert.match(yaml, /permissions:\n {2}contents: read/);
  assert.match(yaml, /- uses: actions\/checkout@v7/);
  assert.doesNotMatch(yaml, /github\.token|secrets\./);
});

test("the workflow rejects an action ref that cannot be YAML text", () => {
  assert.throws(() => workflowYaml("tag; curl", "0 4 * * 1"), /Unsupported action ref/);
  assert.throws(() => workflowYaml("", "0 4 * * 1"), /Unsupported action ref/);
});

test("the plan skips repositories that already use the action and requests the rest", () => {
  const repos = [repo("acme/one"), repo("acme/two"), repo("acme/three", { archived: true })];
  const present = new Map([["acme/two", true]]);
  assert.deepEqual(parsePlan(repos, present), [
    { repository: "acme/one", defaultBranch: "main", status: "pull-request" },
    { repository: "acme/two", defaultBranch: "main", status: "skip", reason: "a workflow already uses arminazimi/evergreen" },
  ]);
});

test("arguments carry defaults and require a target", () => {
  assert.deepEqual(parseArguments(["--org", "acme"]), { org: "acme", apply: false, schedule: "0 4 * * 1", branch: "evergreen/lifecycle-scan" });
  assert.deepEqual(parseArguments(["--repos", "acme/one ,acme/two", "--apply"]), { apply: true, repos: ["acme/one", "acme/two"], schedule: "0 4 * * 1", branch: "evergreen/lifecycle-scan" });
  assert.throws(() => parseArguments([]), /Give --org or --repos/);
  assert.throws(() => parseArguments(["--org"]), /needs a value/);
  assert.throws(() => parseArguments(["--org", "acme", "--wat"]), /Unknown option --wat/);
});

test("the pull request body says what the workflow does and how to step out", () => {
  const body = pullRequestBody();
  assert.match(body, /\.github\/workflows\/evergreen\.yml/);
  assert.match(body, /never changes this repository/);
  assert.match(body, /Closing it without merging skips this repository/);
  assert.match(body, /org rollout tool/);
  assert.equal(PULL_REQUEST_TITLE, "Scan lifecycle risks with Evergreen");
});

test("usage names both target styles and the --apply gate", () => {
  assert.match(USAGE, /--org <name>/);
  assert.match(USAGE, /--repos <owner\/name,\.\.\.>/);
  assert.match(USAGE, /--apply/);
});
