import { stat, writeFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";

import { applyAsOf } from "../as-of.js";
import {
  DEFAULT_WARN_DAYS,
  createBaseline,
  debtTrendLine,
  evaluateBaseline,
  expiredPolicies,
  expiredSuppressionsFail,
  readBaseline,
  readBaselines,
  writeBaseline,
} from "../baseline.js";
import type { ExpiredPolicy } from "../baseline.js";
import { bundledRules } from "../check-dependency.js";
import { groupScanByOwner, renderOwnerGroupsText } from "../codeowners.js";
import { applyIgnore, ConfigError, loadConfig } from "../config.js";
import type { EvergreenConfig } from "../config.js";
import { configureActiveData, DataPinError, getActiveData } from "../data-source.js";
import { scanDemo } from "../demo.js";
import { builtInDetectors } from "../detectors/index.js";
import { scanWithBuiltIns } from "../scan-builtins.js";
import type { ScanSelection, ScanResult, Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { applyScanSelection, findRepositories, renderMultiScanText, scanProjects } from "../engine/index.js";
import { invalidConfig, renderActionable, unreadablePath, type ActionableMessage } from "../errors.js";
import { buildForecast } from "../forecast.js";
import { hasPersonalConfig } from "../init-personal.js";
import { applyMinSupport, parseMinSupportDays } from "../min-support.js";
import { createMigrationPacket } from "../migration-packet.js";
import { readPinnedRuntimes } from "../runtime-pin.js";
import { isIsoDate } from "../registry.js";
import { createIssueReport, ReportIssueError } from "../report-issue.js";
import {
  renderCodeQuality,
  renderCompact,
  renderFindingText,
  renderHtml,
  renderJson,
  renderJunit,
  renderMarkdown,
  renderMigrationPacketText,
  renderRdjson,
  renderSarif,
  renderScanMermaid,
  renderSlack,
  renderTeams,
  renderText,
  renderWebhook,
} from "../reporters.js";
import { STATUS_FILE_NAME, writeStatusFile } from "../status-file.js";
import { browseFindings, canBrowse } from "../tui.js";
import { selectorValuesSummary, unknownSelectors } from "../scan-selectors.js";
import { EXIT_CODES, type CommandContext, type FailureClass } from "./types.js";

export type { FailureClass };
export { EXIT_CODES };

const valueOptions = new Set([
  "--baseline",
  "--output",
  "--format",
  "--fail-on",
  "--data-version",
  "--today",
  "--as-of",
  "--min-support-days",
  "--baseline-warn-days",
  "--on-expired",
  "--all",
  "--months",
  "--limit",
  "--wave",
  "--owners",
  "--ignore",
  "--only",
  "--exclude",
  "--report-base-url",
  "--before",
]);

let activeFail: CommandContext["fail"] | undefined;

/** Remembers the context so the top-level catch can emit the same JSON error document as the command that threw. */
export function bindContext(ctx: CommandContext): void {
  activeFail = ctx.fail.bind(ctx);
}

/** Failure path for errors thrown outside a command handler. Uses the bound context when `main` has started. */
export function fail(kind: FailureClass, message: string, appendix = ""): number {
  if (activeFail) return activeFail(kind, message, appendix);
  process.stderr.write(`${message}\n${appendix}`);
  return EXIT_CODES[kind];
}

export function createCommandContext(
  rawArgs: readonly string[],
  help: string,
  completionScript: CommandContext["completionScript"] = () => undefined,
): CommandContext {
  const args = rawArgs.filter((argument) => argument !== "--debug");
  const formatValue = args[args.indexOf("--format") + 1];
  const jsonErrors = args.includes("--json") || (args.includes("--format") && formatValue === "json");
  const ctx: CommandContext = {
    jsonErrors,
    debug: rawArgs.includes("--debug"),
    help,
    exitCodes: EXIT_CODES,
    completionScript,
    fail(kind, message, appendix = "") {
      process.stderr.write(`${message}\n${appendix}`);
      if (jsonErrors && kind !== "policy") {
        const document = {
          schemaVersion: "evergreen.error.v1",
          error: { code: kind, exitCode: EXIT_CODES[kind], message },
        };
        process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
      }
      return EXIT_CODES[kind];
    },
    failActionable(kind, actionable) {
      const rendered = renderActionable(actionable);
      return ctx.fail(kind, rendered.message, rendered.appendix);
    },
  };
  return ctx;
}

export interface Prepared {
  readonly command: string;
  readonly args: string[];
  readonly positional: string[];
  readonly findingId: string | undefined;
  readonly pathArgument: string;
  readonly demo: boolean;
  readonly config: EvergreenConfig | undefined;
  readonly dataVersionFlag: string | undefined;
  readonly dataVersionIndex: number;
  readonly format: string | undefined;
  readonly formatIndex: number;
  optionValue(name: string): string | undefined;
  optionValues(name: string): string[];
}

export interface Gated extends Prepared {
  readonly json: boolean;
  readonly noCache: boolean;
  readonly selection: ScanSelection | undefined;
}

/** The operands left after every option and the value it takes. */
function positionalWords(args: readonly string[]): string[] {
  const positional: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (valueOptions.has(argument)) {
      index += 1;
    } else if (!argument.startsWith("-")) {
      positional.push(argument);
    }
  }
  return positional;
}

/** The repository configuration, or the usage failure for a configuration file that cannot be read. */
async function preparedConfig(
  command: string,
  demo: boolean,
  pathArgument: string,
  ctx: CommandContext,
): Promise<EvergreenConfig | number | undefined> {
  if (demo || command === "capabilities" || command === "data") return undefined;
  try {
    return await loadConfig(pathArgument);
  } catch (error) {
    if (error instanceof ConfigError) return ctx.fail("usage", error.message);
    throw error;
  }
}

/** The index of `--data-version` in `args` and the value it takes. */
function dataVersionOption(args: readonly string[]): { index: number; value: string | undefined } {
  const index = args.indexOf("--data-version");
  return { index, value: index === -1 ? undefined : args[index + 1] };
}

/** The data version the run uses: the flag, the configuration, the environment, or none. */
function activeDataPin(
  isUpdate: boolean,
  flag: string | undefined,
  config: EvergreenConfig | undefined,
): string | undefined {
  if (isUpdate) return undefined;
  return flag ?? config?.dataVersion ?? (process.env.EVERGREEN_DATA_VERSION || undefined);
}

/** Loading the pinned rule data, or the failure for a pin that is malformed or names nothing. */
async function pinnedData(
  command: string,
  isUpdate: boolean,
  dataPin: string | undefined,
  ctx: CommandContext,
): Promise<number | undefined> {
  if (command === "capabilities" || isUpdate) return undefined;
  configureActiveData(dataPin === undefined ? {} : { pinnedVersion: dataPin });
  try {
    await getActiveData();
  } catch (error) {
    if (error instanceof DataPinError) return ctx.fail(error.malformed ? "usage" : "data", error.message);
    throw error;
  }
  return undefined;
}

/** The `--data-version` value and the data it pins, or the failure that stops the command. */
async function dataPhase(
  command: string,
  args: readonly string[],
  config: EvergreenConfig | undefined,
  ctx: CommandContext,
): Promise<ReturnType<typeof dataVersionOption> | number> {
  const dataVersion = dataVersionOption(args);
  if (dataVersion.index !== -1 && (!dataVersion.value || dataVersion.value.startsWith("-"))) {
    return ctx.fail("usage", '--data-version needs a version, for example 2026.10.01, or "bundled".');
  }
  const isUpdate = command === "data" && args[1] === "update";
  const failure = await pinnedData(command, isUpdate, activeDataPin(isUpdate, dataVersion.value, config), ctx);
  return failure === undefined ? dataVersion : failure;
}

/** Option parsing, config loading, and the data pin. Returns an exit code when that setup fails. */
export async function prepare(
  command: string,
  commandArgs: readonly string[],
  ctx: CommandContext,
): Promise<Prepared | number> {
  const args = [command, ...commandArgs];
  const optionValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const optionValues = (name: string): string[] => {
    const values: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index + 1];
      if (args[index] === name && value !== undefined) {
        values.push(value);
        index += 1;
      }
    }
    return values;
  };
  const positional = positionalWords(args);
  const takesFindingId = command === "explain" || command === "context" || command === "report-issue";
  const findingId = takesFindingId ? positional[0] : undefined;
  const pathArgument = takesFindingId ? (positional[1] ?? ".") : command === "check" ? "." : (positional[0] ?? ".");
  const demo = args.includes("--demo");
  const config = await preparedConfig(command, demo, pathArgument, ctx);
  if (typeof config === "number") return config;
  const dataVersion = await dataPhase(command, args, config, ctx);
  if (typeof dataVersion === "number") return dataVersion;
  const formatIndex = args.indexOf("--format");
  const format = formatIndex === -1 ? undefined : args[formatIndex + 1];
  return {
    command,
    args,
    positional,
    findingId,
    pathArgument,
    demo,
    config,
    dataVersionFlag: dataVersion.value,
    dataVersionIndex: dataVersion.index,
    format,
    formatIndex,
    optionValue,
    optionValues,
  };
}

