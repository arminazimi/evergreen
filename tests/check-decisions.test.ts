import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  CONTRACT_PATHS,
  contractFor,
  decisionRecords,
  DEFAULT_BASE,
  parseArguments,
  parseNameStatus,
  renderDecisionCheck,
  type DecisionCheckResult,
} from "../tools/check-decisions.js";

const TOOL = resolve("dist/tools/check-decisions.js");

const SCHEMA = '{\n  "schemaVersion": "evergreen.scan.v1",\n  "type": "object"\n}\n';

function git(root: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function commit(root: string, message: string): Promise<void> {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
}

/** A throwaway repository with one file per contract path, committed as the base revision. */
async function repository(): Promise<{ root: string; base: string }> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-check-decisions-"));
  await mkdir(join(root, "schemas"), { recursive: true });
  await mkdir(join(root, "docs", "decisions"), { recursive: true });
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "schemas", "scan.v1.schema.json"), SCHEMA);
  await writeFile(join(root, "src", "sdk.ts"), "export interface Detector { id: string }\n");
  await writeFile(join(root, "src", "mcp.ts"), "export const TOOLS = [];\n");
  await writeFile(join(root, "src", "cli.ts"), "export const main = () => 0;\n");
  await writeFile(join(root, "docs", "decisions", "index.md"), "# Decision records\n");
  await writeFile(join(root, "README.md"), "# Fixture\n");
  git(root, "init", "-q");
  await commit(root, "base");
  return { root, base: git(root, "rev-parse", "HEAD").trim() };
}

function runTool(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: root, encoding: "utf8" });
}

test("paths classify the contract surface from AGENTS.md", () => {
  assert.deepEqual(contractFor("schemas/scan.v1.schema.json")?.contract, "published JSON Schema");
  assert.deepEqual(contractFor("schemas/vendor/sarif.schema.json")?.contract, "published JSON Schema");
  assert.deepEqual(contractFor("src/sdk.ts")?.contract, "detector SDK");
  assert.deepEqual(contractFor("src/mcp.ts")?.contract, "MCP tool shapes");
  assert.equal(contractFor("src/cli.ts"), undefined);
  assert.equal(contractFor("src/commands/scan.ts"), undefined);
  assert.equal(contractFor("docs/decisions/0022-example.md"), undefined);
  assert.equal(contractFor("schemas"), undefined);
  assert.equal(contractFor(".github/workflows/decisions.yml"), undefined);
  assert.equal(CONTRACT_PATHS.length, 3);
});

test("name-status parsing keeps both sides of a rename and paths with spaces", () => {
  const parsed = parseNameStatus(
    "M\0src/sdk.ts\0R100\0schemas/scan.v1.schema.json\0schemas/scan.v2.schema.json\0A\0docs/decisions/0022-record.md\0D\0src/old.ts\0C75\0schemas/a b.json\0schemas/c d.json\0",
  );
  assert.deepEqual(parsed, [
    { status: "M", path: "src/sdk.ts" },
    {
      status: "R",
      previousPath: "schemas/scan.v1.schema.json",
      path: "schemas/scan.v2.schema.json",
    },
    { status: "A", path: "docs/decisions/0022-record.md" },
    { status: "D", path: "src/old.ts" },
    { status: "C", previousPath: "schemas/a b.json", path: "schemas/c d.json" },
  ]);
  assert.throws(() => parseNameStatus("X\0src/sdk.ts\0"), /Unexpected git diff status "X"/);
});

test("records exclude the index, deletions, and non-Markdown files", () => {
  const records = decisionRecords([
    { status: "A", path: "docs/decisions/0022-record.md" },
    { status: "M", path: "docs/decisions/0021-old.md" },
    { status: "M", path: "docs/decisions/index.md" },
    { status: "D", path: "docs/decisions/0001-gone.md" },
    { status: "A", path: "docs/decisions/notes.txt" },
    { status: "A", path: "schemas/scan.v1.schema.json" },
  ]);
  assert.deepEqual(records, ["docs/decisions/0021-old.md", "docs/decisions/0022-record.md"]);
});

test("arguments default to origin/main and reject unknown or missing values", () => {
  assert.deepEqual(parseArguments([]), { base: DEFAULT_BASE });
  assert.equal(DEFAULT_BASE, "origin/main");
  assert.deepEqual(parseArguments(["--base", "HEAD~1"]), { base: "HEAD~1" });
  assert.throws(() => parseArguments(["--base"]), /--base needs a value/);
  assert.throws(() => parseArguments(["--base", "--json"]), /--base needs a value/);
  assert.throws(() => parseArguments(["--json"]), /Unknown argument "--json"/);
});

