#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";

import type { DataInfo, Finding, SuppressionState } from "./domain.js";
import { renderComment, renderFailure, renderSummary, runGitHubAction } from "./github-action.js";
import { upsertPullRequestComment } from "./pr-comment.js";
import type { GitHubAnnotation, SeverityGate } from "./github-action.js";
import type { ExpiredPolicy } from "./baseline.js";

function commandValue(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

function commandProperty(value: string): string {
  return commandValue(value).replaceAll(":", "%3A").replaceAll(",", "%2C");
}

function annotationCommand(annotation: GitHubAnnotation): string {
  const properties = [
    `file=${commandProperty(annotation.location.path)}`,
    annotation.location.line ? `line=${annotation.location.line}` : undefined,
    annotation.location.column ? `col=${annotation.location.column}` : undefined,
    `title=${commandProperty(annotation.title)}`,
  ].filter((value): value is string => value !== undefined);
  return `::${annotation.level} ${properties.join(",")}::${commandValue(annotation.message)}`;
}

async function setOutput(name: string, value: string): Promise<void> {
  const output = process.env.GITHUB_OUTPUT;
  if (output) await appendFile(output, `${name}=${value}\n`, "utf8");
}

async function writeSummary(findings: readonly Finding[], failed: boolean, gate: SeverityGate, data?: DataInfo, expiredFailure = false, suppressions?: SuppressionState): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  // On by default; `attribution: "false"` turns the line off.
  const attribution = process.env.INPUT_ATTRIBUTION !== "false";
  const note = expiredFailure ? "\n> **Failed:** a baseline suppression has expired and `on-expired` is set to `fail`.\n" : "";
  await appendFile(summary, `${renderSummary(findings, failed, gate, data, attribution, suppressions)}${note}`, "utf8");
}

/** Posts or updates the one summary comment. A comment that cannot be posted (a fork's read-only token) warns; it never fails the scan. */
async function postComment(outcome: Awaited<ReturnType<typeof runGitHubAction>>): Promise<void> {
  if (process.env["INPUT_PR-COMMENT"] !== "true") return;
  try {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const event = eventPath ? (JSON.parse(await readFile(eventPath, "utf8")) as { pull_request?: { number?: number } }) : {};
    const pullRequest = event.pull_request?.number;
    const token = process.env["INPUT_GITHUB-TOKEN"];
    const repository = process.env.GITHUB_REPOSITORY;
    if (!pullRequest || !token || !repository) {
      console.log("::notice title=Evergreen pull request comment skipped::pr-comment needs a pull_request event, a token, and GITHUB_REPOSITORY.");
      return;
    }
    const { result, gateFailed, gate, expiredFailure } = outcome;
    const body = renderComment(result.findings, gateFailed, gate, result.data, process.env.INPUT_ATTRIBUTION !== "false", result.suppressions);
    const note = expiredFailure ? "\n> **Failed:** a baseline suppression has expired and `on-expired` is set to `fail`.\n" : "";
    const done = await upsertPullRequestComment({ apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com", repository, pullRequest, token }, `${body}${note}`);
    console.log(`Evergreen ${done} its pull request comment.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Evergreen could not post the pull request comment::${commandValue(message)}`);
  }
}

async function main(): Promise<void> {
  try {
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const root = process.env.INPUT_PATH || workspace;
    const reportPath = resolve(
      process.env.RUNNER_TEMP ?? workspace,
      "evergreen-report.json",
    );
    const sarifPath = process.env["INPUT_UPLOAD-SARIF"] === "true"
      ? resolve(process.env.RUNNER_TEMP ?? workspace, "evergreen-results.sarif")
      : undefined;
    const badgePath = process.env["INPUT_UPLOAD-BADGE"] === "true"
      ? resolve(process.env.RUNNER_TEMP ?? workspace, "evergreen-badge.json")
      : undefined;
    const outcome = await runGitHubAction({
      root,
      reportPath,
      ...(sarifPath ? { sarifPath } : {}),
      ...(badgePath ? { badgePath } : {}),
      ...(process.env.INPUT_BASELINE ? { baselinePath: process.env.INPUT_BASELINE } : {}),
      ...(process.env["INPUT_BASELINE-WARN-DAYS"] ? { baselineWarnDays: Number(process.env["INPUT_BASELINE-WARN-DAYS"]) } : {}),
      ...(process.env["INPUT_ON-EXPIRED"] ? { onExpired: process.env["INPUT_ON-EXPIRED"] as ExpiredPolicy } : {}),
      ...(process.env["INPUT_MIN-SUPPORT-DAYS"] ? { minSupportDays: Number(process.env["INPUT_MIN-SUPPORT-DAYS"]) } : {}),
      failOnSeverity: (process.env["INPUT_FAIL-ON-SEVERITY"] || "high") as SeverityGate,
    });

    for (const annotation of outcome.annotations) console.log(annotationCommand(annotation));
    // A suppression about to expire is a warning on the run, not a finding.
    for (const diagnostic of outcome.result.diagnostics) {
      if (diagnostic.startsWith("Baseline suppression expired")) console.log(`::warning title=Evergreen baseline suppression expired::${commandValue(diagnostic)}`);
      if (diagnostic.startsWith("Baseline suppression expires")) console.log(`::warning title=Evergreen baseline suppression expires soon::${commandValue(diagnostic)}`);
    }
    await setOutput("report-path", outcome.reportPath);
    if (outcome.sarifPath) await setOutput("sarif-path", outcome.sarifPath);
    if (outcome.badgePath) await setOutput("badge-path", outcome.badgePath);
    if (outcome.badgeSvgPath) await setOutput("badge-svg-path", outcome.badgeSvgPath);
    await setOutput("finding-count", String(outcome.result.findings.length));
    await writeSummary(outcome.result.findings, outcome.gateFailed, outcome.gate, outcome.result.data, outcome.expiredFailure, outcome.result.suppressions);
    await postComment(outcome);
    if (outcome.result.data?.stale) console.log(`::warning title=Evergreen lifecycle data is stale::The data is ${outcome.result.data.ageDays} days old, so findings may miss recent changes.`);
    console.log(
      `Evergreen found ${outcome.result.findings.length} new lifecycle finding${outcome.result.findings.length === 1 ? "" : "s"}.`,
    );
    const failure = renderFailure(outcome);
    if (failure) {
      console.log(`::error title=Evergreen policy gate failed::${commandValue(failure)}`);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::error title=Evergreen failed::${commandValue(message)}`);
    process.exitCode = 1;
  }
}

void main();
