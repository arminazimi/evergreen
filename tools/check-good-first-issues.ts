// Checks that every issue labeled "good first issue" has a complete brief:
// files to touch, steps to follow, and a done-check.
//
//   node dist/tools/check-good-first-issues.js [--repo owner/name] [--summary summary.md] [--out report.json]
//
// It needs the network and reads public GitHub data. A token (GITHUB_TOKEN or GH_TOKEN)
// raises rate limits but is optional for public repositories.
// Scans never use this tool or the network.

import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export interface Issue {
  number: number;
  title: string;
  body?: string | null;
  html_url?: string;
  pull_request?: unknown;
}

export interface IncompleteIssue {
  number: number;
  title: string;
  url: string;
  defects: string[];
}

export interface CheckReport {
  checkedAt: string;
  total: number;
  complete: number;
  incomplete: IncompleteIssue[];
}

export interface FetchIssuesOptions {
  repo?: string;
  token?: string | undefined;
  state?: "open" | "all";
  fetcher?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined;
}

export interface CommandLineOptions {
  repo: string;
  token?: string | undefined;
  state: "open" | "all";
  summaryPath?: string | undefined;
  outPath?: string | undefined;
}

const KNOWN_OPTIONS = new Set(["--repo", "--token", "--state", "--summary", "--out"]);

export function hasFiles(body: string | null | undefined): boolean {
  if (!body) return false;
  const match = /(?:^|\n)(?:\*\*Files(?:\*\*:|:\*\*|\*\*)|#+\s*Files:?|Files:)[^\S\r\n]*\r?\n([\s\S]*?)(?=(?:\r?\n\s*(?:#+|\*\*[A-Z]|---)|$))/i.exec(body);
  if (!match) return false;
  const content = match[1]?.trim() ?? "";
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.some((line) => /^[-*•]\s+\S+/.test(line) || /`[^`]+`/.test(line));
}

export function hasSteps(body: string | null | undefined): boolean {
  if (!body) return false;
  const match = /(?:^|\n)(?:\*\*Steps(?:\*\*:|:\*\*|\*\*)|#+\s*Steps:?|Steps:)[^\S\r\n]*\r?\n([\s\S]*?)(?=(?:\r?\n\s*(?:#+|\*\*[A-Z]|---)|$))/i.exec(body);
  if (!match) return false;
  const content = match[1]?.trim() ?? "";
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.some((line) => /^(?:\d+\.|\*|-|•)\s+\S+/.test(line));
}

export function hasDoneCheck(body: string | null | undefined): boolean {
  if (!body) return false;
  const match = /(?:^|\n)(?:#+\s*(?:Done(?:\s+when)?|Exit\s+criteria)|\*\*(?:Done(?:\s+when)?|Exit\s+criteria)\*\*|Done(?:\s+when)?:)[^\S\r\n]*\r?\n([\s\S]*?)(?=(?:\r?\n\s*(?:#+|\*\*[A-Z]|---)|$))/i.exec(body);
  if (!match) return false;
  const content = match[1]?.trim() ?? "";
  return /(?:^|\n)\s*(?:[-*•]\s*)?\[[ xX]\]\s+\S+/.test(content);
}

export function evaluateIssueBrief(issue: Issue, defaultRepo = "arminazimi/evergreen"): IncompleteIssue | null {
  const defects: string[] = [];
  if (!hasFiles(issue.body)) defects.push("files");
  if (!hasSteps(issue.body)) defects.push("steps");
  if (!hasDoneCheck(issue.body)) defects.push("done-check");

  if (defects.length === 0) return null;

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url ?? `https://github.com/${defaultRepo}/issues/${issue.number}`,
    defects,
  };
}

export function evaluateIssues(issues: readonly Issue[], now = new Date(), defaultRepo = "arminazimi/evergreen"): CheckReport {
  const incomplete: IncompleteIssue[] = [];
  for (const issue of issues) {
    const defect = evaluateIssueBrief(issue, defaultRepo);
    if (defect) {
      incomplete.push(defect);
    }
  }
  return {
    checkedAt: now.toISOString(),
    total: issues.length,
    complete: issues.length - incomplete.length,
    incomplete,
  };
}

export function renderSummary(report: CheckReport): string {
  const lines: string[] = [];
  lines.push("### Good First Issues Brief Check", "");
  lines.push(`- **Total issues checked:** ${report.total}`);
  lines.push(`- **Complete briefs:** ${report.complete}`);
  lines.push(`- **Incomplete briefs:** ${report.incomplete.length}`);
  lines.push("");

  if (report.incomplete.length === 0) {
    lines.push("All open `good first issue`s have a complete brief (files, steps, done-check).");
    lines.push("");
  } else {
    lines.push("| Issue | Title | Missing Requirements |");
    lines.push("|---|---|---|");
    for (const item of report.incomplete) {
      const link = item.url ? `[#${item.number}](${item.url})` : `#${item.number}`;
      lines.push(`| ${link} | ${item.title.replace(/\|/g, "\\|")} | ${item.defects.join(", ")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function parseArguments(argv: readonly string[]): CommandLineOptions {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!arg.startsWith("--") || !KNOWN_OPTIONS.has(arg)) throw new Error(`Unexpected argument "${arg}".`);
    const val = argv[++index];
    if (val === undefined || val.startsWith("--")) throw new Error(`${arg} needs a value.`);
    options.set(arg, val);
  }
  const repo = options.get("--repo") ?? process.env.GITHUB_REPOSITORY ?? "arminazimi/evergreen";
  const token = options.get("--token") ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const stateStr = options.get("--state") ?? "open";
  if (stateStr !== "open" && stateStr !== "all") {
    throw new Error(`Invalid --state "${stateStr}", expected "open" or "all".`);
  }
  return {
    repo,
    token,
    state: stateStr,
    summaryPath: options.get("--summary"),
    outPath: options.get("--out"),
  };
}

export async function fetchGoodFirstIssues(options: FetchIssuesOptions = {}): Promise<Issue[]> {
  const repo = options.repo ?? process.env.GITHUB_REPOSITORY ?? "arminazimi/evergreen";
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const state = options.state ?? "open";
  const fetcher = options.fetcher ?? fetch;

  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "evergreen-good-first-issue-checker",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const results: Issue[] = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${repo}/issues?labels=good%20first%20issue&state=${state}&per_page=100&page=${page}`;
    const response = await fetcher(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch issues from ${url}: HTTP ${response.status} ${response.statusText}\n${body}`);
    }
    const batch = (await response.json()) as Issue[];
    for (const item of batch) {
      if (!item.pull_request) {
        results.push(item);
      }
    }
    if (batch.length < 100) break;
  }
  return results;
}

export async function main(argv: string[], fetcher?: ((url: string, init?: RequestInit) => Promise<Response>) | undefined): Promise<number> {
  const options = parseArguments(argv);
  const issues = await fetchGoodFirstIssues({
    repo: options.repo,
    token: options.token,
    state: options.state,
    fetcher,
  });

  const report = evaluateIssues(issues, new Date(), options.repo);
  const summary = renderSummary(report);

  if (options.summaryPath) {
    await writeFile(options.summaryPath, `${summary}\n`, { flag: "a" });
  }
  if (options.outPath) {
    await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  process.stdout.write(summary);

  if (report.incomplete.length > 0) {
    process.stderr.write(
      `\nError: ${report.incomplete.length} good first issue${report.incomplete.length === 1 ? "" : "s"} ${report.incomplete.length === 1 ? "lacks" : "lack"} a complete brief (files, steps, or done-check).\n`,
    );
    return 1;
  }

  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
