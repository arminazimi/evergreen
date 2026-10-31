import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { checkUpgrade, parseUpgradeTarget } from "./index.js";
import type { UpgradeIssue, UpgradeReport } from "./types.js";

const USAGE = "Usage: evergreen upgrade-check --to <runtime@version> [path] [--json]";

const UNKNOWN_VERDICT =
  "Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.";

/** One issue as `path:line  subject  reason  [evidence]`. */
export function renderUpgradeIssue(issue: UpgradeIssue): string {
  const location = issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`;
  return `${location}  ${issue.subject}  ${issue.reason}  [${issue.evidence.kind}: ${issue.evidence.value}]`;
}

/** The verdict line first, then blockers, warnings, and unknowns. */
export function renderUpgradeReport(report: UpgradeReport): string {
  const counts = { blocker: 0, warning: 0, unknown: 0 };
  for (const issue of report.issues) counts[issue.level] += 1;
  const lines = [
    `${report.target.runtime}@${report.target.version}: ${report.verdict} (${counts.blocker} blockers, ${counts.warning} warnings, ${counts.unknown} unknown)`,
  ];
  if (report.verdict === "unknown") lines.push(UNKNOWN_VERDICT);
  for (const issue of report.issues) lines.push(renderUpgradeIssue(issue));
  return lines.join("\n");
}

/** `evergreen upgrade-check --to <runtime@version> [path] [--json]`. Exit `1` when blocked, `2` for bad input. */
export async function upgradeCheck(args: string[]): Promise<number> {
  let json = false;
  let targetText: string | undefined;
  let path: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--to") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) return usage();
      targetText = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return usage();
    if (path !== undefined) return usage();
    path = argument;
  }
  const target = targetText === undefined ? undefined : parseUpgradeTarget(targetText);
  if (!target) return usage();
  const root = resolve(path ?? ".");
  try {
    if (!(await stat(root)).isDirectory()) return usage(`${root} is not a directory.`);
  } catch {
    return usage(`Cannot read ${root}.`);
  }
  const report = await checkUpgrade(root, target);
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : renderUpgradeReport(report)}\n`);
  return report.verdict === "blocked" ? 1 : 0;
}

function usage(message?: string): number {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(`${USAGE}\n`);
  return 2;
}
