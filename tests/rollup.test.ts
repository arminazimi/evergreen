import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { parse } from "yaml";

import type { Finding, Severity } from "../src/domain.js";
import { RollupError, productOf, renderRollupHtml, repositoryNameFromPath, rollup, rollupFiles } from "../src/rollup.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(ruleId: string, severity: Severity, deadline?: string): Finding {
  return { id: `${ruleId}:${severity}`, ruleId, detector: "d", title: "t", summary: "s", severity, confidence: "exact", location: { path: "package.json" }, sources: [], ...(deadline !== undefined ? { deadline } : {}) };
}

const report = (...findings: Finding[]) => ({ schemaVersion: "evergreen.scan.v1", root: "/x", scannedAt: "2026-01-01T00:00:00Z", findings, diagnostics: [] });

async function files(reports: Record<string, unknown>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-rollup-"));
  roots.push(directory);
  for (const [name, content] of Object.entries(reports)) await writeFile(join(directory, name), JSON.stringify(content));
  return directory;
}

test("productOf takes the rule prefix", () => {
  assert.equal(productOf("nodejs.runtime.eol-18"), "nodejs");
  assert.equal(productOf("standalone"), "standalone");
});

test("rollup groups by product and owner and ignores input order", () => {
  const a = { repository: "api", owner: "platform", report: report(finding("nodejs.runtime.eol-18", "high"), finding("python.runtime.eol-3-8", "medium")) };
  const b = { repository: "web", report: report(finding("nodejs.runtime.eol-18", "high")) };
  const result = rollup([a, b]);
  assert.deepEqual(result, rollup([b, a]));
  assert.equal(result.repositories, 2);
  assert.equal(result.findings, 3);
  assert.deepEqual(result.byProduct.map((group) => [group.name, group.findings, group.repositories]), [["nodejs", 2, ["api", "web"]], ["python", 1, ["api"]]]);
  assert.deepEqual(result.byOwner.map((group) => [group.name, group.findings]), [["platform", 2], ["unowned", 1]]);
  assert.equal(result.severities.high, 2);
  assert.equal(result.byProduct[0]?.severities.high, 2);
});

test("an empty repository counts as a repository with no findings", () => {
  const result = rollup([{ repository: "clean", report: report() }]);
  assert.equal(result.repositories, 1);
  assert.equal(result.findings, 0);
  assert.deepEqual(result.byProduct, []);
});

test("rollupFiles reads reports and owners from files", async () => {
  const directory = await files({ "api.json": report(finding("nodejs.runtime.eol-18", "high")), "owners.json": { api: "platform" } });
  const result = await rollupFiles([join(directory, "api.json")], join(directory, "owners.json"));
  assert.deepEqual(result.byOwner.map((group) => group.name), ["platform"]);
});

test("rollupFiles refuses input that is not a scan report or owners map", async () => {
  const directory = await files({ "bad.json": { schemaVersion: "other" }, "owners.json": ["api"], "ok.json": report() });
  await assert.rejects(rollupFiles([join(directory, "bad.json")]), RollupError);
  await assert.rejects(rollupFiles([join(directory, "ok.json")], join(directory, "owners.json")), RollupError);
  await assert.rejects(rollupFiles([join(directory, "missing.json")]), RollupError);
  await assert.rejects(rollupFiles([]), RollupError);
});

test("the rollup command prints the same JSON for the same files", async () => {
  const directory = await files({ "api.json": report(finding("nodejs.runtime.eol-18", "high")), "web.json": report(finding("nodejs.runtime.eol-18", "low")) });
  const run = async () => (await execute(process.execPath, [cli, "rollup", join(directory, "web.json"), join(directory, "api.json"), "--json"])).stdout;
  const first = await run();
  assert.equal(first, await run());
  assert.equal((JSON.parse(first) as { findings: number }).findings, 2);
});

test("repositoryNameFromPath handles bare files, matrix artifacts, and subdirectories", () => {
  assert.equal(repositoryNameFromPath("api.json"), "api");
  assert.equal(repositoryNameFromPath("/path/to/web.json"), "web");
  assert.equal(repositoryNameFromPath("evergreen-report-payments.json"), "payments");
  assert.equal(repositoryNameFromPath("artifacts/evergreen-report-auth/evergreen-report.json"), "auth");
  assert.equal(repositoryNameFromPath("reports/billing/evergreen-report.json"), "billing");
});

