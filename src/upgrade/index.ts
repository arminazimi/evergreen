import type { UpgradeAnalyzer, UpgradeIssue, UpgradeReport, UpgradeTarget } from "./types.js";

export type { UpgradeAnalyzer, UpgradeIssue, UpgradeReport, UpgradeTarget } from "./types.js";

/** Every built-in analyzer. Each task in the upgrade epic appends its own entry. */
export const upgradeAnalyzers: UpgradeAnalyzer[] = [];

const levelOrder = { blocker: 0, warning: 1, unknown: 2 } as const;

const runtimeAliases: Record<string, string> = { node: "nodejs", py: "python", golang: "go" };

/** Parses `nodejs@22` or `python@3.13`. Returns undefined when the text has no `@` or an empty side. */
export function parseUpgradeTarget(text: string): UpgradeTarget | undefined {
  const at = text.lastIndexOf("@");
  if (at <= 0 || at === text.length - 1) return undefined;
  const runtime = text.slice(0, at).toLowerCase();
  return { runtime: runtimeAliases[runtime] ?? runtime, version: text.slice(at + 1) };
}

/** Runs every analyzer that handles the target runtime and applies to the repository. Deterministic. */
export async function checkUpgrade(root: string, target: UpgradeTarget, analyzers: readonly UpgradeAnalyzer[] = upgradeAnalyzers): Promise<UpgradeReport> {
  const ran: string[] = [];
  const issues: UpgradeIssue[] = [];
  for (const analyzer of analyzers) {
    if (!analyzer.runtimes.includes(target.runtime) || !(await analyzer.applies(root))) continue;
    ran.push(analyzer.id);
    issues.push(...(await analyzer.analyze(root, target)));
  }
  issues.sort((a, b) =>
    levelOrder[a.level] - levelOrder[b.level] || a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.subject.localeCompare(b.subject) || a.analyzer.localeCompare(b.analyzer));
  ran.sort();
  const verdict = issues.some((issue) => issue.level === "blocker") ? "blocked" : ran.length === 0 ? "unknown" : "ready";
  return { schemaVersion: "evergreen.upgrade.v1", target, verdict, analyzers: ran, issues };
}
