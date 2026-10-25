import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { createBaseline, writeBaseline } from "../src/baseline.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import type { Finding } from "../src/domain.js";
import { renderBadgeSvg } from "../src/badge.js";
import { renderBadge, renderFailure, runGitHubAction } from "../src/github-action.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-action-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  return root;
}

async function runActionFixture(root: string, inputs: Record<string, string> = {}): Promise<{ code: number; stdout: string; outputs: string; summary: string }> {
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
  return { code, stdout, outputs: await readFile(output, "utf8"), summary: await readFile(summary, "utf8") };
}

test("the GitHub Action reports only regressions and enforces severity gates", async () => {
  const root = await fixtureRepository();
  const baselinePath = join(root, ".evergreen-baseline.json");
  await writeBaseline(baselinePath, createBaseline(await scanRepository(root, builtInDetectors)));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );

  const reportPath = join(root, "reports", "evergreen.json");
  const outcome = await runGitHubAction({
    root,
    baselinePath,
    reportPath,
    failOnSeverity: "high",
  });

  assert.equal(outcome.result.findings.length, 1);
  assert.match(outcome.result.diagnostics.at(-1) ?? "", /Suppressed 1 finding/);
  assert.equal(outcome.failed, true);
  assert.equal(
    renderFailure(outcome),
    `Evergreen failed: 1 finding met or exceeded the high severity gate. JSON report: ${reportPath}. Next steps: review the annotations and JSON report, then fix the findings or update the baseline and rerun Evergreen.`,
  );
  assert.deepEqual(outcome.annotations[0], {
    level: "error",
    title: "Evergreen: Unsupported actions/checkout runtime",
    message: `${outcome.result.findings[0]?.summary}\nReplacement: actions/checkout@v5 or later\nFinding: ${outcome.result.findings[0]?.id}`,
    location: { path: ".github/workflows/ci.yml", line: 4 },
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings: unknown[] };
  assert.equal(report.findings.length, 1);

  const criticalOnly = await runGitHubAction({
    root,
    baselinePath,
    reportPath: join(root, "critical.json"),
    failOnSeverity: "critical",
  });
  assert.equal(criticalOnly.failed, false);
});