/** Every `--format` value the reporters know; anything else is a usage error for any command. */
const KNOWN_FORMATS = new Set([
  "text",
  "json",
  "markdown",
  "junit",
  "sarif",
  "rdjson",
  "codequality",
  "compact",
  "html",
  "slack",
  "teams",
  "webhook",
  "mermaid",
]);

/** The message a command with a narrow output set prints for a format outside it. */
// Maps, not objects: a plain object answers for inherited names such as `constructor`, so a lookup by user input needs a Map.
const COMMAND_FORMATS: ReadonlyMap<string, { readonly allowed: readonly string[]; readonly rejection: string }> =
  new Map([
    ["check", { allowed: ["text", "json"], rejection: "check supports --json and --format text|json only." }],
    [
      "check-snippet",
      { allowed: ["text", "json"], rejection: "check-snippet supports --json and --format text|json only." },
    ],
    ["receipt", { allowed: ["markdown", "json"], rejection: "receipt supports --format markdown|json only." }],
  ]);

/** Formats only `scan` renders, with the commands besides `scan` and `receipt` that take them too. */
const SCAN_ONLY_FORMATS: ReadonlyMap<string, readonly string[]> = new Map([
  ["markdown", []],
  ["junit", []],
  ["sarif", []],
  ["rdjson", []],
  ["codequality", []],
  ["compact", []],
  ["slack", []],
  ["teams", []],
  ["webhook", []],
  ["html", ["rollup"]],
]);

