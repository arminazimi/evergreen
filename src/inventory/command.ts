import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";

import { ConfigError, loadConfig } from "../config.js";
import { severityValues } from "../domain.js";
import type { Severity } from "../domain.js";
import { inventoryImporters, runInventory } from "./index.js";
import type { InventoryReport, InventoryResult } from "./types.js";

export const INVENTORY_USAGE =
  "Usage: evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]";

export class InventoryUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryUsageError";
  }
}

/** The first 12 hex characters of the resource's SHA-256, used by `--redact`. */
export function redactResource(resource: string): string {
  return createHash("sha256").update(resource).digest("hex").slice(0, 12);
}

/** A copy of the report with every resource name redacted. */
export function redactReport(report: InventoryReport): InventoryReport {
  return {
    ...report,
    results: report.results.map((result) => ({
      ...result,
      item: { ...result.item, resource: redactResource(result.item.resource) },
    })),
  };
}

const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

function row(result: InventoryResult, withRules: boolean): string {
  const { item, check } = result;
  const version = item.version ?? "-";
  if (!withRules) return `  ${item.resource}  ${version}  ${item.pointer}`;
  const rules = check.findings.map((finding) => finding.ruleId).join(",");
  return `  ${item.resource}  ${version}  ${check.status}  ${rules}  ${item.pointer}`;
}

/**
 * Text output: affected results first, grouped by file; then the results that were checked and are not
 * affected; then `no-data` results dimmed; then the files no importer recognized.
 */
export function renderInventoryText(report: InventoryReport, options: { color?: boolean } = {}): string {
  const color = options.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  const dim = (text: string): string => (color ? `${DIM}${text}${RESET}` : text);
  const affected = report.results.filter((result) => result.check.status === "affected");
  const checked = report.results.filter((result) => result.check.status === "version-dependent" || result.check.status === "not-affected");
  const noData = report.results.filter((result) => result.check.status === "no-data");
  const lines: string[] = [];

  if (affected.length === 0) {
    lines.push("No affected items in the files read.");
  } else {
    let file = "";
    for (const result of affected) {
      if (result.item.file !== file) {
        file = result.item.file;
        lines.push(file);
      }
      lines.push(row(result, true));
    }
  }
  if (checked.length > 0) {
    lines.push("", dim("Checked, not affected"));
    for (const result of checked) lines.push(row(result, true));
  }
  if (noData.length > 0) {
    lines.push("", dim("No lifecycle data (not a statement that it is safe)"));
    for (const result of noData) lines.push(row(result, false));
  }
  if (report.unrecognized.length > 0) {
    lines.push("", dim("Unrecognized files"));
    for (const file of report.unrecognized) lines.push(`  ${file}`);
  }
  return `${lines.join("\n")}\n`;
}

interface InventoryOptions {
  files: string[];
  format: string;
  json: boolean;
  redact: boolean;
  failOn?: string;
}

function parseArguments(args: string[]): InventoryOptions {
  const files: string[] = [];
  let format = "auto";
  let json = false;
  let redact = false;
  let failOn: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--redact") {
      redact = true;
    } else if (argument === "--format" || argument === "--fail-on") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) throw new InventoryUsageError(INVENTORY_USAGE);
      if (argument === "--format") format = value;
      else failOn = value;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new InventoryUsageError(INVENTORY_USAGE);
    } else {
      files.push(argument);
    }
  }
  if (files.length === 0) throw new InventoryUsageError(INVENTORY_USAGE);
  return { files, format, json, redact, ...(failOn === undefined ? {} : { failOn }) };
}

function gateOf(option: string | undefined, configured: Severity | "none" | undefined): Severity | "none" {
  const gate = option ?? configured ?? "high";
  if (gate !== "none" && !severityValues.includes(gate as Severity)) {
    throw new InventoryUsageError(`Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).`);
  }
  return gate as Severity | "none";
}

function reachesGate(results: readonly InventoryResult[], gate: Severity | "none"): boolean {
  if (gate === "none") return false;
  const threshold = severityValues.indexOf(gate);
  return results.some(
    (result) =>
      result.check.status === "affected" &&
      result.check.severity !== undefined &&
      severityValues.indexOf(result.check.severity) >= threshold,
  );
}

async function readableFile(file: string): Promise<boolean> {
  try {
    await access(file, constants.R_OK);
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** `evergreen inventory`: reports the lifecycle of what an export says is deployed. Reads only the named files. */
export async function inventoryCommand(args: string[]): Promise<number> {
  const options = parseArguments(args);
  let configured: Severity | "none" | undefined;
  try {
    configured = (await loadConfig())?.failOn;
  } catch (error) {
    if (error instanceof ConfigError) throw new InventoryUsageError(error.message);
    throw error;
  }
  const gate = gateOf(options.failOn, configured);
  const importers = inventoryImporters;
  if (options.format !== "auto" && !importers.some((importer) => importer.id === options.format)) {
    const ids = importers.map((importer) => importer.id);
    throw new InventoryUsageError(`Unknown importer for --format: ${options.format}. Use auto${ids.length > 0 ? ` or one of: ${ids.join(", ")}` : ""}.`);
  }

  const open: string[] = [];
  const unreadable: string[] = [];
  for (const file of options.files) {
    (await readableFile(file) ? open : unreadable).push(file);
  }

  const report = await runInventory(open, importers, options.format === "auto" ? undefined : options.format);
  const shown = options.redact ? redactReport(report) : report;
  process.stdout.write(options.json ? `${JSON.stringify(shown, null, 2)}\n` : renderInventoryText(shown));
  for (const file of unreadable) process.stderr.write(`${file} could not be read.\n`);

  if (unreadable.length > 0 || report.unrecognized.length > 0) return 2;
  return reachesGate(report.results, gate) ? 1 : 0;
}
