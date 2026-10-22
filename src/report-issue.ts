import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import type { Finding } from "./domain.js";

/** Lines kept on each side of the finding's line. Everything else in the file is left out. */
const CONTEXT_LINES = 2;
const MAX_LINE_LENGTH = 200;

/** Credentials in a URL (`https://user:token@host`) and values assigned to secret-looking keys. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;
const SECRET_ASSIGNMENT = /\b([\w.-]*(?:token|secret|password|passwd|api[_-]?key|auth)[\w.-]*)(["']?\s*[:=]\s*["']?)[^\s"',]+/gi;

export class ReportIssueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportIssueError";
  }
}

/** Masks credentials and the machine's absolute scan root, so an excerpt is safe to paste into a public issue. */
export function redactLine(line: string, root: string): string {
  const masked = line
    .split(root).join("<repo>")
    .replace(URL_CREDENTIALS, "$1<redacted>@")
    .replace(SECRET_ASSIGNMENT, "$1$2<redacted>");
  return masked.length > MAX_LINE_LENGTH ? `${masked.slice(0, MAX_LINE_LENGTH)}…` : masked;
}

/** The finding's file name without its directories: paths can reveal project structure, the file name is enough to reproduce. */
export function redactPath(path: string): string {
  return basename(path);
}

/**
 * Builds a Markdown body for a false-positive report: the rule, its evidence, and a few lines of the declaring file.
 * Nothing else from the repository is included, and nothing is sent anywhere; the caller decides what to do with the text.
 */
export async function createIssueReport(root: string, finding: Finding): Promise<string> {
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, finding.location.path);
  const inside = relative(absoluteRoot, target);
  if (inside.startsWith("..") || isAbsolute(inside)) {
    throw new ReportIssueError(`The finding points outside the repository: ${finding.location.path}`);
  }

  const file = redactPath(finding.location.path);
  const line = finding.location.line;
  let excerpt = "";
  let firstLine = 1;
  try {
    const lines = (await readFile(target, "utf8")).split(/\r?\n/);
    const center = line ?? 1;
    firstLine = Math.max(1, center - CONTEXT_LINES);
    excerpt = lines
      .slice(firstLine - 1, center + CONTEXT_LINES)
      .map((text) => redactLine(text, absoluteRoot))
      .join("\n");
  } catch {
    throw new ReportIssueError(`Could not read ${finding.location.path} to build the excerpt.`);
  }

  const sources = finding.sources.map((source) => `- [${source.title}](${source.url})`).join("\n");
  return [
    `## Possible false positive: \`${finding.ruleId}\``,
    "",
    `Evergreen reported **${finding.title}** (${finding.severity}) for a declaration I believe is not affected.`,
    "",
    "### Finding",
    "",
    `- Rule: \`${finding.ruleId}\``,
    `- Detector: \`${finding.detector}\``,
    `- Location: \`${file}${line ? `:${line}` : ""}\` (directories removed)`,
    `- Summary: ${redactLine(finding.summary.split(finding.location.path).join(file), absoluteRoot)}`,
    "",
    "### Evidence the rule cites",
    "",
    sources,
    "",
    `### Manifest excerpt (\`${file}\`, lines ${firstLine}–${firstLine + excerpt.split("\n").length - 1})`,
    "",
    "Only the lines around the finding are included; everything else was left out on purpose.",
    "",
    "```",
    excerpt,
    "```",
    "",
    "### Why I think this is wrong",
    "",
    "<!-- Describe what the declaration actually means. Nothing was sent automatically; review and edit this report before you open an issue. -->",
    "",
  ].join("\n");
}