/** Formats whose list of commands is neither `scan` alone nor the scan set above. */
const FORMAT_COMMANDS: ReadonlyMap<string, { readonly commands: readonly string[]; readonly rejection: string }> =
  new Map([
    [
      "mermaid",
      {
        commands: ["scan", "forecast"],
        rejection: "--format mermaid is only available for the scan and forecast commands.",
      },
    ],
  ]);

/** Flags only `scan` accepts, and the message each prints for another command. */
const SCAN_ONLY_FLAGS: readonly { readonly taken: (state: Prepared) => boolean; readonly rejection: string }[] = [
  { taken: (state) => state.demo, rejection: "--demo is only available for the scan command." },
  {
    taken: (state) => state.args.includes("--write-status"),
    rejection: "--write-status is only available for the scan command.",
  },
  {
    taken: (state) => state.args.includes("--no-cache"),
    rejection: "--no-cache is only available for the scan command.",
  },
  {
    taken: (state) => hasSelectors(state),
    rejection: "--only and --exclude are only available for the scan command.",
  },
];

/** `--only` or `--exclude` anywhere in the arguments. */
function hasSelectors(state: Prepared): boolean {
  return state.optionValues("--only").length > 0 || state.optionValues("--exclude").length > 0;
}

/** The one usage rejection the first failing gate asks for, in the order the checks have always run. */
const USAGE_GATES: readonly ((state: Prepared) => string | undefined)[] = [
  (state) => {
    if (state.formatIndex === -1 || (state.format !== undefined && KNOWN_FORMATS.has(state.format))) return undefined;
    return `Unknown format: ${state.format ?? ""} (expected text, json, markdown, junit, sarif, rdjson, codequality, compact, html, slack, teams, webhook, or mermaid).`;
  },
  (state) => {
    const rule = COMMAND_FORMATS.get(state.command);
    return rule && state.format !== undefined && !rule.allowed.includes(state.format) ? rule.rejection : undefined;
  },
  (state) => {
    const { format } = state;
    if (format === undefined || state.command === "scan" || state.command === "receipt") return undefined;
    const extra = SCAN_ONLY_FORMATS.get(format);
    if (extra === undefined) return undefined;
    if (extra.includes(state.command)) return undefined;
    return `--format ${format} is only available for the scan command.`;
  },
  (state) => {
    const rule = state.format === undefined ? undefined : FORMAT_COMMANDS.get(state.format);
    return rule && !rule.commands.includes(state.command) ? rule.rejection : undefined;
  },
  (state) => SCAN_ONLY_FLAGS.find((flag) => flag.taken(state) && state.command !== "scan")?.rejection,
];

