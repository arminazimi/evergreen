import type { DataInfo, Finding, ScanResult, Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import type { Forecast } from "@velella/ebb/forecast";

/** The reporter interface version every format declares. */
export const REPORTER_API_VERSION = "evergreen.reporter.v1" as const;

/**
 * Options a scan reporter may receive beyond the result. Most formats ignore them; HTML, text, and
 * Mermaid read the fields they need. The adapter builds forecast and as-of so reporters stay free of
 * CLI and data-loading concerns.
 */
export interface ReporterOptions {
  /** ISO calendar date for formats that pin "today" (Mermaid, HTML forecast). */
  readonly asOf?: string | undefined;
  /** Text: first-run guidance above the usual report. */
  readonly firstRun?: boolean | undefined;
  /** HTML: optional forecast chart above the findings. */
  readonly forecast?: Forecast | undefined;
}

/**
 * The stable interface every scan output format implements.
 * A new format is one module that exports a {@link Reporter}, plus one line in the registry.
 */
export interface Reporter {
  readonly apiVersion: typeof REPORTER_API_VERSION;
  /** The `--format` value this reporter owns. */
  readonly id: string;
  /**
   * Commands that may request this format with `--format <id>`.
   * When omitted, only `scan` may (command-specific allow-lists such as `receipt` still apply).
   */
  readonly commands?: readonly string[];
  /**
   * When set, this format uses an explicit command list gate instead of the scan-only gate, and this
   * is the usage rejection naming the commands that accept it.
   */
  readonly commandRejection?: string;
  render(result: ScanResult, options?: ReporterOptions): string;
}

export const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** The one order every machine-readable reporter uses, so the same scan always lists findings the same way. */
export function findingOrder(left: Finding, right: Finding): number {
  return (
    compare(left.location.path, right.location.path) ||
    (left.location.line ?? 0) - (right.location.line ?? 0) ||
    compare(left.ruleId, right.ruleId) ||
    compare(left.id, right.id)
  );
}

/** One line saying which lifecycle data a result used and how fresh its evidence is. */
export function describeData(data: DataInfo): string {
  const age = data.ageDays === 0 ? "today" : `${data.ageDays} day${data.ageDays === 1 ? "" : "s"} ago`;
  return `Data: ${data.source} ${data.version}, evidence reviewed through ${data.reviewedThrough} (${age})${data.stale ? ", stale" : ""}`;
}

export const severityRank = (severity: Severity) => severityValues.indexOf(severity);

/** Escapes untrusted text for a Markdown table cell while keeping the report on one physical line per row. */
export function escapeMarkdown(value: string | number): string {
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
    .map((line) => line.replace(/[&<>|\\\x60*_{}\[\]()#+\-.!]/g, (character) => escapes[character] ?? "\\" + character))
    .join("<br>");
}
