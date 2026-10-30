import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { parseChangedLines, renderSummary, runGitHubAction, selectChangedAnnotations } from "../src/github-action.js";
import type { Finding } from "../src/domain.js";

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

// The bundled lifecycle data's version, review date, and age all change over time, so the whole data
// line is normalized before snapshotting.
function normalizeDataLine(summary: string): string {
  return summary.replace(/^Data: .+$/m, "Data: <data>");
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
  assert.equal(
    run.outputs,
    `report-path=${join(root, ".runner", "evergreen-report.json")}\nfinding-count=0\nhas-new-findings=false\nhighest-severity=\nnext-eol-date=\nfindings-json=[]\n`,
  );
  assert.equal(
    normalizeDataLine(run.summary),
    `## Evergreen\n\nFound **0** new lifecycle findings; passed the severity gate.\n\nData: <data>\n`,
  );
  assert.match(run.summary, /^Data: bundled .+, evidence reviewed through \d{4}-\d{2}-\d{2} \(.+\)$/m);
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
  assert.equal(
    run.outputs,
    `report-path=${reportPath}\nfinding-count=1\nhas-new-findings=true\nhighest-severity=high\nnext-eol-date=2026-09-23\nfindings-json=[{"id":"github-actions.checkout.node20:.github/workflows/ci.yml:4","ruleId":"github-actions.checkout.node20","severity":"high","title":"Unsupported actions/checkout runtime","path":".github/workflows/ci.yml","line":4,"deadline":"2026-09-23"}]\n`,
  );
  assert.equal(
    normalizeDataLine(run.summary),
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
      "Data: <data>",
      "",
    ].join("\n"),
  );
  assert.match(run.summary, /^Data: bundled .+, evidence reviewed through \d{4}-\d{2}-\d{2} \(.+\)$/m);
});

test("the outputs name the most severe finding and the earliest deadline", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-outputs-severity-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "Dockerfile"), "FROM node:22\n");
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");

  const run = await runAction(root, { "INPUT_FAIL-ON-SEVERITY": "none" });

  assert.equal(run.code, 0);
  assert.match(run.outputs, /^has-new-findings=true$/m);
  assert.match(run.outputs, /^highest-severity=high$/m);
  assert.match(run.outputs, /^next-eol-date=2026-09-23$/m, "the checkout deadline is earlier than the Dockerfile one");
  const line = run.outputs.split("\n").find((entry) => entry.startsWith("findings-json="))!;
  const entries = JSON.parse(line.slice("findings-json=".length)) as Array<Record<string, unknown>>;
  assert.deepEqual(entries.map((entry) => entry.severity).sort(), ["high", "low"]);
  assert.deepEqual(Object.keys(entries[0]!).sort(), ["deadline", "id", "line", "path", "ruleId", "severity", "title"], "the JSON stays compact");
});

test("diff mode outputs cover only the findings the pull request introduces", async () => {
  const { root, base, head } = await repositoryWithAddedFinding();
  await writeFile(join(root, "event.json"), JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  const run = await runAction(root, {
    INPUT_MODE: "diff",
    GITHUB_EVENT_PATH: join(root, "event.json"),
    "INPUT_FAIL-ON-SEVERITY": "none",
  });

  assert.equal(run.code, 0);
  assert.match(run.outputs, /^has-new-findings=true$/m);
  assert.match(run.outputs, /^highest-severity=high$/m);
  assert.match(run.outputs, /^next-eol-date=2026-09-23$/m);
  const line = run.outputs.split("\n").find((entry) => entry.startsWith("findings-json="))!;
  assert.deepEqual(JSON.parse(line.slice("findings-json=".length)), [{
    id: "github-actions.checkout.node20:.github/workflows/ci.yml:4",
    ruleId: "github-actions.checkout.node20",
    severity: "high",
    title: "Unsupported actions/checkout runtime",
    path: ".github/workflows/ci.yml",
    line: 4,
    deadline: "2026-09-23",
  }]);

  await writeFile(join(root, "event.json"), JSON.stringify({ pull_request: { base: { sha: head }, head: { sha: base } } }));
  const reversed = await runAction(root, {
    INPUT_MODE: "diff",
    GITHUB_EVENT_PATH: join(root, "event.json"),
    "INPUT_FAIL-ON-SEVERITY": "none",
  });
  assert.equal(reversed.code, 0);
  assert.match(reversed.outputs, /^has-new-findings=false$/m);
  assert.match(reversed.outputs, /^highest-severity=$/m);
  assert.match(reversed.outputs, /^next-eol-date=$/m);
  assert.match(reversed.outputs, /^findings-json=\[\]$/m);
});

test("action.yml declares the downstream outputs and wires them to the scan step", async () => {
  const action = parseYaml(await readFile(resolve("action.yml"), "utf8")) as { outputs: Record<string, { value: string }> };
  for (const name of ["has-new-findings", "highest-severity", "next-eol-date", "findings-json"]) {
    assert.equal(action.outputs[name]?.value, "${{ steps.scan.outputs." + name + " }}");
  }
});

function git(root: string, args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

async function gitRepository(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "evergreen@example.com"]);
  git(root, ["config", "user.name", "Evergreen test"]);
  return root;
}

