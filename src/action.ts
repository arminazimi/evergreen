#!/usr/bin/env node

import { appendFile, readFile, stat } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";

import type { DataInfo, Finding, SuppressionState } from "./domain.js";
import { runCommentCommands } from "./action-commands.js";
import { parsePathsInput, renderComment, renderFailure, renderSummary, resolveScanPaths, runGitHubAction } from "./github-action.js";
import { upsertPullRequestComment } from "./pr-comment.js";
import type { GitHubActionOutcome, GitHubAnnotation, SeverityGate, UnannotatedFindings } from "./github-action.js";
import { createBaseline } from "./baseline.js";
import type { Baseline, ExpiredPolicy } from "./baseline.js";

/** The branch the onboarding app opens its pull request from. */
const ONBOARDING_BRANCH = "evergreen/onboarding";

function onOnboardingBranch(env: Record<string, string | undefined>): boolean {
  return env.GITHUB_HEAD_REF === ONBOARDING_BRANCH
    || env.GITHUB_REF_NAME === ONBOARDING_BRANCH
    || env.GITHUB_REF === `refs/heads/${ONBOARDING_BRANCH}`;
}

interface OnboardingEvent {
  pull_request?: { head?: { repo?: { full_name?: string } } };
}

/**
 * True for the onboarding pull request this repository opens itself. A fork that names its branch
 * `evergreen/onboarding` is an ordinary pull request and must still meet the severity gate.
 */
async function isOnboardingRun(env: Record<string, string | undefined>): Promise<boolean> {
  if (!onOnboardingBranch(env)) return false;
  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) return true;
  let event: OnboardingEvent;
  try {
    event = JSON.parse(await readFile(eventPath, "utf8")) as OnboardingEvent;
  } catch {
    return false;
  }
  const headRepository = event.pull_request?.head?.repo?.full_name;
  return headRepository === undefined || headRepository === env.GITHUB_REPOSITORY;
}

/** The generated baseline as a suggested file the onboarding pull request can add. */
function renderBaselineProposal(path: string, baseline: Baseline): string {
  const count = baseline.findings.length;
  return [
    `### Suggested file: \`${path}\``,
    "",
    `\`${path}\` does not exist yet, so this first run on \`${ONBOARDING_BRANCH}\` recorded today's ${count} finding${count === 1 ? "" : "s"} in this baseline. Add the file to this branch; later runs suppress these findings and report only new ones. Evergreen never writes to your repository.`,
    "",
    "```json",
    JSON.stringify(baseline, null, 2),
    "```",
    "",
  ].join("\n");
}

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

async function writeSummary(findings: readonly Finding[], failed: boolean, gate: SeverityGate, data?: DataInfo, expiredFailure = false, suppressions?: SuppressionState, diff?: GitHubActionOutcome["diff"], packages?: GitHubActionOutcome["packages"], unannotated?: UnannotatedFindings, proposal?: { path: string; count: number }): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  // On by default; `attribution: "false"` turns the line off.
  const attribution = process.env.INPUT_ATTRIBUTION !== "false";
  const note = expiredFailure ? "\n> **Failed:** a baseline suppression has expired and `on-expired` is set to `fail`.\n" : "";
  const proposalNote = proposal
    ? `\n> **Suggested baseline:** \`${proposal.path}\` does not exist yet, so this first run recorded its ${proposal.count} finding${proposal.count === 1 ? "" : "s"} in a baseline proposal on the pull request comment.\n`
    : "";
  await appendFile(summary, `${renderSummary(findings, failed, gate, data, attribution, suppressions, diff, packages, unannotated)}${note}${proposalNote}`, "utf8");
}

/** The run page lists the uploaded report artifact, so it is the link the summary uses for the full report. */
function reportUrl(): string | undefined {
  const server = process.env.GITHUB_SERVER_URL;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  return server && repository && runId ? `${server}/${repository}/actions/runs/${runId}` : undefined;
}

interface PullRequestEvent {
  pull_request?: { base?: { sha?: string }; head?: { sha?: string } };
}

/** Reads the event payload's pull request base and head. Falls back to a scan when they are absent. */
async function resolveDiffMode(eventPath?: string): Promise<{ mode?: "diff"; diffRange?: string } | undefined> {
  const event = eventPath ? (JSON.parse(await readFile(eventPath, "utf8")) as PullRequestEvent) : {};
  const base = event.pull_request?.base?.sha;
  const head = event.pull_request?.head?.sha;
  if (!base || !head) {
    console.log("::notice title=Evergreen diff mode skipped::mode: diff needs a pull_request event with base and head SHAs; scanning the checkout instead.");
    return undefined;
  }
  return { mode: "diff", diffRange: `${base}..${head}` };
}

