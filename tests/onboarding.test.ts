import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { badgeSnippet } from "../src/badge.js";
import { CONFIG_FILE_NAME } from "../src/config.js";
import { CI_WORKFLOW_FILE } from "../src/init.js";
import {
  CHECKOUT_ACTION_SHA,
  CHECKOUT_ACTION_TAG,
  EVERGREEN_ACTION_SHA,
  ONBOARDING_BADGE_FILE,
  detectOnboardingStacks,
  onboardingConfig,
  pinnedCiWorkflow,
  proposeOnboarding,
} from "../src/onboarding.js";
import { VERSION } from "../src/version.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const fixture = async (files: Record<string, string>) => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-onboarding-"));
  roots.push(root);
  for (const [name, contents] of Object.entries(files)) {
    await mkdir(join(root, name, ".."), { recursive: true });
    await writeFile(join(root, name), contents);
  }
  return root;
};

test("the pinned workflow uses full SHAs with version comments and the release version", () => {
  const text = pinnedCiWorkflow("high");
  assert.ok(text.includes(`uses: actions/checkout@${CHECKOUT_ACTION_SHA} # ${CHECKOUT_ACTION_TAG}`));
  assert.ok(text.includes(`uses: arminazimi/evergreen@${EVERGREEN_ACTION_SHA} # v${VERSION}`));
  assert.match(text, /fail-on-severity: high/);
  assert.match(text, /baseline: \.evergreen-baseline\.json/);
  assert.doesNotMatch(text, /uses: actions\/checkout@v\d/);
  assert.doesNotMatch(text, /uses: arminazimi\/evergreen@v\d/);
});

test("a Node fixture proposes the workflow, config, and README badge snippet", async () => {
  const root = await fixture({ "package.json": '{"name":"app"}\n' });
  const before = await readdir(root);
  const proposal = await proposeOnboarding({ root, repository: "acme/node-app" });
  assert.deepEqual(proposal.stacks, ["node"]);
  assert.deepEqual(Object.keys(proposal.files).sort(), [CI_WORKFLOW_FILE, CONFIG_FILE_NAME, ONBOARDING_BADGE_FILE].sort());
  assert.equal(proposal.files[CI_WORKFLOW_FILE], pinnedCiWorkflow("high"));
  assert.equal(proposal.files[CONFIG_FILE_NAME], onboardingConfig(["node"], "high"));
  assert.equal(proposal.files[ONBOARDING_BADGE_FILE], badgeSnippet("acme/node-app", "markdown"));
  assert.match(proposal.files[CONFIG_FILE_NAME]!, /"failOn": "high"/);
  assert.match(proposal.files[CONFIG_FILE_NAME]!, /\.evergreen-baseline\.json/);
  assert.doesNotMatch(proposal.files[CONFIG_FILE_NAME]!, /"ignore"/);
  // Pure: nothing written under the fixture.
  assert.deepEqual(await readdir(root), before);
});

test("a Python fixture proposes the same file keys with a python stack", async () => {
  const root = await fixture({ "pyproject.toml": '[project]\nname = "app"\n' });
  const proposal = await proposeOnboarding({ root, repository: "acme/py-app", gate: "medium" });
  assert.deepEqual(proposal.stacks, ["python"]);
  assert.equal(proposal.files[CI_WORKFLOW_FILE], pinnedCiWorkflow("medium"));
  assert.equal(proposal.files[CONFIG_FILE_NAME], onboardingConfig(["python"], "medium"));
  assert.equal(proposal.files[ONBOARDING_BADGE_FILE], badgeSnippet("acme/py-app", "markdown"));
});

test("a Go fixture proposes the same file keys with a go stack", async () => {
  const root = await fixture({ "go.mod": "module example.com/app\n\ngo 1.22\n" });
  const proposal = await proposeOnboarding({ root, repository: "acme/go-app" });
  assert.deepEqual(proposal.stacks, ["go"]);
  assert.deepEqual(Object.keys(proposal.files).sort(), [CI_WORKFLOW_FILE, CONFIG_FILE_NAME, ONBOARDING_BADGE_FILE].sort());
  assert.equal(proposal.files[CONFIG_FILE_NAME], onboardingConfig(["go"], "high"));
});

test("a monorepo fixture detects monorepo and adds ignore paths for generated trees", async () => {
  const root = await fixture({
    "package.json": '{"name":"root","workspaces":["packages/*"]}\n',
    "packages/a/package.json": '{"name":"a"}\n',
  });
  assert.deepEqual(await detectOnboardingStacks(root), ["monorepo", "node"]);
  const proposal = await proposeOnboarding({ root, repository: "acme/mono" });
  assert.deepEqual(proposal.stacks, ["monorepo", "node"]);
  const config = JSON.parse(proposal.files[CONFIG_FILE_NAME]!);
  assert.deepEqual(config.ignore, ["**/build/", "**/coverage/", "**/dist/"]);
  assert.equal(proposal.files[CI_WORKFLOW_FILE], pinnedCiWorkflow("high"));
  assert.equal(proposal.files[ONBOARDING_BADGE_FILE], badgeSnippet("acme/mono", "markdown"));
});

test("proposeOnboarding rejects a missing root and never creates files", async () => {
  const missing = join(tmpdir(), `evergreen-onboarding-missing-${process.pid}`);
  await assert.rejects(() => proposeOnboarding({ root: missing, repository: "acme/x" }), /is not a directory/);
  await assert.rejects(() => readFile(join(missing, CI_WORKFLOW_FILE)));
});
