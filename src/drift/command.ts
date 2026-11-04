import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { analyzeDrift, driftCollectors } from "./index.js";
import type { DriftCollector, DriftReport, RuntimeDrift, RuntimePin } from "./types.js";

const USAGE = "Usage: evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]";

interface DriftOptions {
  path: string;
  json: boolean;
  check: boolean;
  runtime?: string;
  align?: string;
}

class DriftUsageError extends Error {}

function parseOptions(args: string[]): DriftOptions {
  const options: DriftOptions = { path: ".", json: false, check: false };
  let positioned = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      options.json = true;
    } else if (argument === "--check") {
      options.check = true;
    } else if (argument === "--runtime" || argument === "--align") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) throw new DriftUsageError(`${argument} needs a value.`);
      if (argument === "--runtime") options.runtime = value;
      else options.align = value;
      index += 1;
    } else if (argument.startsWith("-")) {
      throw new DriftUsageError(`Unknown option: ${argument}`);
    } else if (positioned) {
      throw new DriftUsageError(`Unexpected argument: ${argument}`);
    } else {
      options.path = argument;
      positioned = true;
    }
  }
  if (options.align !== undefined && options.runtime === undefined)
    throw new DriftUsageError("--align requires --runtime.");
  return options;
}

function renderText(report: DriftReport): string {
  if (report.runtimes.length === 0) return "No runtime pins found.";
  return report.runtimes
    .map((runtime) => {
      const lines = [runtime.runtime];
      for (const pin of runtime.pins) {
        const kind = pin.kind === "floor" ? "floor" : "pin";
        const value = pin.release === undefined ? `unresolved: ${pin.unresolved ?? "unknown"}` : pin.release;
        lines.push(`  ${pin.path}:${pin.line}  ${pin.source}  ${pin.raw}  (${kind}, ${value})`);
      }
      if (runtime.releases.length > 0) lines.push(`  releases: ${runtime.releases.join(", ")}`);
      if (runtime.drifted) lines.push("  DRIFT");
      for (const conflict of runtime.floorConflicts) {
        lines.push(
          `  floor conflict: ${conflict.path}:${conflict.line} ${conflict.source} ${conflict.raw} needs ${conflict.release}`,
        );
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function collectorsByRuntime(runtimes: readonly RuntimeDrift[]): Map<string, DriftCollector> {
  const selected = new Map<string, DriftCollector>();
  for (const collector of driftCollectors) {
    if (runtimes.some((runtime) => runtime.runtime === collector.runtime)) selected.set(collector.runtime, collector);
  }
  return selected;
}

async function renderAlign(root: string, report: DriftReport, release: string): Promise<number> {
  const collectors = collectorsByRuntime(report.runtimes);
  const refused: RuntimePin[] = [];
  const files = new Map<string, { source: string; lines: string[] }>();
  for (const runtime of report.runtimes) {
    const collector = collectors.get(runtime.runtime);
    for (const pin of runtime.pins) {
      if (pin.release === release) continue;
      if (!collector?.align) {
        refused.push(pin);
        continue;
      }
      let file = files.get(pin.path);
      if (!file) {
        let contents: string;
        try {
          contents = await readFile(resolve(root, pin.path), "utf8");
        } catch {
          refused.push(pin);
          continue;
        }
        const source = contents.endsWith("\n") ? contents.slice(0, -1) : contents;
        file = { source, lines: source.split("\n") };
        files.set(pin.path, file);
      }
      const lineText = file.lines[pin.line - 1];
      const replacement = lineText === undefined ? undefined : collector.align(pin, lineText, release);
      if (lineText === undefined || replacement === undefined || replacement === lineText) {
        refused.push(pin);
        continue;
      }
      file.lines[pin.line - 1] = replacement;
    }
  }
  let printed = 0;
  for (const [path, file] of files) {
    const after = file.lines.join("\n");
    if (after === file.source) continue;
    process.stdout.write(`${renderDiff(path, file.source, after)}\n`);
    printed += 1;
  }
  for (const pin of refused) {
    process.stderr.write(
      `Refused ${pin.path}:${pin.line} (${pin.source} ${pin.raw}): a floor or a value this collector will not rewrite.\n`,
    );
  }
  if (printed === 0) process.stderr.write(`No pin could be aligned to ${release}.\n`);
  return 0;
}

/** `evergreen drift`: reports every runtime version a repository states and whether its pins agree. Reads files only. */
export async function driftCommand(args: string[]): Promise<number> {
  let options: DriftOptions;
  try {
    options = parseOptions(args);
  } catch (error) {
    if (error instanceof DriftUsageError) {
      process.stderr.write(`${error.message}\n${USAGE}\n`);
      return 2;
    }
    throw error;
  }

  const collectors =
    options.runtime === undefined
      ? driftCollectors
      : driftCollectors.filter((collector) => collector.runtime === options.runtime);
  if (options.runtime !== undefined && collectors.length === 0) {
    const known = driftCollectors.map((collector) => collector.runtime).join(", ") || "none";
    process.stderr.write(`Unknown runtime: ${options.runtime}. Known runtimes: ${known}.\n${USAGE}\n`);
    return 2;
  }

  const root = resolve(options.path);
  const report = await analyzeDrift(root, collectors);
  if (options.align !== undefined) return renderAlign(root, report, options.align);

  process.stdout.write(`${options.json ? JSON.stringify(report, null, 2) : renderText(report)}\n`);
  if (options.check && report.runtimes.some((runtime) => runtime.drifted || runtime.floorConflicts.length > 0))
    return 1;
  return 0;
}
