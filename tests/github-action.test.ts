import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface ActionRun {
  code: number;
  stdout: string;
  /** The workflow annotation commands the runner printed, in order. */
  annotations: string[];
  summary: string;
  outputs: string;
}

/** Runs the compiled Action entry point against a fixture with a fake step summary. */
async function runAction(root: string, inputs: Record<string, string> = {}): Promise<ActionRun> {
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
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const code = await new Promise<number>((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolveCode(status ?? 1));
  });
  assert.equal(stderr, "");
  return {
    code,
    stdout,
    annotations: stdout.split("\n").filter((line) => line.startsWith("::")),
    summary: await readFile(summary, "utf8"),
    outputs: await readFile(output, "utf8"),
  };
}

// The bundled lifecycle data grows one day older per day, so its age is normalized before snapshotting.
function normalizeDataAge(summary: string): string {
  return summary.replace(/(evidence reviewed through [0-9-]+) \([^)]+\)/, "$1 (<age>)");
}

async function repositoryWithoutFindings(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-summary-clean-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "24" } }));
  return root;
}

async function repositoryWithFailingFinding(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-summary-fail-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "24" } }));
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  await writeFile(join(workflows, "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  return root;
}

test("a clean run writes the zero-findings summary, no annotations, and exits 0", async () => {
  const root = await repositoryWithoutFindings();
  const run = await runAction(root, { "INPUT_FAIL-ON-SEVERITY": "high" });

  assert.equal(run.code, 0);
  assert.deepEqual(run.annotations, []);
  assert.equal(run.outputs, `report-path=${join(root, ".runner", "evergreen-report.json")}\nfinding-count=0\n`);
  assert.equal(
    normalizeDataAge(run.summary),
    `## Evergreen\n\nFound **0** new lifecycle findings; passed the severity gate.\n\nData: bundled 0.7.1, evidence reviewed through 2026-10-27 (<age>)\n`,
  );
});

test("a run whose findings meet the severity gate fails with the finding and gate annotations", async () => {
  const root = await repositoryWithFailingFinding();
  const reportPath = join(root, ".runner", "evergreen-report.json");
  const run = await runAction(root, { "INPUT_FAIL-ON-SEVERITY": "high" });

  assert.equal(run.code, 1);
  assert.deepEqual(run.annotations, [
    `::error file=.github/workflows/ci.yml,line=4,title=Evergreen%3A Unsupported actions/checkout runtime::actions/checkout@v4: This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.%0AReplacement: actions/checkout@v5 or later%0AFinding: github-actions.checkout.node20:.github/workflows/ci.yml:4`,
    `::error title=Evergreen policy gate failed::Evergreen failed: 1 finding met or exceeded the high severity gate. JSON report: ${reportPath}. Next steps: review the annotations and JSON report, then fix the findings or update the baseline and rerun Evergreen.`,
  ]);
  assert.equal(run.outputs, `report-path=${reportPath}\nfinding-count=1\n`);
  assert.equal(
    normalizeDataAge(run.summary),
    [
      "## Evergreen",
      "",
      "Found **1** new lifecycle finding; failed the **high** severity gate.",
      "",
      "| Severity | Findings |",
      "|---|---|",
      "| high | 1 |",
      "",
      "| Severity | Finding | Location | Evidence |",
      "|---|---|---|---|",
      "| high | Unsupported actions/checkout runtime | `.github/workflows/ci.yml:4` | [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/) |",
      "",
      `Data: bundled 0.7.1, evidence reviewed through 2026-10-27 (<age>)`,
      "",
    ].join("\n"),
  );
});
