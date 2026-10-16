#!/usr/bin/env node

import { appendFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";

import { runGitHubAction } from "./github-action.js";
import type { GitHubAnnotation, SeverityGate } from "./github-action.js";

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

async function writeSummary(findings: number, failed: boolean, gate: SeverityGate): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const status = failed ? `failed the **${gate}** severity gate` : "passed the severity gate";
  await appendFile(
    summary,
    `## Evergreen\n\nFound **${findings}** new lifecycle finding${findings === 1 ? "" : "s"}; ${status}.\n`,
    "utf8",
  );
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
    const outcome = await runGitHubAction({
      root,
      reportPath,
      ...(sarifPath ? { sarifPath } : {}),
      ...(process.env.INPUT_BASELINE ? { baselinePath: process.env.INPUT_BASELINE } : {}),
      failOnSeverity: (process.env["INPUT_FAIL-ON-SEVERITY"] || "high") as SeverityGate,
    });

    for (const annotation of outcome.annotations) console.log(annotationCommand(annotation));
    await setOutput("report-path", outcome.reportPath);
    if (outcome.sarifPath) await setOutput("sarif-path", outcome.sarifPath);
    await setOutput("finding-count", String(outcome.result.findings.length));
    await writeSummary(outcome.result.findings.length, outcome.failed, outcome.gate);
    console.log(
      `Evergreen found ${outcome.result.findings.length} new lifecycle finding${outcome.result.findings.length === 1 ? "" : "s"}.`,
    );
    if (outcome.failed) {
      console.log(`::error title=Evergreen severity gate failed::A finding met the ${outcome.gate} threshold.`);
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::error title=Evergreen failed::${commandValue(message)}`);
    process.exitCode = 1;
  }
}

void main();
