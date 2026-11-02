import { basename, isAbsolute } from "node:path";

import type { Receipt, ReceiptFinding } from "./receipt.js";

/** Marks a Markdown receipt so a tool can find and replace it in a pull request body. */
export const RECEIPT_MARKER = "<!-- evergreen-receipt -->";

/** How many findings stay visible before a section collapses into `<details>`. */
const DETAILS_AFTER = 5;

/**
 * The outcome a reader sees in the heading. `introduced` wins when the change added findings;
 * otherwise the heading names whether everything cleared, some remain, or nothing moved.
 */
export type ReceiptVerdict = "clean" | "resolved" | "unchanged" | "partial" | "introduced";

const VERDICT_HEADING: Record<ReceiptVerdict, string> = {
  clean: "No findings",
  resolved: "All findings resolved",
  unchanged: "Findings remain",
  partial: "Partially resolved",
  introduced: "New findings introduced",
};

/** Shown when the caller does not know which path and scan the receipt was built from. */
const REPRODUCE_TEMPLATE = "evergreen receipt <path> --before <scan.json>";

/** Options for the Markdown receipt; `reproduce` is the command that rebuilds it. */
export type ReceiptMarkdownOptions = {
  reproduce?: string;
};

/** Escapes untrusted text for Markdown (and HTML-in-Markdown) while keeping one physical line. */
function escapeMarkdown(value: string | number): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "|": "&#124;",
    "\\": "&#92;",
  };
  return String(value)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line.replace(/[&<>|\\\x60*_{}\[\]()#+\-.!]/g, (character) => escapes[character] ?? "\\" + character),
    )
    .join("<br>");
}

/** Repository-relative display path: never emit an absolute path into a pasteable receipt. */
function displayPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  if (isAbsolute(path) || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return basename(normalized);
  }
  return normalized;
}

function locationOf(finding: ReceiptFinding): string {
  const path = displayPath(finding.path);
  return finding.line === undefined ? path : `${path}:${finding.line}`;
}

/** The verdict derived only from the receipt counts. */
export function receiptVerdict(receipt: Receipt): ReceiptVerdict {
  const { resolved, remaining, introduced } = receipt.counts;
  if (introduced > 0) return "introduced";
  if (resolved === 0 && remaining === 0) return "clean";
  if (resolved > 0 && remaining === 0) return "resolved";
  if (resolved === 0) return "unchanged";
  return "partial";
}

/** Wraps text in a code span whose backtick fence cannot be closed early by the text itself. */
function codeSpan(text: string): string {
  const flat = text.replace(/[\r\n]+/g, " ");
  const longest = Math.max(0, ...(flat.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  const pad = flat.startsWith("`") || flat.endsWith("`") ? " " : "";
  return `${fence}${pad}${flat}${pad}${fence}`;
}

function findingRows(findings: ReceiptFinding[]): string[] {
  return findings.map(
    (finding) =>
      `| ${escapeMarkdown(finding.severity)} | ${escapeMarkdown(finding.title)} | ${escapeMarkdown(locationOf(finding))} |`,
  );
}

function findingSection(title: string, findings: ReceiptFinding[]): string[] {
  const heading = `### ${title}`;
  if (findings.length === 0) return [heading, "", "_None._"];

  const table = [
    "| Severity | Finding | Location |",
    "| --- | --- | --- |",
    ...findingRows(findings),
  ];

  if (findings.length <= DETAILS_AFTER) {
    return [heading, "", ...table];
  }

  return [
    heading,
    "",
    "<details>",
    `<summary>${findings.length} ${title.toLowerCase()}</summary>`,
    "",
    ...table,
    "",
    "</details>",
  ];
}

function commandsSection(commands: Receipt["commands"]): string[] {
  if (commands.length === 0) return [];
  const body = commands.map((item) => `${item.command}  # ${item.purpose}`).join("\n");
  // Fence long enough that a hostile command containing backticks cannot close the block early.
  const longest = Math.max(2, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return ["### Suggested commands", "", fence, body, fence];
}

/**
 * Renders a paste-ready Markdown receipt for a pull request body. Deterministic for the same
 * receipt; titles and paths are escaped; absolute paths are reduced to a file name. The last line
 * names the command that rebuilds the receipt, taken from `options.reproduce` when the caller knows it.
 */
export function renderReceiptMarkdown(receipt: Receipt, options: ReceiptMarkdownOptions = {}): string {
  const verdict = receiptVerdict(receipt);
  const lines = [
    RECEIPT_MARKER,
    `## Evergreen receipt: ${VERDICT_HEADING[verdict]}`,
    "",
    "| Resolved | Remaining | Introduced |",
    "| --- | --- | --- |",
    `| ${receipt.counts.resolved} | ${receipt.counts.remaining} | ${receipt.counts.introduced} |`,
    "",
    ...findingSection("Resolved", receipt.resolved),
    "",
    ...findingSection("Remaining", receipt.remaining),
    "",
    ...findingSection("Introduced", receipt.introduced),
  ];
  const commands = commandsSection(receipt.commands);
  if (commands.length > 0) lines.push("", ...commands);
  lines.push("", `Reproduce with: ${codeSpan(options.reproduce ?? REPRODUCE_TEMPLATE)}`);
  return `${lines.join("\n")}\n`;
}
