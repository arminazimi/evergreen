#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";

import type { DataInfo, Finding, SuppressionState } from "./domain.js";
import { parsePathsInput, renderComment, renderFailure, renderSummary, renderSuggestionReview, resolveScanPaths, runGitHubAction, suggestionComment } from "./github-action.js";
import { upsertFixSuggestionsReview, upsertPullRequestComment } from "./pr-comment.js";
import type { GitHubActionOutcome, GitHubAnnotation, SeverityGate, UnannotatedFindings } from "./github-action.js";
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

async function writeSummary(findings: readonly Finding[], failed: boolean, gate: SeverityGate, data?: DataInfo, expiredFailure = false, suppressions?: SuppressionState, diff?: GitHubActionOutcome["diff"], packages?: GitHubActionOutcome["packages"], unannotated?: UnannotatedFindings): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  // On by default; `attribution: "false"` turns the line off.
  const attribution = process.env.INPUT_ATTRIBUTION !== "false";
  const note = expiredFailure ? "\n> **Failed:** a baseline suppression has expired and `on-expired` is set to `fail`.\n" : "";
  await appendFile(summary, `${renderSummary(findings, failed, gate, data, attribution, suppressions, diff, packages, unannotated)}${note}`, "utf8");
}

/** The run page lists the uploaded report artifact, so it is the link the summary uses for the full report. */
function reportUrl(): string | undefined {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : undefined;
}

interface RepositoryRef {
  full_name?: string;
  fork?: boolean;
}

interface PullRequestEvent {
  pull_request?: {
    number?: number;
    base?: { sha?: string; repo?: RepositoryRef };
    head?: { sha?: string; repo?: RepositoryRef };
  };
}

async function readEvent(eventPath?: string): Promise<PullRequestEvent> {
  return eventPath ? (JSON.parse(await readFile(eventPath, "utf8")) as PullRequestEvent) : {};
}

/** Reads the event payload's pull request base and head. Falls back to a scan when they are absent. */
function resolveDiffMode(event: PullRequestEvent): { mode?: "diff"; diffRange?: string } | undefined {
  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (!base || !head) {
    console.log("::notice title=Evergreen diff mode skipped::mode: diff needs a pull_request event with base and head SHAs; scanning the checkout instead.");
    return undefined;
  }
  return { mode: "diff", diffRange: `${base}..${head}` };
}

/** A pull request from a fork runs with a read-only token, so no review can be written. */
function isForkPullRequest(event: PullRequestEvent): boolean {
  const head = event.pull_request?.head?.repo;
  const base = event.pull_request?.base?.repo;
  return head?.fork === true || (head?.full_name !== undefined && base?.full_name !== undefined && head.full_name !== base.full_name);
}