/** The head adds a workflow that pins the unsupported checkout, so the finding sits on a line the pull request added. */
async function repositoryWithAddedFinding(): Promise<{ root: string; base: string; head: string }> {
  const root = await gitRepository("evergreen-diff-annotation-");
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "24" } }));
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]).trim();
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "head"]);
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  return { root, base, head };
}

/** The head only adds the lockfile that resolves the deprecated package, so the finding stays on an untouched package.json line. */
async function repositoryWithUnchangedFindingLine(): Promise<{ root: string; base: string; head: string }> {
  const root = await gitRepository("evergreen-diff-unchanged-");
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "x", dependencies: { request: "^2.88.2" } }, null, 2)}\n`);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]).trim();
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify({ name: "x", lockfileVersion: 3, packages: { "": { name: "x", dependencies: { request: "^2.88.2" } }, "node_modules/request": { version: "2.88.2" } } }, null, 2)}\n`);
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "lockfile"]);
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  return { root, base, head };
}

test("parseChangedLines reads the new-side ranges git diff reports", () => {
  const diff = [
    "diff --git a/package.json b/package.json",
    "--- a/package.json",
    "+++ b/package.json",
    "@@ -1,0 +2,2 @@",
    "@@ -9 +10,0 @@",
    "diff --git a/a.txt b/a.txt",
    "--- /dev/null",
    '+++ "b/a file.txt"',
    "@@ -0,0 +1,3 @@",
  ].join("\n");
  assert.deepEqual([...parseChangedLines(diff)], [
    ["package.json", [{ start: 2, end: 3 }]],
    ["a file.txt", [{ start: 1, end: 3 }]],
  ]);
});

test("selectChangedAnnotations keeps findings on changed lines and counts the rest", () => {
  const finding = (path: string, line?: number): Finding =>
    ({ location: { path, ...(line === undefined ? {} : { line }) } }) as unknown as Finding;
  const selected = selectChangedAnnotations(
    [finding("package.json", 4), finding("package.json", 9), finding("package.json"), finding("other.json", 4)],
    new Map([["package.json", [{ start: 3, end: 5 }]]]),
  );
  assert.deepEqual(selected.annotated.map((entry) => entry.location), [{ path: "package.json", line: 4 }]);
  assert.equal(selected.unannotated.length, 3);
});

test("diff mode annotates findings on changed lines and leaves out the rest by default", async () => {
  const added = await repositoryWithAddedFinding();
  const reportPath = join(added.root, ".runner", "evergreen-report.json");
  const onChangedLine = await runGitHubAction({ root: added.root, reportPath, mode: "diff", diffRange: `${added.base}..${added.head}`, failOnSeverity: "none" });
  assert.equal(onChangedLine.result.findings.length, 1);
  assert.equal(onChangedLine.annotations.length, 1);
  assert.equal(onChangedLine.unannotated, 0);

  const unchanged = await repositoryWithUnchangedFindingLine();
  const base = { root: unchanged.root, reportPath: join(unchanged.root, ".runner", "evergreen-report.json"), mode: "diff" as const, diffRange: `${unchanged.base}..${unchanged.head}`, failOnSeverity: "none" as const };

  const changed = await runGitHubAction(base);
  assert.equal(changed.result.findings.length, 1, "the lockfile resolves the deprecated package");
  assert.deepEqual(changed.annotations, [], "the finding is on a package.json line the pull request never touched");
  assert.equal(changed.unannotated, 1);

  const all = await runGitHubAction({ ...base, annotations: "all" });
  assert.equal(all.annotations.length, 1);
  assert.equal(all.unannotated, 0);

  const none = await runGitHubAction({ ...base, annotations: "none" });
  assert.deepEqual(none.annotations, []);
  assert.equal(none.unannotated, 0);
});

test("the diff summary counts the findings left out of the annotations and links the report", async () => {
  const { root, base, head } = await repositoryWithUnchangedFindingLine();
  await writeFile(join(root, "event.json"), JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  const run = await runAction(root, {
    INPUT_MODE: "diff",
    GITHUB_EVENT_PATH: join(root, "event.json"),
    "INPUT_FAIL-ON-SEVERITY": "none",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "o/r",
    GITHUB_RUN_ID: "7",
  });

  assert.equal(run.code, 0);
  assert.doesNotMatch(run.stdout, /^::(?:error|warning|notice) file=/m);
  assert.match(
    run.summary,
    /Not annotated: \*\*1\*\* finding not on lines this pull request changed; the \[JSON report\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/7\) lists every finding\./,
  );
});

test("annotations: none suppresses every annotation without adding the summary line", async () => {
  const { root, base, head } = await repositoryWithUnchangedFindingLine();
  await writeFile(join(root, "event.json"), JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }));
  const run = await runAction(root, {
    INPUT_MODE: "diff",
    INPUT_ANNOTATIONS: "none",
    GITHUB_EVENT_PATH: join(root, "event.json"),
    "INPUT_FAIL-ON-SEVERITY": "none",
  });

  assert.equal(run.code, 0);
  assert.doesNotMatch(run.stdout, /^::(?:error|warning|notice) file=/m);
  assert.equal(run.summary.includes("Not annotated:"), false);
});