test("renderRollupHtml renders deterministic static HTML with per-repository counts and deadlines", () => {
  const a = { repository: "api", owner: "platform", report: report(finding("nodejs.runtime.eol-18", "high", "2025-04-30"), finding("python.runtime.eol-3-8", "medium", "2024-10-07")) };
  const b = { repository: "web", owner: "frontend", report: report(finding("nodejs.runtime.eol-18", "high", "2025-04-30")) };
  const clean = { repository: "docs", report: report() };

  const result1 = rollup([a, b, clean]);
  const result2 = rollup([clean, b, a]);
  assert.deepEqual(result1, result2);

  assert.equal(result1.byRepository.length, 3);
  const apiRepo = result1.byRepository.find((r) => r.name === "api");
  assert.ok(apiRepo);
  assert.equal(apiRepo.findings, 2);
  assert.equal(apiRepo.nearestDeadline, "2024-10-07");
  assert.deepEqual(apiRepo.deadlines, ["2024-10-07", "2025-04-30"]);

  const docsRepo = result1.byRepository.find((r) => r.name === "docs");
  assert.ok(docsRepo);
  assert.equal(docsRepo.findings, 0);
  assert.equal(docsRepo.nearestDeadline, undefined);

  assert.equal(result1.deadlines.length, 2);
  assert.equal(result1.deadlines[0]?.deadline, "2024-10-07");
  assert.deepEqual(result1.deadlines[0]?.repositories, ["api"]);
  assert.equal(result1.deadlines[1]?.deadline, "2025-04-30");
  assert.deepEqual(result1.deadlines[1]?.repositories, ["api", "web"]);

  const html1 = renderRollupHtml(result1);
  const html2 = renderRollupHtml(result2);
  assert.equal(html1, html2);
  assert.ok(html1.includes("<!doctype html>"));
  assert.ok(html1.includes("Content-Security-Policy"));
  assert.ok(html1.includes("2024-10-07"));
  assert.ok(html1.includes("2025-04-30"));
  assert.ok(html1.includes("<code>api</code>"));
  assert.ok(html1.includes("<code>web</code>"));
  assert.ok(html1.includes("<code>docs</code>"));
  assert.ok(html1.includes('id="evergreen-rollup"'));
});

test("the report renders from the sample organization's artifacts", async () => {
  const directory = await files({
    "evergreen-report-backend.json": report(finding("nodejs.runtime.eol-18", "high", "2025-04-30"), finding("postgres.database.eol-11", "critical", "2023-11-09")),
    "evergreen-report-frontend.json": report(finding("npm.package.request.deprecated", "medium")),
    "evergreen-report-infra.json": report(finding("github-actions.action.node16", "high", "2024-03-31")),
    "evergreen-report-clean.json": report(),
    "owners.json": { backend: "core-team", frontend: "ui-team", infra: "devops" },
  });

  const reportPaths = [
    join(directory, "evergreen-report-backend.json"),
    join(directory, "evergreen-report-frontend.json"),
    join(directory, "evergreen-report-infra.json"),
    join(directory, "evergreen-report-clean.json"),
  ];

  const result = await rollupFiles(reportPaths, join(directory, "owners.json"));
  assert.equal(result.repositories, 4);
  assert.equal(result.findings, 4);
  assert.equal(result.severities.critical, 1);
  assert.equal(result.severities.high, 2);
  assert.equal(result.severities.medium, 1);

  assert.deepEqual(result.byRepository.map((r) => r.name), ["backend", "frontend", "infra", "clean"]);
  assert.equal(result.byRepository[0]?.nearestDeadline, "2023-11-09");
  assert.equal(result.byRepository[2]?.nearestDeadline, "2024-03-31");

  const html = renderRollupHtml(result);
  assert.ok(html.includes("backend"));
  assert.ok(html.includes("core-team"));
  assert.ok(html.includes("2023-11-09"));
  assert.ok(html.includes("clean"));
  assert.ok(html.includes('id="evergreen-rollup"'));

  const parsedJson = JSON.parse(html.split('<script type="application/json" id="evergreen-rollup">')[1]!.split("</script>")[0]!) as typeof result;
  assert.deepEqual(parsedJson.severities, result.severities);
  assert.equal(parsedJson.repositories, 4);
});

test("the rollup command outputs identical HTML across multiple runs with --html", async () => {
  const directory = await files({
    "evergreen-report-api.json": report(finding("nodejs.runtime.eol-18", "high", "2025-04-30")),
    "evergreen-report-web.json": report(finding("npm.package.request.deprecated", "medium")),
    "owners.json": { api: "platform", web: "frontend" },
  });

  const run = async () => (await execute(process.execPath, [cli, "rollup", join(directory, "evergreen-report-api.json"), join(directory, "evergreen-report-web.json"), "--owners", join(directory, "owners.json"), "--html"])).stdout;
  const first = await run();
  assert.equal(first, await run());
  assert.ok(first.includes("<!doctype html>"));
  assert.ok(first.includes("<code>api</code>"));
  assert.ok(first.includes("platform"));
  assert.ok(first.includes("2025-04-30"));
});

test("templates/rollup contains a valid GitHub Pages workflow and owners file", async () => {
  const workflowPath = resolve("templates/rollup/pages.yml");
  const ownersPath = resolve("templates/rollup/owners.json");
  const readmePath = resolve("templates/rollup/README.md");

  const workflowText = await readFile(workflowPath, "utf8");
  const workflow = parse(workflowText) as { name?: string; permissions?: Record<string, string>; jobs?: Record<string, { steps?: Array<{ uses?: string }> }> };
  assert.equal(workflow.name, "Evergreen organization rollup");
  assert.equal(workflow.permissions?.pages, "write");
  assert.equal(workflow.permissions?.["id-token"], "write");
  assert.ok(workflow.jobs?.rollup?.steps && workflow.jobs.rollup.steps.length >= 4);

  const owners = JSON.parse(await readFile(ownersPath, "utf8")) as Record<string, string>;
  assert.equal(typeof owners, "object");
  assert.ok(Object.keys(owners).length > 0);

  const readme = await readFile(readmePath, "utf8");
  assert.ok(readme.includes("GitHub Pages"));
  assert.ok(readme.includes("owners.json"));
});