test("representative public, private, and no-findings Action runs honor baselines and gates", async () => {
  const publicRoot = await mkdtemp(join(tmpdir(), "evergreen-action-public-"));
  temporaryRoots.push(publicRoot);
  await writeFile(join(publicRoot, "package.json"), JSON.stringify({ engines: { node: "24" } }));
  await mkdir(join(publicRoot, ".github", "workflows"), { recursive: true });
  await writeFile(join(publicRoot, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
  const publicRun = await runActionFixture(publicRoot, { "INPUT_FAIL-ON-SEVERITY": "high" });
  assert.equal(publicRun.code, 1, "a public repository without a baseline fails its configured gate");
  assert.match(publicRun.stdout, /Evergreen policy gate failed/);
  assert.match(publicRun.stdout, /1 finding met or exceeded the high severity gate/);
  assert.match(publicRun.stdout, new RegExp(`JSON report: ${join(publicRoot, ".runner", "evergreen-report.json").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(publicRun.outputs, /finding-count=1/);

  const privateRoot = await fixtureRepository();
  const baseline = join(privateRoot, ".evergreen-baseline.json");
  await writeBaseline(baseline, createBaseline(await scanRepository(privateRoot, builtInDetectors)));
  const privateRun = await runActionFixture(privateRoot, {
    INPUT_BASELINE: ".evergreen-baseline.json",
    "INPUT_FAIL-ON-SEVERITY": "high",
  });
  assert.equal(privateRun.code, 0, "a private repository can keep known findings in a local baseline");
  assert.match(privateRun.outputs, /finding-count=0/);
  assert.match(privateRun.summary, /Found \*\*0\*\* new lifecycle findings; passed the severity gate\./);

  const cleanRoot = await mkdtemp(join(tmpdir(), "evergreen-action-clean-"));
  temporaryRoots.push(cleanRoot);
  await writeFile(join(cleanRoot, "package.json"), JSON.stringify({ engines: { node: "24" } }));
  const cleanRun = await runActionFixture(cleanRoot, { "INPUT_FAIL-ON-SEVERITY": "high" });
  assert.equal(cleanRun.code, 0);
  assert.match(cleanRun.outputs, /finding-count=0/);
  assert.match(cleanRun.stdout, /Evergreen found 0 new lifecycle findings\./);
});

test("the GitHub Action rejects an invalid severity gate", async () => {
  const root = await fixtureRepository();
  await assert.rejects(
    runGitHubAction({
      root,
      reportPath: join(root, "report.json"),
      failOnSeverity: "urgent" as never,
    }),
    /Invalid severity gate: urgent/,
  );
});

test("action metadata packages the scan and report upload as a reusable action", async () => {
  const metadata = parseYaml(await readFile(resolve("action.yml"), "utf8")) as {
    runs?: { using?: string; steps?: Array<{ run?: string; uses?: string; if?: string }> };
  };
  assert.equal(metadata.runs?.using, "composite");
  assert.ok(metadata.runs?.steps?.some((step) => step.run?.includes("dist/action/index.js")));
  assert.ok(
    metadata.runs?.steps?.some(
      (step) =>
        step.uses === "actions/upload-artifact@v7" &&
        step.if === "always() && inputs.upload-report == 'true'",
    ),
  );
});

test("the GitHub Action writes SARIF only when asked, and it matches the report", async () => {
  const root = await fixtureRepository();
  const reportPath = join(root, "reports", "evergreen.json");

  const without = await runGitHubAction({ root, reportPath, failOnSeverity: "none" });
  assert.equal(without.sarifPath, undefined);

  const sarifPath = join(root, "reports", "evergreen.sarif");
  const outcome = await runGitHubAction({ root, reportPath, sarifPath, failOnSeverity: "none" });
  assert.equal(outcome.sarifPath, sarifPath);
  const sarif = JSON.parse(await readFile(sarifPath, "utf8")) as {
    version: string;
    runs: Array<{ results: Array<{ ruleId: string; locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }> }> }>;
  };
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings: Array<{ ruleId: string; location: { path: string } }> };
  assert.equal(sarif.version, "2.1.0");
  assert.deepEqual(
    sarif.runs[0]!.results.map((result) => [result.ruleId, result.locations[0]!.physicalLocation.artifactLocation.uri]).sort(),
    report.findings.map((finding) => [finding.ruleId, finding.location.path]).sort(),
  );
});

test("action metadata declares the optional SARIF upload to code scanning", async () => {
  const metadata = parseYaml(await readFile(resolve("action.yml"), "utf8")) as {
    inputs?: Record<string, { default?: string }>;
    outputs?: Record<string, unknown>;
    runs?: { steps?: Array<{ uses?: string; if?: string; with?: Record<string, string> }> };
  };
  assert.equal(metadata.inputs?.["upload-sarif"]?.default, "false");
  assert.ok(metadata.outputs?.["sarif-path"]);
  const upload = metadata.runs?.steps?.find((step) => step.uses?.startsWith("github/codeql-action/upload-sarif@"));
  assert.ok(upload, "an upload-sarif step exists");
  assert.match(upload.if ?? "", /inputs\.upload-sarif == 'true'/);
  assert.match(upload.if ?? "", /steps\.scan\.outputs\.sarif-path != ''/);
  assert.equal(upload.with?.sarif_file, "${{ steps.scan.outputs.sarif-path }}");
});

const finding = (id: string, severity: Finding["severity"], title: string, path: string, line?: number): Finding => ({
  id,
  ruleId: id.split(":")[0]!,
  detector: "npm",
  title,
  summary: "s",
  severity,
  confidence: "exact",
  location: line === undefined ? { path } : { path, line },
  sources: [{ title: "Vendor | notice", url: "https://example.com/notice" }],
});

const data = { source: "bundled" as const, version: "0.2.0", createdAt: null, reviewedThrough: "2026-10-17", ageDays: 3, stale: false };

test("the job summary snapshot: severity counts, top findings with evidence, data age, and attribution", async () => {
  const { renderSummary } = await import("../src/github-action.js");
  const findings = [
    finding("a.low:p:1", "low", "Low one", "a/package.json", 3),
    finding("b.high:p:2", "high", "High | one", "package.json", 7),
    finding("c.high:p:3", "high", "High two", ".nvmrc"),
    finding("d.critical:p:4", "critical", "Critical one", "Dockerfile", 2),
  ];
  assert.equal(
    renderSummary(findings, true, "high", data, true),
    [
      "## Evergreen",
      "",
      "Found **4** new lifecycle findings; failed the **high** severity gate.",
      "",
      "| Severity | Findings |",
      "|---|---|",
      "| critical | 1 |",
      "| high | 2 |",
      "| low | 1 |",
      "",
      "| Severity | Finding | Location | Evidence |",
      "|---|---|---|---|",
      "| critical | Critical one | `Dockerfile:2` | [Vendor \\| notice](https://example.com/notice) |",
      "| high | High \\| one | `package.json:7` | [Vendor \\| notice](https://example.com/notice) |",
      "| high | High two | `.nvmrc` | [Vendor \\| notice](https://example.com/notice) |",
      "| low | Low one | `a/package.json:3` | [Vendor \\| notice](https://example.com/notice) |",
      "",
      "Data: bundled 0.2.0, evidence reviewed through 2026-10-17 (3 days ago)",
      "",
      "<sub>Scanned by [Evergreen](https://github.com/arminazimi/evergreen)</sub>",
      "",
    ].join("\n"),
  );
});

test("the summary lists at most ten findings, says how many more there are, and warns about stale data", async () => {
  const { renderSummary } = await import("../src/github-action.js");
  const many = Array.from({ length: 13 }, (_, index) => finding(`r${String(index).padStart(2, "0")}:p:1`, "medium", `Finding ${index}`, "package.json", index + 1));
  const text = renderSummary(many, false, "high", { ...data, stale: true, ageDays: 40 }, false);
  assert.equal(text.split("\n").filter((line) => line.startsWith("| medium | Finding")).length, 10);
  assert.match(text, /…and 3 more; the JSON report artifact lists every finding\./);
  assert.match(text, /\| medium \| 13 \|/);
  assert.match(text, /> \*\*Warning:\*\* the lifecycle data is stale/);
  assert.equal(text.includes("Scanned by"), false, "attribution off");
});

test("with no findings the summary has no tables, and the attribution line can be switched off", async () => {
  const { ATTRIBUTION_LINE, renderSummary } = await import("../src/github-action.js");
  assert.equal(renderSummary([], false, "high", undefined, true), `## Evergreen\n\nFound **0** new lifecycle findings; passed the severity gate.\n\n${ATTRIBUTION_LINE}\n`);
  assert.equal(renderSummary([], false, "high", undefined, false), "## Evergreen\n\nFound **0** new lifecycle findings; passed the severity gate.\n");
  assert.match(ATTRIBUTION_LINE, /\[Evergreen\]\(https:\/\/github\.com\/arminazimi\/evergreen\)/);
});

test("action.yml declares the attribution input, on by default, and passes it to the scan step", async () => {
  const { readFile } = await import("node:fs/promises");
  const { parse } = await import("yaml");
  const action = parse(await readFile("action.yml", "utf8")) as { inputs: Record<string, { default?: string }>; runs: { steps: Array<{ env?: Record<string, string> }> } };
  assert.equal(action.inputs.attribution?.default, "true");
  assert.equal(action.runs.steps[0]?.env?.INPUT_ATTRIBUTION, "${{ inputs.attribution }}");
});

test("the Action runner warns about suppressions that expire soon, for the day it is given", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-action-expiry-"));
  try {
    const smoke = resolve("tests/fixtures/smoke");
    const scan = await scanRepository(smoke, builtInDetectors);
    const baseline = join(directory, "baseline.json");
    await writeBaseline(baseline, createBaseline(scan, { owner: "platform", expires: "2026-11-05" }));
    const options = { root: smoke, reportPath: join(directory, "report.json"), baselinePath: baseline };
    const lines = async (extra: object) => (await runGitHubAction({ ...options, ...extra })).result.diagnostics.filter((line) => line.startsWith("Baseline suppression expires"));
    assert.equal((await lines({ today: "2026-10-25" })).length, 4);
    assert.equal((await lines({ today: "2026-10-01" })).length, 0);
    assert.equal((await lines({ today: "2026-10-01", baselineWarnDays: 60 })).length, 4);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("action.yml declares baseline-warn-days with a 14-day default and passes it to the scan step", async () => {
  const action = parseYaml(await readFile("action.yml", "utf8")) as { inputs: Record<string, { default?: string }>; runs: { steps: Array<{ env?: Record<string, string> }> } };
  assert.equal(action.inputs["baseline-warn-days"]?.default, "14");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_BASELINE-WARN-DAYS"], "${{ inputs.baseline-warn-days }}");
});

test("the Action runner brings back an expired suppression and fails the job only under the fail policy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-action-policy-"));
  try {
    const smoke = resolve("tests/fixtures/smoke");
    const scan = await scanRepository(smoke, builtInDetectors);
    const baseline = join(directory, "baseline.json");
    await writeBaseline(baseline, createBaseline(scan, { expires: "2026-10-01" }));
    const options = { root: smoke, reportPath: join(directory, "report.json"), baselinePath: baseline, today: "2026-10-17", failOnSeverity: "none" as const };
    const resurface = await runGitHubAction(options);
    assert.equal(resurface.result.findings.length, scan.findings.length);
    assert.equal(resurface.failed, false, "resurface does not fail a job whose gate is none");
    assert.equal(resurface.expiredFailure, false);
    const strict = await runGitHubAction({ ...options, onExpired: "fail" });
    assert.equal(strict.failed, true);
    assert.equal(strict.gateFailed, false, "the severity gate was not the reason");
    assert.equal(strict.expiredFailure, true);
    assert.equal(
      renderFailure(strict),
      `Evergreen failed: 4 baseline suppressions expired while on-expired is fail. JSON report: ${options.reportPath}. Next steps: review the annotations and JSON report, then fix the findings or update the baseline and rerun Evergreen.`,
    );
    const early = await runGitHubAction({ ...options, onExpired: "fail", today: "2026-09-01" });
    assert.equal(early.failed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("action.yml declares on-expired, defaulting to resurface, and passes it to the scan step", async () => {
  const action = parseYaml(await readFile("action.yml", "utf8")) as { inputs: Record<string, { default?: string }>; runs: { steps: Array<{ env?: Record<string, string> }> } };
  assert.equal(action.inputs["on-expired"]?.default, "resurface");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_ON-EXPIRED"], "${{ inputs.on-expired }}");
});

test("the job summary shows the baseline counts and the suppressions that are expiring or expired", async () => {
  const { renderSummary } = await import("../src/github-action.js");
  const text = renderSummary([], false, "high", undefined, false, {
    suppressed: 5,
    today: "2026-10-17",
    warnWithinDays: 14,
    expiring: [{ ruleId: "nodejs.runtime.eol-18", path: "package.json", expires: "2026-10-20", daysLeft: 3, owner: "platform" }],
    expired: [{ ruleId: "npm.package.request.deprecated", path: "a/package.json", expires: "2026-10-10", daysAgo: 7 }],
  });
  assert.match(text, /Baseline: 5 findings suppressed, 1 expiring within 14 days, 1 expired\./);
  assert.match(text, /\| npm\.package\.request\.deprecated \| `a\/package\.json` \| expired 7 days ago \(2026-10-10\) \| — \|/);
  assert.match(text, /\| nodejs\.runtime\.eol-18 \| `package\.json` \| expires in 3 days \(2026-10-20\) \| platform \|/);
  assert.equal(renderSummary([], false, "high", undefined, false).includes("Baseline:"), false, "no baseline, no line");
});


test("badge endpoints count remaining findings, warn about stale data, and honor expiry failures", () => {
  for (const [severity, color] of [["critical", "#B84A3E"], ["high", "#B84A3E"], ["medium", "#C9822F"], ["low", "#B89B3C"], ["info", "#4C7C6D"]] as const) {
    const findings = [finding("a:p:1", "info", "Info", "secret.json"), finding("b:p:1", severity, "Title", "private.json")];
    assert.deepEqual(JSON.parse(renderBadge({ findings })), {
      schemaVersion: 1, label: "evergreen", message: `2 ${severity}`, color, labelColor: "#23423A",
    });
  }
  assert.deepEqual(JSON.parse(renderBadge({ findings: [] })), {
    schemaVersion: 1, label: "evergreen", message: "clean", color: "#2F7D5B", labelColor: "#23423A",
  });
  assert.deepEqual(JSON.parse(renderBadge({ findings: [], data: { ...data, stale: true } })), {
    schemaVersion: 1, label: "evergreen", message: "stale", color: "#4C7C6D", labelColor: "#23423A",
  });
  assert.equal(JSON.parse(renderBadge({ findings: [finding("r:p:1", "low", "Low", "package.json")], data: { ...data, stale: true } })).message, "1 low · stale");
  assert.deepEqual(JSON.parse(renderBadge({ findings: [finding("r:p:1", "low", "Low", "package.json")] }, true)), {
    schemaVersion: 1, label: "evergreen", message: "1 low · expired", color: "#8E3B34", labelColor: "#23423A",
  });
  assert.equal(JSON.parse(renderBadge({ findings: [] }, true)).message, "expired");
});

test("the SVG badge carries the same message and color, with a fixed-width layout", () => {
  const svg = renderBadgeSvg({ findings: [finding("r:p:1", "high", "High", "package.json")] });
  assert.match(svg, /^<svg [^>]*role="img" aria-label="evergreen: 1 high"/);
  assert.match(svg, /<title>evergreen: 1 high<\/title>/);
  assert.match(svg, /fill="#B84A3E"/);
  assert.match(svg, /textLength="52"[^>]*>evergreen<\/text>/);
  assert.match(renderBadgeSvg({ findings: [] }), /fill="#2F7D5B"[^>]*\/>/);
  assert.equal(renderBadgeSvg({ findings: [] }).includes("package.json"), false, "no paths or titles leak into the badge");
});

test("the badge is opt-in and is generated after baseline comparison even when the gate fails", async () => {
  const root = await fixtureRepository();
  const run = await runActionFixture(root);
  assert.equal(run.outputs.includes("badge-path="), false);
  await assert.rejects(readFile(join(root, ".runner", "evergreen-badge.json")), { code: "ENOENT" });
  const enabled = await runActionFixture(root, { "INPUT_UPLOAD-BADGE": "true", "INPUT_FAIL-ON-SEVERITY": "medium" });
  assert.equal(enabled.code, 1);
  const badgePath = join(root, ".runner", "evergreen-badge.json");
  assert.ok(enabled.outputs.includes(`badge-path=${badgePath}`));
  assert.match(JSON.parse(await readFile(badgePath, "utf8")).message, /^1 medium/);
  const svgPath = join(root, ".runner", "evergreen-badge.svg");
  assert.ok(enabled.outputs.includes(`badge-svg-path=${svgPath}`));
  assert.match(await readFile(svgPath, "utf8"), /aria-label="evergreen: 1 medium"/);
  const baselinePath = join(root, "baseline.json");
  await writeBaseline(baselinePath, createBaseline(await scanRepository(root, builtInDetectors)));
  const outcome = await runGitHubAction({ root, reportPath: join(root, "report.json"), baselinePath, badgePath });
  assert.equal(outcome.badgePath, badgePath);
  assert.match(JSON.parse(await readFile(badgePath, "utf8")).message, /^clean$/);
});

test("badge upload is opt-in and skips scans that produced no endpoint", async () => {
  const action = parseYaml(await readFile("action.yml", "utf8")) as {
    inputs: Record<string, { default?: string }>;
    outputs: Record<string, { value: string }>;
    runs: { steps: Array<{ env?: Record<string, string>; name?: string; if?: string; uses?: string; with?: Record<string, unknown> }> };
  };
  assert.equal(action.inputs["upload-badge"]?.default, "false");
  assert.equal(action.outputs["badge-path"]?.value, "${{ steps.scan.outputs.badge-path }}");
  assert.equal(action.runs.steps[0]?.env?.["INPUT_UPLOAD-BADGE"], "${{ inputs.upload-badge }}");
  const upload = action.runs.steps.find((step) => step.name === "Upload README badge endpoint");
  assert.equal(upload?.if, "always() && inputs.upload-badge == 'true' && steps.scan.outputs.badge-path != ''");
  assert.equal(upload?.uses, "actions/upload-artifact@v7");
  assert.equal(upload?.with?.path, "${{ steps.scan.outputs.badge-path }}\n${{ steps.scan.outputs.badge-svg-path }}\n");
  assert.equal(action.outputs["badge-svg-path"]?.value, "${{ steps.scan.outputs.badge-svg-path }}");
});