test("annotations: changed in scan mode annotates every finding and says why", async () => {
  const root = await repositoryWithFailingFinding();
  const run = await runAction(root, { INPUT_ANNOTATIONS: "changed", "INPUT_FAIL-ON-SEVERITY": "high" });

  assert.equal(run.code, 1);
  assert.match(run.stdout, /annotations: changed needs diff mode/);
  assert.match(run.stdout, /::error file=\.github\/workflows\/ci\.yml,line=4/);
});

test("an invalid annotations value fails the run before any scan", async () => {
  const root = await repositoryWithoutFindings();
  const run = await runAction(root, { INPUT_ANNOTATIONS: "everywhere" });

  assert.equal(run.code, 1);
  assert.match(run.stdout, /Invalid annotations: everywhere/);
});

const DAY = 86_400_000;
const today = (): string => new Date().toISOString().slice(0, 10);
const inDays = (days: number): string => new Date(Date.parse(`${today()}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

function datedFinding(id: string, severity: Finding["severity"], title: string, path: string, deadline?: string, line?: number): Finding {
  return {
    id,
    ruleId: id.split(":")[0]!,
    detector: "npm",
    title,
    summary: "s",
    severity,
    confidence: "exact",
    location: line === undefined ? { path } : { path, line },
    sources: [{ title: "Vendor | notice", url: "https://example.com/notice" }],
    ...(deadline === undefined ? {} : { deadline }),
  };
}

test("the job summary opens with a twelve-month timeline and days left for each dated finding", () => {
  const text = renderSummary(
    [
      datedFinding("a.high:p:1", "high", "Soon | one", "package.json", inDays(0), 3),
      datedFinding("b.high:p:2", "high", "One day", "package.json", inDays(1), 4),
      datedFinding("c.low:p:3", "low", "Later one", ".nvmrc", inDays(200)),
      datedFinding("d.low:p:4", "low", "Undated one", "Dockerfile"),
    ],
    false,
    "high",
    undefined,
    false,
  );

  assert.match(text, /\*\*Next 12 months:\*\* 3 dated lifecycle events affect this repository \(\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}\)\./);
  assert.ok(text.includes(`| ${inDays(0)} | today | high | Soon \\| one | \`package.json:3\` |`), text);
  assert.ok(text.includes(`| ${inDays(1)} | 1 day left | high | One day | \`package.json:4\` |`), text);
  assert.ok(text.includes(`| ${inDays(200)} | 200 days left | low | Later one | \`.nvmrc\` |`), text);
  assert.equal(text.split("\n").filter((line) => /^\| \d{4}-\d{2}-\d{2} \|/.test(line)).length, 3, "the undated finding is not in the timeline");
  assert.ok(text.indexOf("### Timeline") < text.indexOf("| Severity | Findings |"), "the timeline opens the summary");
});

test("the timeline keeps ten dated events and points at the report for the rest", () => {
  const many = Array.from({ length: 13 }, (_, index) => datedFinding(`r${index + 1}:p:1`, "low", `Event ${index + 1}`, "package.json", inDays(index + 1)));
  const text = renderSummary(many, false, "high", undefined, false);

  assert.equal(text.split("\n").filter((line) => /^\| \d{4}-\d{2}-\d{2} \|/.test(line)).length, 10);
  assert.match(text, /…and 3 more dated events; the JSON report artifact lists every deadline\./);
});

test("a scan with a dated finding writes the timeline with days left into the job summary", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-summary-timeline-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "Dockerfile"), "FROM node:22\n");

  const run = await runAction(root);

  assert.equal(run.code, 0);
  const deadline = "2027-04-30";
  const days = Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / DAY);
  assert.match(run.summary, /### Timeline/);
  assert.ok(
    run.summary.includes(`| ${deadline} | ${days} days left | low | Node.js image release line 22 reaches end-of-life on 2027-04-30 | \`Dockerfile:1\` |`),
    run.summary,
  );
});

test("action.yml declares annotations with an empty default and passes it to the scan step", async () => {
  const action = parseYaml(await readFile(resolve("action.yml"), "utf8")) as { inputs: Record<string, { default?: string }>; runs: { steps: Array<{ env?: Record<string, string> }> } };
  assert.equal(action.inputs.annotations?.default, "");
  assert.equal(action.runs.steps[0]?.env?.INPUT_ANNOTATIONS, "${{ inputs.annotations }}");
});