/** The `--only`/`--exclude` document, or `undefined` when the scan is unfiltered. */
function scanSelection(only: string[], exclude: string[]): ScanSelection | undefined {
  if (only.length === 0 && exclude.length === 0) return undefined;
  return { ...(only.length > 0 ? { only } : {}), ...(exclude.length > 0 ? { exclude } : {}) };
}

/** Format and scan-only flag checks that used to run before any of the later commands. */
export async function sharedGates(state: Prepared, ctx: CommandContext): Promise<Gated | number> {
  const rejection = USAGE_GATES.map((gate) => gate(state)).find((message) => message !== undefined);
  if (rejection !== undefined) return ctx.fail("usage", rejection);
  const only = state.optionValues("--only");
  const exclude = state.optionValues("--exclude");
  const selection = scanSelection(only, exclude);
  if (selection) {
    const invalid = await unknownSelectors([...only, ...exclude]);
    if (invalid.length > 0)
      return ctx.fail(
        "usage",
        `Unknown selector: ${invalid.join(", ")}. Use an ecosystem or a rule-id prefix (for example npm.package.request).`,
        `\n${await selectorValuesSummary()}\n`,
      );
  }
  const json = state.args.includes("--json") || state.format === "json";
  const noCache = state.args.includes("--no-cache") || process.env.EVERGREEN_NO_CACHE === "1";
  return { ...state, json, noCache, selection };
}

/** The index of `--all` in `args` and the directory it names. */
function allDirectoriesOption(args: readonly string[]): { index: number; directory: string | undefined } {
  const index = args.indexOf("--all");
  return { index, directory: index === -1 ? undefined : args[index + 1] };
}

type AllDirectories = ReturnType<typeof allDirectoriesOption>;

/** The `--all` and `--demo` combinations that cannot mean one scan, in the order the command refuses them. */
function repositoryFlagProblem(state: Gated, all: AllDirectories, ctx: CommandContext): number | undefined {
  const { command, args, demo, positional } = state;
  if (all.index !== -1 && (command !== "scan" || !all.directory || all.directory.startsWith("-"))) {
    return ctx.fail("usage", "--all needs a directory of repositories and is only available for the scan command.");
  }
  if (demo && all.index !== -1) return ctx.fail("usage", "--all is not available with --demo.");
  if (demo && positional.length > 0) return ctx.fail("usage", "--demo does not take a path argument.");
  if (demo && (args.includes("--baseline") || args.includes("--write-status"))) {
    return ctx.fail("usage", "--baseline and --write-status are not available with --demo.");
  }
  return undefined;
}