test("the message names the contract files and how to add a record", () => {
  const failed: DecisionCheckResult = {
    base: "origin/main",
    mergeBase: "abc123",
    contracts: [
      { path: "schemas/scan.v1.schema.json", contract: "published JSON Schema", status: "M" },
      { path: "src/sdk.ts", contract: "detector SDK", status: "M" },
    ],
    records: [],
    passed: false,
  };
  const message = renderDecisionCheck(failed);
  assert.match(message, /Public contract changed without a decision record:/);
  assert.match(message, /schemas\/scan\.v1\.schema\.json \(modified\)/);
  assert.match(message, /src\/sdk\.ts \(modified\)/);
  assert.match(message, /docs\/decisions\/0022-<slug>\.md/);
  assert.match(message, /docs\/decisions\/index\.md on its own is the index/);

  const noContract = renderDecisionCheck({ ...failed, contracts: [], passed: true });
  assert.equal(noContract, "No public contract changed; no decision record needed.");

  const passed = renderDecisionCheck({
    ...failed,
    records: ["docs/decisions/0022-sdk-record.md"],
    passed: true,
  });
  assert.match(passed, /Public contract changed with a decision record:/);
  assert.match(passed, /docs\/decisions\/0022-sdk-record\.md/);
});

test("a contract change without a record fails and names the file", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "schemas", "scan.v1.schema.json"), `${SCHEMA.slice(0, -2)}\n  "required": []\n}\n`);
    await commit(root, "change the schema");
    const run = runTool(root, "--base", base);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /Public contract changed without a decision record:/);
    assert.match(run.stdout, /schemas\/scan\.v1\.schema\.json \(modified\)/);
    assert.match(run.stdout, /docs\/decisions\//);
    assert.match(run.stderr, /Decision record required for: schemas\/scan\.v1\.schema\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a contract change with a decision record passes", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "src", "sdk.ts"), "export interface Detector { id: string; apiVersion: 2 }\n");
    await writeFile(join(root, "docs", "decisions", "0022-detector-api-version.md"), "# 0022 — Detector API version\n");
    await commit(root, "change the SDK and record the decision");
    const run = runTool(root, "--base", base);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Public contract changed with a decision record:/);
    assert.match(run.stdout, /docs\/decisions\/0022-detector-api-version\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the index alone does not count as a record", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "src", "mcp.ts"), 'export const TOOLS = [{ name: "scan" }];\n');
    await writeFile(
      join(root, "docs", "decisions", "index.md"),
      "# Decision records\n\n- [0022](0022-detector-api-version.md)\n",
    );
    await commit(root, "register a record in the index only");
    const run = runTool(root, "--base", base);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /src\/mcp\.ts \(modified\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("changes outside the public contracts pass, with or without a record", async () => {
  const { root, base } = await repository();
  try {
    await writeFile(join(root, "src", "cli.ts"), "export const main = () => 1;\n");
    await commit(root, "change a command");
    let run = runTool(root, "--base", base);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No public contract changed/);

    await writeFile(join(root, "docs", "decisions", "0022-cli.md"), "# 0022 — CLI\n");
    await commit(root, "add a record only");
    run = runTool(root, "--base", base);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No public contract changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renaming a contract file still needs a record, naming the destination", async () => {
  const { root, base } = await repository();
  try {
    git(root, "mv", "schemas/scan.v1.schema.json", "schemas/scan.v2.schema.json");
    await commit(root, "rename the schema");
    let run = runTool(root, "--base", base);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stdout, /schemas\/scan\.v2\.schema\.json/);

    await writeFile(join(root, "docs", "decisions", "0022-schema-rename.md"), "# 0022 — Schema rename\n");
    await commit(root, "record the rename");
    run = runTool(root, "--base", base);
    assert.equal(run.status, 0, run.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("renaming a file outside the public contracts passes", async () => {
  const { root, base } = await repository();
  try {
    git(root, "mv", "README.md", "README.txt");
    await commit(root, "rename the readme");
    const run = runTool(root, "--base", base);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No public contract changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the diff starts at the merge base, not at the base tip", async () => {
  const { root, base } = await repository();
  try {
    // The base branch moves on after the fork point and changes a contract file.
    git(root, "checkout", "-q", "-b", "mainline");
    await writeFile(join(root, "schemas", "scan.v1.schema.json"), `${SCHEMA.slice(0, -2)}\n  "onBase": true\n}\n`);
    await commit(root, "change the schema on the base branch");

    // The pull request starts at the fork point and touches no contract.
    git(root, "checkout", "-q", "-b", "feature", base);
    await writeFile(join(root, "README.md"), "# Fixture\n\nFeature work.\n");
    await commit(root, "change the readme on the feature branch");

    const run = runTool(root, "--base", "mainline");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /No public contract changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a base ref that cannot be compared fails with a clear message", async () => {
  const { root } = await repository();
  try {
    const run = runTool(root, "--base", "no-such-ref");
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /Cannot compare against "no-such-ref"/);
    assert.match(run.stderr, /--base <ref>/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