/** Posts or updates the one summary comment. A comment that cannot be posted (a fork's read-only token) warns; it never fails the scan. */
async function postComment(outcome: Awaited<ReturnType<typeof runGitHubAction>>, event: PullRequestEvent, unannotated?: UnannotatedFindings): Promise<void> {
  if (process.env["INPUT_PR-COMMENT"] !== "true") return;
  try {
    const pullRequest = event.pull_request?.number;
    const token = process.env["INPUT_GITHUB-TOKEN"];
    const repository = process.env.GITHUB_REPOSITORY;
    if (!pullRequest || !token || !repository) {
      console.log("::notice title=Evergreen pull request comment skipped::pr-comment needs a pull_request event, a token, and GITHUB_REPOSITORY.");
      return;
    }
    const { result, gateFailed, gate, expiredFailure, diff, packages } = outcome;
    const body = renderComment(result.findings, gateFailed, gate, result.data, process.env.INPUT_ATTRIBUTION !== "false", result.suppressions, diff, packages, unannotated);
    const note = expiredFailure ? "\n> **Failed:** a baseline suppression has expired and `on-expired` is set to `fail`.\n" : "";
    const done = await upsertPullRequestComment({ apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com", repository, pullRequest, token }, `${body}${note}`);
    console.log(`Evergreen ${done} its pull request comment.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Evergreen could not post the pull request comment::${commandValue(message)}`);
  }
}

/** Posts or updates the one review of deterministic fix suggestions. A failure warns; it never fails the scan. */
async function postFixSuggestions(outcome: Awaited<ReturnType<typeof runGitHubAction>>, event: PullRequestEvent): Promise<void> {
  if (process.env["INPUT_SUGGEST-FIXES"] !== "true" || outcome.suggestions.length === 0) return;
  // A fork's token is read-only and the runner already said so; there is nothing to post.
  if (isForkPullRequest(event)) return;
  try {
    const pullRequest = event.pull_request?.number;
    const token = process.env["INPUT_GITHUB-TOKEN"];
    const repository = process.env.GITHUB_REPOSITORY;
    if (!pullRequest || !token || !repository) {
      console.log("::notice title=Evergreen fix suggestions skipped::suggest-fixes needs a pull_request event, a token, and GITHUB_REPOSITORY.");
      return;
    }
    const headSha = event.pull_request?.head?.sha;
    const done = await upsertFixSuggestionsReview(
      { apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com", repository, pullRequest, token },
      {
        body: renderSuggestionReview(outcome.suggestions.length),
        ...(headSha === undefined ? {} : { commitId: headSha }),
        comments: outcome.suggestions.map(suggestionComment),
      },
    );
    console.log(`Evergreen ${done} its fix suggestions review.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Evergreen could not post the fix suggestions review::${commandValue(message)}`);
  }
}

async function main(): Promise<void> {
  try {
    const inputMode = process.env.INPUT_MODE || "scan";
    if (inputMode !== "scan" && inputMode !== "diff") throw new Error(`Invalid mode: ${inputMode}. Use "scan" or "diff".`);
    const inputAnnotations = process.env.INPUT_ANNOTATIONS || undefined;
    if (inputAnnotations !== undefined && inputAnnotations !== "changed" && inputAnnotations !== "all" && inputAnnotations !== "none") {
      throw new Error(`Invalid annotations: ${inputAnnotations}. Use "changed", "all", or "none".`);
    }
    const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
    const root = process.env.INPUT_PATH || workspace;
    const pathPatterns = parsePathsInput(process.env.INPUT_PATHS ?? "");
    if (pathPatterns.length > 0 && inputMode === "diff") {
      console.log("::notice title=Evergreen paths ignored in diff mode::mode: diff compares the whole pull request checkout; the paths input applies only to scan mode.");
    }
    const scanPaths = pathPatterns.length > 0 && inputMode !== "diff"
      ? await resolveScanPaths(resolve(workspace, root), pathPatterns)
      : undefined;
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
    const event = await readEvent(process.env.GITHUB_EVENT_PATH);
    const diff = inputMode === "diff" ? resolveDiffMode(event) : undefined;
    const suggestFixes = process.env["INPUT_SUGGEST-FIXES"] === "true";
    const fork = isForkPullRequest(event);
    if (suggestFixes && !diff) console.log("::notice title=Evergreen suggest-fixes skipped::suggest-fixes needs mode: diff and a pull_request event, because suggestions apply only to lines the pull request changed.");
    if (suggestFixes && diff && fork) console.log("::notice title=Evergreen suggest-fixes skipped::Pull requests from forks get a read-only token, so Evergreen cannot post a review with fix suggestions.");
    if (diff && process.env.INPUT_BASELINE) console.log(`::notice title=Evergreen baseline ignored in diff mode::mode: diff judges only what the pull request introduces, so the baseline ${process.env.INPUT_BASELINE} is not applied.`);
    if (inputAnnotations === "changed" && !diff) console.log("::notice title=Evergreen annotations: changed needs diff mode::annotations: changed annotates only lines a pull request changed, and this run has no pull request range; annotating every finding.");
    const outcome = await runGitHubAction({
      root: scanPaths ? resolve(workspace, root) : root,
      reportPath,
      ...(scanPaths ? { paths: scanPaths } : {}),
      ...(sarifPath ? { sarifPath } : {}),
      ...(badgePath ? { badgePath } : {}),
      ...(diff ? { mode: "diff" as const } : {}),
      ...(diff?.diffRange ? { diffRange: diff.diffRange } : {}),
      ...(process.env.INPUT_BASELINE ? { baselinePath: process.env.INPUT_BASELINE } : {}),
      ...(process.env["INPUT_BASELINE-WARN-DAYS"] ? { baselineWarnDays: Number(process.env["INPUT_BASELINE-WARN-DAYS"]) } : {}),
      ...(process.env["INPUT_ON-EXPIRED"] ? { onExpired: process.env["INPUT_ON-EXPIRED"] as ExpiredPolicy } : {}),
      ...(process.env["INPUT_MIN-SUPPORT-DAYS"] ? { minSupportDays: Number(process.env["INPUT_MIN-SUPPORT-DAYS"]) } : {}),
      ...(inputAnnotations ? { annotations: inputAnnotations } : {}),
      ...(suggestFixes && diff && !fork ? { suggestFixes: true } : {}),
      failOnSeverity: (process.env["INPUT_FAIL-ON-SEVERITY"] || "high") as SeverityGate,
    });

    for (const annotation of outcome.annotations) console.log(annotationCommand(annotation));
    // A suppression about to expire is a warning on the run, not a finding.
    for (const diagnostic of outcome.result.diagnostics) {
      if (diagnostic.includes("Baseline suppression expired")) console.log(`::warning title=Evergreen baseline suppression expired::${commandValue(diagnostic)}`);
      if (diagnostic.includes("Baseline suppression expires")) console.log(`::warning title=Evergreen baseline suppression expires soon::${commandValue(diagnostic)}`);
    }
    await setOutput("report-path", outcome.reportPath);
    if (outcome.sarifPath) await setOutput("sarif-path", outcome.sarifPath);
    if (outcome.badgePath) await setOutput("badge-path", outcome.badgePath);
    if (outcome.badgeSvgPath) await setOutput("badge-svg-path", outcome.badgeSvgPath);
    await setOutput("finding-count", String(outcome.result.findings.length));
    const reportLink = reportUrl();
    const unannotated = outcome.unannotated > 0
      ? { count: outcome.unannotated, ...(reportLink ? { reportUrl: reportLink } : {}) }
      : undefined;
    await writeSummary(outcome.result.findings, outcome.gateFailed, outcome.gate, outcome.result.data, outcome.expiredFailure, outcome.result.suppressions, outcome.diff, outcome.packages, unannotated);
    await postComment(outcome, event, unannotated);
    await postFixSuggestions(outcome, event);
    if (outcome.result.data?.stale) console.log(`::warning title=Evergreen lifecycle data is stale::The data is ${outcome.result.data.ageDays} days old, so findings may miss recent changes.`);
    console.log(
      diff
        ? `Evergreen found ${outcome.result.findings.length} introduced lifecycle finding${outcome.result.findings.length === 1 ? "" : "s"} and ${outcome.diff?.fixed.length ?? 0} fixed lifecycle finding${(outcome.diff?.fixed.length ?? 0) === 1 ? "" : "s"} between ${diff.diffRange}.`
        : scanPaths
          ? `Evergreen found ${outcome.result.findings.length} new lifecycle finding${outcome.result.findings.length === 1 ? "" : "s"} across ${scanPaths.length} package${scanPaths.length === 1 ? "" : "s"}.`
          : `Evergreen found ${outcome.result.findings.length} new lifecycle finding${outcome.result.findings.length === 1 ? "" : "s"}.`,
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
