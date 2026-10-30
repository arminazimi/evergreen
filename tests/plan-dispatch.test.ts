import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { buildPlan } from "../src/plan-build.js";
import type { Plan } from "../src/plan.js";

const scriptPath = resolve("examples/plan-dispatch/dispatch.mjs");
const dispatch = (await import(pathToFileURL(scriptPath).href)) as {
  MIGRATE_FINDING_PROMPT: string;
  worktreePathForBranch(branch: string): string;
  worktreeAddCommand(branch: string): string;
  renderDispatch(plan: Plan): string;
  dispatchFromJson(text: string): string;
  main(stdinText?: string, write?: (text: string) => void): number;
};

const DEMO_DISPATCH = `# Wave 0
git worktree add -b evergreen/github-actions.checkout.node20-github-a .worktrees/evergreen-github-actions.checkout.node20-github-a
migrate-finding

git worktree add -b evergreen/npm.package.request.deprecated-npm.pack .worktrees/evergreen-npm.package.request.deprecated-npm.pack
migrate-finding

# Wave 1
git worktree add -b evergreen/nodejs.runtime.eol-18-nodejs.r .worktrees/evergreen-nodejs.runtime.eol-18-nodejs.r
migrate-finding

# Wave 2
git worktree add -b evergreen/nodejs.runtime.eol-19-nodejs.r .worktrees/evergreen-nodejs.runtime.eol-19-nodejs.r
migrate-finding

# Wave 3
git worktree add -b evergreen/nodejs.runtime.eol-20-nodejs.r .worktrees/evergreen-nodejs.runtime.eol-20-nodejs.r
migrate-finding
`;

test("the dispatch example prints one worktree command and migrate-finding per demo task", async () => {
  const scan = await scanRepository(resolve("examples/demo"), builtInDetectors);
  const plan = buildPlan(scan);
  assert.equal(plan.summary.items, 5);
  assert.equal(plan.summary.waves, 4);
  assert.equal(dispatch.renderDispatch(plan), DEMO_DISPATCH);
  assert.equal(dispatch.dispatchFromJson(JSON.stringify(plan)), DEMO_DISPATCH);
});

test("main writes the dispatch text and never needs a child process", () => {
  const chunks: string[] = [];
  const code = dispatch.main(JSON.stringify(buildPlanFromFixture()), (text) => chunks.push(text));
  assert.equal(code, 0);
  assert.equal(chunks.join(""), DEMO_DISPATCH);
});

test("the example source does not spawn processes", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.doesNotMatch(source, /\bchild_process\b/);
  assert.doesNotMatch(source, /\b(?:spawn|exec|execFile|fork)(?:Sync)?\b/);
  assert.equal(dispatch.MIGRATE_FINDING_PROMPT, "migrate-finding");
  assert.equal(
    dispatch.worktreeAddCommand("evergreen/demo-branch"),
    "git worktree add -b evergreen/demo-branch .worktrees/evergreen-demo-branch",
  );
});

test("invalid input fails without printing a partial dispatch", () => {
  assert.throws(() => dispatch.dispatchFromJson("{"), /Invalid JSON/);
  assert.throws(() => dispatch.dispatchFromJson("{}"), /evergreen\.plan\.v1/);
  assert.throws(
    () =>
      dispatch.renderDispatch({
        schema: "evergreen.plan.v1",
        waves: [{ index: 0, itemIds: ["missing"] }],
        items: [],
        summary: { items: 0, waves: 1, bySeverity: { info: 0, low: 0, medium: 0, high: 0, critical: 0 } },
      }),
    /unknown item id/,
  );
});

/** Stable stand-in for the demo plan used when the test only needs the printed shape. */
function buildPlanFromFixture(): Plan {
  return {
    schema: "evergreen.plan.v1",
    waves: [
      {
        index: 0,
        itemIds: [
          "github-actions.checkout.node20:.github/workflows/ci.yml:9",
          "npm.package.request.deprecated:package.json:8",
        ],
      },
      { index: 1, itemIds: ["nodejs.runtime.eol-18:package.json:5"] },
      { index: 2, itemIds: ["nodejs.runtime.eol-19:package.json:5"] },
      { index: 3, itemIds: ["nodejs.runtime.eol-20:package.json:5"] },
    ],
    items: [
      {
        id: "github-actions.checkout.node20:.github/workflows/ci.yml:9",
        findingId: "github-actions.checkout.node20:.github/workflows/ci.yml:9",
        title: "Unsupported actions/checkout runtime",
        severity: "high",
        touches: [".github/workflows/ci.yml"],
        branch: "evergreen/github-actions.checkout.node20-github-a",
        wave: 0,
      },
      {
        id: "nodejs.runtime.eol-18:package.json:5",
        findingId: "nodejs.runtime.eol-18:package.json:5",
        title: "Node.js 18 is end-of-life",
        severity: "medium",
        touches: ["package.json"],
        branch: "evergreen/nodejs.runtime.eol-18-nodejs.r",
        wave: 1,
      },
      {
        id: "nodejs.runtime.eol-19:package.json:5",
        findingId: "nodejs.runtime.eol-19:package.json:5",
        title: "Node.js 19 is end-of-life",
        severity: "medium",
        touches: ["package.json"],
        branch: "evergreen/nodejs.runtime.eol-19-nodejs.r",
        wave: 2,
      },
      {
        id: "nodejs.runtime.eol-20:package.json:5",
        findingId: "nodejs.runtime.eol-20:package.json:5",
        title: "Node.js 20 is end-of-life",
        severity: "medium",
        touches: ["package.json"],
        branch: "evergreen/nodejs.runtime.eol-20-nodejs.r",
        wave: 3,
      },
      {
        id: "npm.package.request.deprecated:package.json:8",
        findingId: "npm.package.request.deprecated:package.json:8",
        title: "request is deprecated",
        severity: "high",
        touches: ["package.json", "src/client.js"],
        branch: "evergreen/npm.package.request.deprecated-npm.pack",
        wave: 0,
      },
    ],
    summary: {
      items: 5,
      waves: 4,
      bySeverity: { info: 0, low: 0, medium: 3, high: 2, critical: 0 },
    },
  };
}