/** Several paths, or every repository under `--all`, scanned and printed as one document. */
async function multiScanPhase(state: Gated, allDirectory: string | undefined, ctx: CommandContext): Promise<number> {
  if (state.format !== undefined && state.format !== "text" && state.format !== "json") {
    return ctx.fail("usage", "Scanning several paths supports --json and --format text|json only.");
  }
  if (state.args.includes("--baseline") || state.args.includes("--write-status")) {
    return ctx.fail("usage", "--baseline and --write-status are not available when scanning several paths.");
  }
  let found: string[] = [];
  if (allDirectory !== undefined) {
    try {
      found = await findRepositories(allDirectory);
    } catch (error) {
      return ctx.fail(
        "usage",
        `Cannot read ${allDirectory}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const paths = [...state.positional, ...found];
  if (paths.length === 0) return ctx.fail("usage", `No Git repositories found in ${allDirectory}.`);
  const multi = await scanProjects(paths, builtInDetectors, { noCache: state.noCache });
  const selection = state.selection;
  if (selection) {
    multi.projects = multi.projects.map((project) => {
      const result = applyScanSelection(project.result, selection);
      return { ...project, findings: result.findings.length, result };
    });
    multi.total = {
      projects: multi.projects.length,
      findings: multi.projects.reduce((sum, project) => sum + project.findings, 0),
    };
  }
  process.stdout.write(`${state.json ? JSON.stringify(multi, null, 2) : renderMultiScanText(multi)}\n`);
  return 0;
}

/** `--all`, `--demo`, and the repository-root check. A multi-path scan is handled here and returns its exit code. */
export async function repositoryPhase(state: Gated, ctx: CommandContext): Promise<number | undefined> {
  const all = allDirectoriesOption(state.args);
  const refusal = repositoryFlagProblem(state, all, ctx);
  if (refusal !== undefined) return refusal;
  if (state.command === "scan" && (state.positional.length > 1 || all.directory !== undefined)) {
    return multiScanPhase(state, all.directory, ctx);
  }
  if (!state.demo) {
    const rootProblem = await repositoryRootProblem(state.pathArgument);
    if (rootProblem) return ctx.failActionable("usage", rootProblem);
  }
  return undefined;
}

/** Scan severity gate syntax and `--as-of` / `--today`, checked before forecast, countdown, plan, fix, and the scan family. */
export function preScanPhase(state: Gated, ctx: CommandContext): number | undefined {
  const scanGate = state.optionValue("--fail-on") ?? state.config?.failOn ?? "none";
  if (state.command === "scan" && scanGate !== "none" && !severityValues.includes(scanGate as Severity)) {
    return ctx.fail(
      "usage",
      `Unknown severity for --fail-on: ${scanGate} (expected none, ${severityValues.join(", ")}).`,
    );
  }
  const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");
  if (asOfValue !== undefined && !isIsoDate(asOfValue)) {
    return ctx.fail("usage", "--as-of (or --today) must be a date (YYYY-MM-DD).");
  }
  return undefined;
}

export async function afterGates(
  command: string,
  args: readonly string[],
  ctx: CommandContext,
  handler: (state: Gated) => Promise<number>,
): Promise<number> {
  const prepared = await prepare(command, args, ctx);
  if (typeof prepared === "number") return prepared;
  const gated = await sharedGates(prepared, ctx);
  if (typeof gated === "number") return gated;
  return handler(gated);
}

export async function withPrepared(
  command: string,
  args: readonly string[],
  ctx: CommandContext,
  handler: (state: Prepared) => Promise<number>,
): Promise<number> {
  const prepared = await prepare(command, args, ctx);
  if (typeof prepared === "number") return prepared;
  return handler(prepared);
}

/** scan, baseline, explain, context, and report-issue share one scan and then branch. */
export async function runScanPipeline(command: string, args: readonly string[], ctx: CommandContext): Promise<number> {
  const prepared = await prepare(command, args, ctx);
  if (typeof prepared === "number") return prepared;
  const gated = await sharedGates(prepared, ctx);
  if (typeof gated === "number") return gated;
  const takesFindingId = command === "explain" || command === "context" || command === "report-issue";
  if (takesFindingId && !gated.findingId) return ctx.fail("usage", "Missing finding ID.", `\n${ctx.help}`);
  const early = await repositoryPhase(gated, ctx);
  if (early !== undefined) return early;
  const pre = preScanPhase(gated, ctx);
  if (pre !== undefined) return pre;
  return runScanFamily(gated, ctx);
}

async function runScanFamily(state: Gated, ctx: CommandContext): Promise<number> {
  const scanned = await scanWithFilters(state, ctx);
  if (typeof scanned === "number") return scanned;
  const { result, asOfValue } = scanned;
  if (state.command === "baseline") return writeBaselineFile(state, result);
  const suppressed = await suppressFromBaselines(state, result, asOfValue, ctx);
  if (typeof suppressed === "number") return suppressed;
  const early = await printFindings(state, suppressed.result, asOfValue, ctx);
  if (early !== undefined) return early;
  if (suppressed.expiredFailure) {
    return ctx.fail("policy", "Failing because a baseline suppression has expired (--on-expired fail).");
  }
  return failOnSeverity(state, suppressed.result, ctx);
}

/** The scan every `scan`-family command reads, with the date, support, ignore, and selector filters in that order. */
async function scanWithFilters(
  state: Gated,
  ctx: CommandContext,
): Promise<{ result: ScanResult; asOfValue: string | undefined } | number> {
  const minSupportValue = state.optionValue("--min-support-days");
  const minSupportDays = minSupportValue === undefined ? undefined : parseMinSupportDays(minSupportValue);
  if (minSupportValue !== undefined && minSupportDays === undefined) {
    return ctx.fail("usage", "--min-support-days must be a whole number of days (0 to 3650).");
  }
  const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");
  let result = state.demo
    ? await scanDemo(builtInDetectors)
    : await scanWithBuiltIns(state.pathArgument, { noCache: state.noCache });
  if (asOfValue !== undefined) result = await applyAsOf(result, asOfValue);
  if (minSupportDays !== undefined)
    result = applyMinSupport(result, minSupportDays, asOfValue ?? new Date().toISOString().slice(0, 10));
  const ignorePatterns = state.args.includes("--ignore")
    ? state.optionValues("--ignore")
    : (state.config?.ignore ?? []);
  if (ignorePatterns.length > 0) result = applyIgnore(result, ignorePatterns);
  if (state.selection) result = applyScanSelection(result, state.selection);
  return { result, asOfValue };
}

/** `baseline`: writes the current findings as suppressions, carrying the history of the file it replaces. */
async function writeBaselineFile(state: Gated, result: ScanResult): Promise<number> {
  const output = resolve(state.optionValue("--output") ?? ".evergreen-baseline.json");
  // A missing or unreadable earlier file just means there is no history to carry forward.
  const previous = await readBaseline(output).catch(() => undefined);
  const baseline = createBaseline(
    result,
    {},
    previous ?? {
      schemaVersion: "evergreen.baseline.v1",
      createdAt: "",
      findings: [],
    },
  );
  await writeBaseline(output, baseline);
  process.stdout.write(
    `Wrote ${baseline.findings.length} findings to ${output}\n${debtTrendLine(baseline.history ?? [])}\n`,
  );
  return 0;
}

/** `--baseline`: the suppressed result and whether an expired suppression must fail the run. */
async function suppressFromBaselines(
  state: Gated,
  result: ScanResult,
  asOfValue: string | undefined,
  ctx: CommandContext,
): Promise<{ result: ScanResult; expiredFailure: boolean } | number> {
  const paths = state.args.includes("--baseline") ? state.optionValues("--baseline") : (state.config?.baseline ?? []);
  if (paths.length === 0) return { result, expiredFailure: false };
  const today = asOfValue ?? new Date().toISOString().slice(0, 10);
  const warnValue = state.optionValue("--baseline-warn-days");
  const warnWithinDays = warnValue === undefined ? DEFAULT_WARN_DAYS : Number(warnValue);
  const onExpired = (state.optionValue("--on-expired") ?? "resurface") as ExpiredPolicy;
  if (
    !isIsoDate(today) ||
    !Number.isInteger(warnWithinDays) ||
    warnWithinDays < 0 ||
    warnWithinDays > 365 ||
    !expiredPolicies.includes(onExpired)
  ) {
    return ctx.fail(
      "usage",
      `--today must be a date (YYYY-MM-DD), --baseline-warn-days a whole number from 0 to 365, and --on-expired one of ${expiredPolicies.join(", ")}.`,
    );
  }
  let baseline: Awaited<ReturnType<typeof readBaselines>>;
  try {
    baseline = await readBaselines(paths.map((path) => resolve(path)));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return ctx.failActionable("parse", invalidConfig(detail));
  }
  const evaluated = evaluateBaseline(result, baseline, { today, warnWithinDays, onExpired });
  return { result: evaluated.result, expiredFailure: expiredSuppressionsFail(onExpired, evaluated.expired) };
}

/** What the command prints. A number is the exit code for the whole run; `undefined` means the gates still apply. */
async function printFindings(
  state: Gated,
  result: ScanResult,
  asOfValue: string | undefined,
  ctx: CommandContext,
): Promise<number | undefined> {
  if (state.command === "context") return printContextPacket(state, result, ctx);
  if (state.command === "report-issue") return printIssueReport(state, result, ctx);
  if (state.command === "explain") return printExplainedFinding(state, result, ctx);
  const { args, json, format } = state;
  if (args.includes("--interactive") && !json && format === "text" && canBrowse(process.stdin, process.stdout)) {
    await browseFindings(result, { input: process.stdin, output: process.stdout });
    return undefined;
  }
  if (state.command === "scan" && args.includes("--by-owner")) return printByOwner(state, result, ctx);
  const output = await renderScanReport(state, result, asOfValue);
  process.stdout.write(`${output}\n`);
  if (!args.includes("--write-status")) return undefined;
  const statusRoot = resolve(state.pathArgument);
  await writeStatusFile(statusRoot, result);
  process.stderr.write(`Wrote ${STATUS_FILE_NAME} in ${statusRoot}.\n`);
  return undefined;
}

/** `context`: the migration packet for the one finding named on the command line. */
async function printContextPacket(state: Gated, result: ScanResult, ctx: CommandContext): Promise<number | undefined> {
  try {
    // findingId is required for context; runScanPipeline rejects a missing id before this runs.
    const packet = createMigrationPacket(
      result,
      requireFindingId(state.findingId),
      await bundledRules(),
      await readPinnedRuntimes(result.root),
    );
    process.stdout.write(`${state.json ? JSON.stringify(packet, null, 2) : renderMigrationPacketText(packet)}\n`);
  } catch (error) {
    return ctx.fail("data", error instanceof Error ? error.message : String(error));
  }
  return undefined;
}

/** `report-issue`: the issue text, printed or written where the user can review it. */
async function printIssueReport(state: Gated, result: ScanResult, ctx: CommandContext): Promise<number | undefined> {
  const finding = result.findings.find((candidate) => candidate.id === state.findingId);
  if (!finding) return ctx.fail("data", `Finding not found: ${state.findingId}`);
  try {
    const report = await createIssueReport(state.pathArgument, finding);
    const output = state.optionValue("--output");
    if (!output) {
      process.stdout.write(`${report}\n`);
      return undefined;
    }
    const destination = resolve(output);
    await writeFile(destination, report);
    process.stdout.write(
      `Wrote the report to ${destination}. Review it before you open an issue; Evergreen never opens one.\n`,
    );
  } catch (error) {
    if (error instanceof ReportIssueError) return ctx.fail("data", error.message);
    throw error;
  }
  return undefined;
}

/** `explain`: the one finding named on the command line, as text or as the JSON document. */
function printExplainedFinding(state: Gated, result: ScanResult, ctx: CommandContext): number | undefined {
  const finding = result.findings.find((candidate) => candidate.id === state.findingId);
  if (!finding) return ctx.fail("data", `Finding not found: ${state.findingId}`);
  process.stdout.write(`${state.json ? JSON.stringify(finding, null, 2) : renderFindingText(finding)}\n`);
  return undefined;
}

/** `--by-owner`: the findings grouped by the CODEOWNER of each affected file. */
async function printByOwner(state: Gated, result: ScanResult, ctx: CommandContext): Promise<number | undefined> {
  const { format, json } = state;
  if (format !== undefined && format !== "text" && format !== "json")
    return ctx.fail("usage", "--by-owner supports --json and --format text|json only.");
  const groups = await groupScanByOwner(result);
  process.stdout.write(`${json ? JSON.stringify(groups, null, 2) : renderOwnerGroupsText(groups)}\n`);
  return undefined;
}

/** The scan renders these from the findings alone. */
const SCAN_RENDERERS: ReadonlyMap<string, (result: ScanResult) => string> = new Map([
  ["sarif", renderSarif],
  ["rdjson", renderRdjson],
  ["codequality", renderCodeQuality],
  ["compact", renderCompact],
  ["markdown", renderMarkdown],
  ["junit", renderJunit],
  ["slack", renderSlack],
  ["teams", renderTeams],
  ["webhook", renderWebhook],
]);

/** The scan report in the format asked for; text and JSON are the fallback. */
async function renderScanReport(state: Gated, result: ScanResult, asOfValue: string | undefined): Promise<string> {
  const { format, json, command } = state;
  const render = format === undefined ? undefined : SCAN_RENDERERS.get(format);
  if (render) return render(result);
  const asOf = asOfValue ?? new Date().toISOString().slice(0, 10);
  if (format === "html")
    return renderHtml(result, {
      // Only the shareable HTML report carries a forecast; building it would otherwise slow every other format down.
      forecast: command === "scan" ? buildForecast(result, await bundledRules(), asOf) : undefined,
    });
  if (format === "mermaid") return renderScanMermaid(result, asOf);
  if (json) return renderJson(result);
  return renderText(result, { firstRun: command === "scan" && !(await hasPersonalConfig()) });
}

/** `--fail-on`: the policy gate on the scan's own severity floor. */
function failOnSeverity(state: Gated, result: ScanResult, ctx: CommandContext): number {
  if (state.command !== "scan") return 0;
  const scanGate = state.optionValue("--fail-on") ?? state.config?.failOn ?? "none";
  if (scanGate === "none") return 0;
  const floor = severityValues.indexOf(scanGate as Severity);
  const blocking = result.findings.filter((finding) => severityValues.indexOf(finding.severity) >= floor);
  if (blocking.length === 0) return 0;
  return ctx.fail(
    "policy",
    `${blocking.length} finding${blocking.length === 1 ? "" : "s"} at ${scanGate} or above (--fail-on ${scanGate}).`,
  );
}

/** Context always has a finding id by the time runScanFamily runs; this keeps TypeScript aligned. */
function requireFindingId(findingId: string | undefined): string {
  if (findingId === undefined) throw new Error("Missing finding ID.");
  return findingId;
}

/** Returns why `path` cannot be scanned as a repository root, or undefined when it is an existing directory. */
export async function repositoryRootProblem(path: string): Promise<ActionableMessage | undefined> {
  try {
    return (await stat(path)).isDirectory() ? undefined : unreadablePath(path, "not-directory");
  } catch (error) {
    return unreadablePath(path, (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable");
  }
}