/** Posts or updates the one summary comment. A comment that cannot be posted (a fork's read-only token) warns; it never fails the scan. */
async function postComment(outcome: Awaited<ReturnType<typeof runGitHubAction>>, unannotated?: UnannotatedFindings, proposal?: { path: string; baseline: Baseline }): Promise<void> {
  // The onboarding baseline proposal is the one comment posted without `pr-comment`: it is the only
  // way the first run can record today's findings, and the run itself never pushes.
  if (process.env["INPUT_PR-COMMENT"] !== "true" && !proposal) return;
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
    const { result, gateFailed, gate, expiredFailure, diff, packages } = outcome;
    const body = renderComment(result.findings, gateFailed, gate, result.data, process.env.INPUT_ATTRIBUTION !== "false", result.suppressions, diff, packages, unannotated);
    const note = expiredFailure ? "\n> **Failed:** a baseline suppression has expired and `on-expired` is set to `fail`.\n" : "";
    const proposalNote = proposal ? `\n${renderBaselineProposal(proposal.path, proposal.baseline)}` : "";
    const done = await upsertPullRequestComment({ apiUrl: process.env.GITHUB_API_URL ?? "https://api.github.com", repository, pullRequest, token }, `${body}${note}${proposalNote}`);
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
    // A comment command is answered instead of scanned: there is no pull request checkout to gate here.
    if (process.env.INPUT_COMMANDS === "true" && process.env.GITHUB_EVENT_NAME === "issue_comment") {
      await runCommentCommands({
        root,
        ...(process.env.GITHUB_EVENT_PATH ? { eventPath: process.env.GITHUB_EVENT_PATH } : {}),
        ...(process.env.INPUT_BASELINE ? { baselinePath: process.env.INPUT_BASELINE } : {}),
        ...(process.env["INPUT_GITHUB-TOKEN"] ? { token: process.env["INPUT_GITHUB-TOKEN"] } : {}),
        ...(process.env.GITHUB_REPOSITORY ? { repository: process.env.GITHUB_REPOSITORY } : {}),
        ...(process.env.GITHUB_API_URL ? { apiUrl: process.env.GITHUB_API_URL } : {}),
      });
      return;
    }
    const inputMode = process.env.INPUT_MODE || "scan";
    if (inputMode !== "scan" && inputMode !== "diff") throw new Error(`Invalid mode: ${inputMode}. Use "scan" or "diff".`);
    const inputAnnotations = process.env.INPUT_ANNOTATIONS || undefined;
    if (inputAnnotations !== undefined && inputAnnotations !== "changed" && inputAnnotations !== "all" && inputAnnotations !== "none") {
      throw new Error(`Invalid annotations: ${inputAnnotations}. Use "changed", "all", or "none".`);
    }
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
    const diff = inputMode === "diff" ? await resolveDiffMode(process.env.GITHUB_EVENT_PATH) : undefined;
    if (diff && process.env.INPUT_BASELINE) console.log(`::notice title=Evergreen baseline ignored in diff mode::mode: diff judges only what the pull request introduces, so the baseline ${process.env.INPUT_BASELINE} is not applied.`);
    if (inputAnnotations === "changed" && !diff) console.log("::notice title=Evergreen annotations: changed needs diff mode::annotations: changed annotates only lines a pull request changed, and this run has no pull request range; annotating every finding.");
    // The onboarding pull request starts without a baseline, so its first run records today's findings
    // as a suggested file instead of failing on them. Evergreen never writes the file or pushes.
    const proposeBaselinePath = (diff ? undefined : process.env.INPUT_BASELINE) || undefined;
    const proposeBaseline = proposeBaselinePath !== undefined
      && await isOnboardingRun(process.env)
      && (await stat(resolve(workspace, root, proposeBaselinePath)).catch(() => undefined)) === undefined;
    if (proposeBaseline && proposeBaselinePath) {
      console.log(`::notice title=Evergreen proposed a baseline::${proposeBaselinePath} does not exist yet, so this first run on ${ONBOARDING_BRANCH} proposes it in the pull request comment and does not enforce the severity gate.`);
    }
    const outcome = await runGitHubAction({
      root: scanPaths ? resolve(workspace, root) : root,
      reportPath,
      ...(scanPaths ? { paths: scanPaths } : {}),
      ...(sarifPath ? { sarifPath } : {}),
      ...(badgePath ? { badgePath } : {}),
      ...(diff ? { mode: "diff" as const } : {}),
      ...(diff?.diffRange ? { diffRange: diff.diffRange } : {}),
      ...(process.env.INPUT_BASELINE && !proposeBaseline ? { baselinePath: process.env.INPUT_BASELINE } : {}),
      ...(process.env["INPUT_BASELINE-WARN-DAYS"] ? { baselineWarnDays: Number(process.env["INPUT_BASELINE-WARN-DAYS"]) } : {}),
      ...(process.env["INPUT_ON-EXPIRED"] ? { onExpired: process.env["INPUT_ON-EXPIRED"] as ExpiredPolicy } : {}),
      ...(process.env["INPUT_MIN-SUPPORT-DAYS"] ? { minSupportDays: Number(process.env["INPUT_MIN-SUPPORT-DAYS"]) } : {}),
      ...(inputAnnotations ? { annotations: inputAnnotations } : {}),
      failOnSeverity: (proposeBaseline ? "none" : process.env["INPUT_FAIL-ON-SEVERITY"] || "high") as SeverityGate,
    });
    const proposedBaseline = proposeBaseline
      ? createBaseline(outcome.result, {}, { schemaVersion: "evergreen.baseline.v1", createdAt: "", findings: [] })
      : undefined;

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
    const proposal = proposedBaseline && proposeBaselinePath
      ? { path: proposeBaselinePath, count: proposedBaseline.findings.length }
      : undefined;
    await writeSummary(outcome.result.findings, outcome.gateFailed, outcome.gate, outcome.result.data, outcome.expiredFailure, outcome.result.suppressions, outcome.diff, outcome.packages, unannotated, proposal);
    await postComment(outcome, unannotated, proposedBaseline && proposeBaselinePath ? { path: proposeBaselinePath, baseline: proposedBaseline } : undefined);
    if (outcome.result.data?.stale) console.log(`::warning title=Evergreen lifecycle data is stale::The data is ${outcome.result.data.ageDays} days old, so findings may miss recent changes.`);
    console.log(
      proposedBaseline && proposeBaselinePath
        ? `Evergreen proposed a baseline of ${proposedBaseline.findings.length} finding${proposedBaseline.findings.length === 1 ? "" : "s"} for ${proposeBaselinePath} in the pull request comment.`
        : diff
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
