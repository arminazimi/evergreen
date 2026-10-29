import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parsePathsInput, resolveScanPaths, runGitHubAction } from "../src/github-action.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Three-package monorepo: api and web use a deprecated checkout pin; worker is clean. */
async function threePackageMonorepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-action-monorepo-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "monorepo", private: true, workspaces: ["packages/*"] }));
  for (const name of ["api", "web", "worker"] as const) {
    const directory = join(root, "packages", name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: `@demo/${name}`, engines: { node: "24" } }));
  }
  for (const name of ["api", "web"] as const) {
    const workflows = join(root, "packages", name, ".github", "workflows");
    await mkdir(workflows, { recursive: true });
    await writeFile(join(workflows, "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  }
  return root;
}

async function runAction(root: string, inputs: Record<string, string> = {}): Promise<{ code: number; stdout: string; summary: string; outputs: string }> {
  const runner = join(root, ".runner");
  const output = join(runner, "outputs.txt");
  const summary = join(runner, "summary.md");
  await mkdir(runner, { recursive: true });
  await Promise.all([writeFile(output, ""), writeFile(summary, "")]);

  const child = spawn(process.execPath, [resolve("dist/src/action.js")], {
    env: {
      ...process.env,
      GITHUB_WORKSPACE: root,
      RUNNER_TEMP: runner,
      GITHUB_OUTPUT: output,
      GITHUB_STEP_SUMMARY: summary,
      INPUT_ATTRIBUTION: "false",
      ...inputs,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const code = await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolveCode(status ?? 1));
  });
  assert.equal(stderr, "");
  return { code, stdout, summary: await readFile(summary, "utf8"), outputs: await readFile(output, "utf8") };
}

test("parsePathsInput keeps non-empty lines and drops blanks", () => {
  assert.deepEqual(parsePathsInput("packages/api\n\n  packages/web  \n\npackages/worker\n"), ["packages/api", "packages/web", "packages/worker"]);
  assert.deepEqual(parsePathsInput(""), []);
});

test("resolveScanPaths expands a packages/* glob into sorted directories", async () => {
  const root = await threePackageMonorepo();
  const paths = await resolveScanPaths(root, ["packages/*"]);
  assert.deepEqual(
    paths.map((path) => path.slice(root.length + 1).replaceAll("\\", "/")),
    ["packages/api", "packages/web", "packages/worker"],
  );
});

test("a three-package paths scan writes one report, one SARIF, and three summary sections", async () => {
  const root = await threePackageMonorepo();
  const reportPath = join(root, "reports", "evergreen.json");
  const sarifPath = join(root, "reports", "evergreen.sarif");
  const paths = await resolveScanPaths(root, ["packages/*"]);

  const outcome = await runGitHubAction({
    root,
    paths,
    reportPath,
    sarifPath,
    failOnSeverity: "high",
  });

  assert.equal(outcome.packages?.length, 3);
  assert.deepEqual(
    outcome.packages?.map((pkg) => pkg.path),
    ["packages/api", "packages/web", "packages/worker"],
  );
  assert.equal(outcome.packages?.[0]?.findings.length, 1);
  assert.equal(outcome.packages?.[1]?.findings.length, 1);
  assert.equal(outcome.packages?.[2]?.findings.length, 0);
  assert.equal(outcome.result.findings.length, 2);
  assert.equal(outcome.gateFailed, true);
  assert.equal(outcome.failed, true);
  assert.equal(outcome.reportPath, reportPath);
  assert.equal(outcome.sarifPath, sarifPath);

  const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings: Array<{ location: { path: string } }> };
  assert.equal(report.findings.length, 2);
  assert.deepEqual(
    report.findings.map((finding) => finding.location.path).sort(),
    ["packages/api/.github/workflows/ci.yml", "packages/web/.github/workflows/ci.yml"],
  );

  const sarif = JSON.parse(await readFile(sarifPath, "utf8")) as { runs: Array<{ results: unknown[] }> };
  assert.equal(sarif.runs[0]?.results.length, 2);

  const { renderSummary } = await import("../src/github-action.js");
  const summary = renderSummary(outcome.result.findings, outcome.gateFailed, outcome.gate, outcome.result.data, false, undefined, undefined, outcome.packages);
  assert.match(summary, /Found \*\*2\*\* new lifecycle findings across \*\*3\*\* packages; failed the \*\*high\*\* severity gate\./);
  assert.match(summary, /^## `packages\/api`$/m);
  assert.match(summary, /^## `packages\/web`$/m);
  assert.match(summary, /^## `packages\/worker`$/m);
  const packageHeadings = [...summary.matchAll(/^## `packages\/[^`]+`$/gm)];
  assert.equal(packageHeadings.length, 3);
});

test("fail-on-severity considers findings from every path together", async () => {
  const root = await threePackageMonorepo();
  const paths = await resolveScanPaths(root, ["packages/api", "packages/worker"]);

  const high = await runGitHubAction({
    root,
    paths,
    reportPath: join(root, "high.json"),
    failOnSeverity: "high",
  });
  assert.equal(high.failed, true);
  assert.equal(high.result.findings.length, 1);

  const critical = await runGitHubAction({
    root,
    paths,
    reportPath: join(root, "critical.json"),
    failOnSeverity: "critical",
  });
  assert.equal(critical.failed, false);
});

test("the Action entry point accepts INPUT_PATHS and writes one report with three package sections", async () => {
  const root = await threePackageMonorepo();
  const run = await runAction(root, {
    INPUT_PATH: ".",
    INPUT_PATHS: "packages/*",
    "INPUT_FAIL-ON-SEVERITY": "high",
  });

  assert.equal(run.code, 1);
  assert.match(run.stdout, /across 3 packages/);
  assert.match(run.outputs, /finding-count=2/);
  assert.match(run.outputs, /report-path=/);
  assert.match(run.summary, /across \*\*3\*\* packages/);
  assert.match(run.summary, /^## `packages\/api`$/m);
  assert.match(run.summary, /^## `packages\/web`$/m);
  assert.match(run.summary, /^## `packages\/worker`$/m);
  assert.equal([...run.summary.matchAll(/^## `packages\/[^`]+`$/gm)].length, 3);

  const reportPath = join(root, ".runner", "evergreen-report.json");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings: unknown[] };
  assert.equal(report.findings.length, 2);
});
