import process from "node:process";
import { relative, resolve } from "node:path";

import { builtInDetectors } from "../detectors/index.js";
import type { ScanResult, Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { scanRepository } from "../engine.js";
import { parseBoundedJson, readBoundedFile } from "../package-files.js";
import { buildReceipt } from "../receipt.js";
import { renderReceiptMarkdown } from "../receipt-markdown.js";
import { afterGates, repositoryPhase } from "./runtime.js";
import type { CliCommand } from "./types.js";

export const command: CliCommand = {
  name: "receipt",
  flags: ["--before", "--format", "--fail-on-introduced", "--json"],
  example: "evergreen receipt . --before before.json",
  usage: ["  evergreen receipt [path] --before <scan.json> [--format markdown|json] [--fail-on-introduced]   # what a change resolved, left, or introduced; never runs a command"],
  usageSlots: [29],
  run(args, ctx) {
    return afterGates("receipt", args, ctx, async (state) => {
      const early = await repositoryPhase(state, ctx);
      if (early !== undefined) return early;
      const receiptUsage = "Usage: evergreen receipt [path] --before <scan.json> [--format markdown|json] [--fail-on-introduced]";
      const beforeIndex = state.args.indexOf("--before");
      const beforePath = beforeIndex === -1 ? undefined : state.args[beforeIndex + 1];
      if (beforePath === undefined || beforePath.startsWith("-")) return ctx.fail("usage", receiptUsage);
      if (state.positional.length > 1) return ctx.fail("usage", receiptUsage);
      const before = await readReceiptBaseline(resolve(beforePath));
      if (typeof before === "string") return ctx.fail("usage", `Cannot use --before: ${before}`, `\n${receiptUsage}`);
      const receipt = buildReceipt(before, await scanRepository(resolve(state.pathArgument), builtInDetectors, { noCache: state.noCache }));
      const reproduce = ["evergreen", "receipt", shellWord(state.pathArgument), "--before", shellWord(beforePath)].join(" ");
      process.stdout.write(state.json ? `${JSON.stringify(receipt, null, 2)}\n` : renderReceiptMarkdown(receipt, { reproduce }));
      if (state.args.includes("--fail-on-introduced") && receipt.counts.introduced > 0) {
        return ctx.fail("policy", `${receipt.counts.introduced} finding${receipt.counts.introduced === 1 ? "" : "s"} introduced (--fail-on-introduced).`);
      }
      return 0;
    });
  },
};

/** A path as a shell word, relative to the working directory so the reproduce line never carries an absolute path. */
function shellWord(path: string): string {
  const relativePath = relative(process.cwd(), resolve(path)) || ".";
  return /^[\w@%+=:,./-]+$/.test(relativePath) ? relativePath : `'${relativePath.replaceAll("'", "'\\''")}'`;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why one entry of a saved scan's `findings` does not match the scan output contract, or undefined when it does. */
function scanFindingProblem(value: unknown): string | undefined {
  if (!isJsonObject(value)) return "the entry is not an object.";
  for (const field of ["id", "ruleId", "detector", "title", "summary"]) {
    if (typeof value[field] !== "string") return `"${field}" is missing or not a string.`;
  }
  if (!severityValues.includes(value.severity as Severity)) return `"severity" is not one of ${severityValues.join(", ")}.`;
  if (!isJsonObject(value.location) || typeof value.location.path !== "string") return `"location.path" is missing or not a string.`;
  const line = value.location.line;
  if (line !== undefined && (!Number.isInteger(line) || (line as number) < 1)) return `"location.line" is not a positive integer.`;
  if (!Array.isArray(value.sources)) return `"sources" is missing or not an array.`;
  if (value.migration !== undefined) {
    if (!isJsonObject(value.migration)) return `"migration" is not an object.`;
    const verification = value.migration.verification;
    if (verification !== undefined) {
      if (!Array.isArray(verification)) return `"migration.verification" is not an array.`;
      for (let index = 0; index < verification.length; index += 1) {
        const command = verification[index];
        if (!isJsonObject(command) || typeof command.command !== "string" || typeof command.purpose !== "string") {
          return `"migration.verification[${index}]" is not an object with command and purpose strings.`;
        }
      }
    }
  }
  return undefined;
}

/** Why the saved scan's `data` does not match the scan output contract, or undefined when it does. */
function scanDataProblem(value: unknown): string | undefined {
  if (!isJsonObject(value)) return `"data" is not an object.`;
  if (value.source !== "bundled" && value.source !== "cache" && value.source !== "pinned") return `"data.source" is not bundled, cache, or pinned.`;
  if (typeof value.version !== "string") return `"data.version" is missing or not a string.`;
  if (value.createdAt !== null && typeof value.createdAt !== "string") return `"data.createdAt" is neither a string nor null.`;
  if (typeof value.reviewedThrough !== "string") return `"data.reviewedThrough" is missing or not a string.`;
  if (!Number.isInteger(value.ageDays) || (value.ageDays as number) < 0) return `"data.ageDays" is not a non-negative integer.`;
  if (typeof value.stale !== "boolean") return `"data.stale" is missing or not a boolean.`;
  return undefined;
}

/** Why a document is not an `evergreen.scan.v1` report, or undefined when it matches the contract. */
function scanReportProblem(value: unknown): string | undefined {
  if (!isJsonObject(value)) return "the document is not a JSON object.";
  if (value.schemaVersion !== "evergreen.scan.v1") return `"schemaVersion" is not "evergreen.scan.v1".`;
  if (typeof value.root !== "string") return `"root" is missing or not a string.`;
  if (typeof value.scannedAt !== "string") return `"scannedAt" is missing or not a string.`;
  if (!Array.isArray(value.diagnostics) || value.diagnostics.some((entry) => typeof entry !== "string")) {
    return `"diagnostics" is missing or not an array of strings.`;
  }
  if (!Array.isArray(value.findings)) return `"findings" is missing or not an array.`;
  for (let index = 0; index < value.findings.length; index += 1) {
    const problem = scanFindingProblem(value.findings[index]);
    if (problem !== undefined) return `findings[${index}] ${problem}`;
  }
  if (value.data !== undefined) {
    const problem = scanDataProblem(value.data);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/**
 * Reads the `--before` file as untrusted input: the same size and nesting bounds the package-file parsers
 * apply, then a check against the scan output contract. Returns the reason it cannot be used, or the report.
 */
async function readReceiptBaseline(path: string): Promise<ScanResult | string> {
  let read: Awaited<ReturnType<typeof readBoundedFile>>;
  try {
    read = await readBoundedFile(path);
  } catch (error) {
    return `${path} could not be read (${(error as Error).message}).`;
  }
  if (read === undefined) return `${path} does not exist.`;
  if (read.skipped) return `${path}: ${read.skipped.detail}.`;
  const parsed = parseBoundedJson(read.contents);
  if (parsed === undefined) return `${path} is not valid JSON.`;
  if (parsed.skipped) return `${path}: ${parsed.skipped.detail}.`;
  const problem = scanReportProblem(parsed.value);
  return problem === undefined ? (parsed.value as ScanResult) : `${path} is not an evergreen.scan.v1 report: ${problem}`;
}
