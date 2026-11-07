import { mermaidReporter } from "../mermaid.js";
import { slackReporter, teamsReporter } from "./chat.js";
import { codeQualityReporter } from "./codequality.js";
import { compactReporter } from "./compact.js";
import { htmlReporter } from "./html.js";
import { jsonReporter } from "./json.js";
import { junitReporter } from "./junit.js";
import { markdownReporter } from "./markdown.js";
import { rdjsonReporter } from "./rdjson.js";
import { sarifReporter } from "./sarif.js";
import { REPORTER_API_VERSION, type Reporter } from "./shared.js";
import { textReporter } from "./text.js";
import { webhookReporter } from "./webhook.js";

/**
 * Every scan output format, in the order usage errors list them. Adding a format means adding one
 * module that exports a {@link Reporter} and one entry here.
 */
export const SCAN_REPORTERS: readonly Reporter[] = [
  textReporter,
  jsonReporter,
  markdownReporter,
  junitReporter,
  sarifReporter,
  rdjsonReporter,
  codeQualityReporter,
  compactReporter,
  htmlReporter,
  slackReporter,
  teamsReporter,
  webhookReporter,
  mermaidReporter,
];

const reportersById: ReadonlyMap<string, Reporter> = new Map(SCAN_REPORTERS.map((reporter) => [reporter.id, reporter]));

/** Every `--format` value the reporters know. */
export const KNOWN_FORMAT_IDS: ReadonlySet<string> = new Set(SCAN_REPORTERS.map((reporter) => reporter.id));

/** The reporter for `--format <id>`, or `undefined` when the id is unknown. */
export function getScanReporter(id: string): Reporter | undefined {
  return reportersById.get(id);
}

/**
 * The parenthetical list usage errors print after "expected": comma-separated ids with "or" before
 * the last. Order matches {@link SCAN_REPORTERS}.
 */
export function formatExpectedList(ids: readonly string[] = SCAN_REPORTERS.map((reporter) => reporter.id)): string {
  if (ids.length === 0) return "";
  const first = ids[0];
  if (first === undefined) return "";
  if (ids.length === 1) return first;
  const last = ids[ids.length - 1];
  if (last === undefined) return first;
  if (ids.length === 2) return `${first} or ${last}`;
  return `${ids.slice(0, -1).join(", ")}, or ${last}`;
}

/**
 * Formats that use the scan-only gate: scan (and receipt) always allowed; any other listed command
 * is an extra. Text and JSON are omitted because many commands take them through their own allow-lists.
 * Formats with {@link Reporter.commandRejection} use {@link formatCommandGates} instead.
 */
export function scanOnlyFormatExtras(): ReadonlyMap<string, readonly string[]> {
  const extras = new Map<string, readonly string[]>();
  for (const reporter of SCAN_REPORTERS) {
    if (reporter.id === "text" || reporter.id === "json") continue;
    if (reporter.commandRejection !== undefined) continue;
    const commands = reporter.commands ?? ["scan"];
    extras.set(
      reporter.id,
      commands.filter((command) => command !== "scan" && command !== "receipt"),
    );
  }
  return extras;
}

/**
 * Formats whose allowed commands are neither "scan alone" nor the scan-only extras map (today: mermaid).
 */
export function formatCommandGates(): ReadonlyMap<
  string,
  { readonly commands: readonly string[]; readonly rejection: string }
> {
  const gates = new Map<string, { readonly commands: readonly string[]; readonly rejection: string }>();
  for (const reporter of SCAN_REPORTERS) {
    if (reporter.commandRejection === undefined || reporter.commands === undefined) continue;
    gates.set(reporter.id, { commands: reporter.commands, rejection: reporter.commandRejection });
  }
  return gates;
}

/** Guards that every registered reporter declares the current API version and a unique id. */
export function assertReporterContract(reporters: readonly Reporter[] = SCAN_REPORTERS): void {
  const seen = new Set<string>();
  const expected: string = REPORTER_API_VERSION;
  for (const reporter of reporters) {
    const declared: string = reporter.apiVersion;
    if (declared !== expected) {
      throw new Error(`Reporter ${reporter.id} declares ${declared}, expected ${expected}`);
    }
    if (seen.has(reporter.id)) throw new Error(`Duplicate reporter id: ${reporter.id}`);
    seen.add(reporter.id);
  }
}
