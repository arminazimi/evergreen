import { stat, writeFile } from "node:fs/promises";
import process from "node:process";
import { resolve } from "node:path";

import { applyAsOf } from "../as-of.js";
import { DEFAULT_WARN_DAYS, createBaseline, debtTrendLine, evaluateBaseline, expiredPolicies, expiredSuppressionsFail, readBaseline, readBaselines, writeBaseline } from "../baseline.js";
import type { ExpiredPolicy } from "../baseline.js";
import { bundledRules } from "../check-dependency.js";
import { groupScanByOwner, renderOwnerGroupsText } from "../codeowners.js";
import { applyIgnore, ConfigError, loadConfig } from "../config.js";
import type { EvergreenConfig } from "../config.js";
import { configureActiveData, DataPinError, getActiveData } from "../data-source.js";
import { scanDemo } from "../demo.js";
import { builtInDetectors } from "../detectors/index.js";
import type { ScanSelection, Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { applyScanSelection, findRepositories, renderMultiScanText, scanProjects, scanRepository } from "../engine.js";
import { invalidConfig, renderActionable, unreadablePath, type ActionableMessage } from "../errors.js";
import { buildForecast } from "../forecast.js";
import { hasPersonalConfig } from "../init-personal.js";
import { applyMinSupport, parseMinSupportDays } from "../min-support.js";
import { createMigrationPacket } from "../migration-packet.js";
import { readPinnedRuntimes } from "../runtime-pin.js";
import { isIsoDate } from "../registry.js";
import { createIssueReport, ReportIssueError } from "../report-issue.js";
import { renderCodeQuality, renderCompact, renderFindingText, renderHtml, renderJson, renderJunit, renderMarkdown, renderMigrationPacketText, renderRdjson, renderSarif, renderScanMermaid, renderSlack, renderTeams, renderText, renderWebhook } from "../reporters.js";
import { STATUS_FILE_NAME, writeStatusFile } from "../status-file.js";
import { browseFindings, canBrowse } from "../tui.js";
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

export function createCommandContext(rawArgs: readonly string[], help: string): CommandContext {
  const args = rawArgs.filter((argument) => argument !== "--debug");
  const formatValue = args[args.indexOf("--format") + 1];
  const jsonErrors = args.includes("--json") || (args.includes("--format") && formatValue === "json");
  const ctx: CommandContext = {
    jsonErrors,
    debug: rawArgs.includes("--debug"),
    help,
    exitCodes: EXIT_CODES,
    fail(kind, message, appendix = "") {
      process.stderr.write(`${message}\n${appendix}`);
      if (jsonErrors && kind !== "policy") {
        const document = { schemaVersion: "evergreen.error.v1", error: { code: kind, exitCode: EXIT_CODES[kind], message } };
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

/** Option parsing, config loading, and the data pin. Returns an exit code when that setup fails. */
export async function prepare(command: string, commandArgs: readonly string[], ctx: CommandContext): Promise<Prepared | number> {
  const args = [command, ...commandArgs];
  const optionValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const optionValues = (name: string): string[] => {
    const values: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === name && args[index + 1] !== undefined) {
        values.push(args[index + 1]!);
        index += 1;
      }
    }
    return values;
  };
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

  const takesFindingId = command === "explain" || command === "context" || command === "report-issue";
  const findingId = takesFindingId ? positional[0] : undefined;
  const pathArgument = takesFindingId ? (positional[1] ?? ".") : command === "check" ? "." : (positional[0] ?? ".");
  const demo = args.includes("--demo");

  let config: EvergreenConfig | undefined;
  if (!demo && command !== "capabilities" && command !== "data") {
    try {
      config = await loadConfig(pathArgument);
    } catch (error) {
      if (error instanceof ConfigError) return ctx.fail("usage", error.message);
      throw error;
    }
  }

  const dataVersionIndex = args.indexOf("--data-version");
  const dataVersionFlag = dataVersionIndex === -1 ? undefined : args[dataVersionIndex + 1];
  if (dataVersionIndex !== -1 && (!dataVersionFlag || dataVersionFlag.startsWith("-"))) {
    return ctx.fail("usage", "--data-version needs a version, for example 2026.10.01, or \"bundled\".");
  }
  const isUpdate = command === "data" && args[1] === "update";
  const dataPin = isUpdate ? undefined : (dataVersionFlag ?? config?.dataVersion ?? (process.env.EVERGREEN_DATA_VERSION || undefined));
  if (command !== "capabilities" && !isUpdate) {
    configureActiveData(dataPin === undefined ? {} : { pinnedVersion: dataPin });
    try {
      await getActiveData();
    } catch (error) {
      if (error instanceof DataPinError) return ctx.fail(error.malformed ? "usage" : "data", error.message);
      throw error;
    }
  }
  const formatIndex = args.indexOf("--format");
  const format = formatIndex === -1 ? undefined : args[formatIndex + 1];
  return { command, args, positional, findingId, pathArgument, demo, config, dataVersionFlag, dataVersionIndex, format, formatIndex, optionValue, optionValues };
}

/** Format and scan-only flag checks that used to run before any of the later commands. */
export async function sharedGates(state: Prepared, ctx: CommandContext): Promise<Gated | number> {
  const { command, args, format, formatIndex } = state;
  if (formatIndex !== -1 && format !== "text" && format !== "json" && format !== "markdown" && format !== "junit" && format !== "sarif" && format !== "rdjson" && format !== "codequality" && format !== "compact" && format !== "html" && format !== "slack" && format !== "teams" && format !== "webhook" && format !== "mermaid") {
    return ctx.fail("usage", `Unknown format: ${format ?? ""} (expected text, json, markdown, junit, sarif, rdjson, codequality, compact, html, slack, teams, webhook, or mermaid).`);
  }
  if (command === "check" && format !== undefined && format !== "json" && format !== "text") {
    return ctx.fail("usage", "check supports --json and --format text|json only.");
  }
  if (command === "check-snippet" && format !== undefined && format !== "json" && format !== "text") {
    return ctx.fail("usage", "check-snippet supports --json and --format text|json only.");
  }
  if (command === "receipt" && format !== undefined && format !== "markdown" && format !== "json") {
    return ctx.fail("usage", "receipt supports --format markdown|json only.");
  }
  if ((format === "markdown" || format === "junit" || format === "sarif" || format === "rdjson" || format === "codequality" || format === "compact" || (format === "html" && command !== "rollup") || format === "slack" || format === "teams" || format === "webhook") && command !== "scan" && command !== "receipt") {
    return ctx.fail("usage", `--format ${format} is only available for the scan command.`);
  }
  if (format === "mermaid" && command !== "scan" && command !== "forecast") {
    return ctx.fail("usage", "--format mermaid is only available for the scan and forecast commands.");
  }
  if (state.demo && command !== "scan") {
    return ctx.fail("usage", "--demo is only available for the scan command.");
  }
  const json = args.includes("--json") || format === "json";
  if (args.includes("--write-status") && command !== "scan") {
    return ctx.fail("usage", "--write-status is only available for the scan command.");
  }
  if (args.includes("--no-cache") && command !== "scan") {
    return ctx.fail("usage", "--no-cache is only available for the scan command.");
  }
  const noCache = args.includes("--no-cache") || process.env.EVERGREEN_NO_CACHE === "1";
  const onlySelectors = state.optionValues("--only");
  const excludeSelectors = state.optionValues("--exclude");
  if ((onlySelectors.length > 0 || excludeSelectors.length > 0) && command !== "scan") {
    return ctx.fail("usage", "--only and --exclude are only available for the scan command.");
  }
  const selection: ScanSelection | undefined =
    onlySelectors.length > 0 || excludeSelectors.length > 0
      ? { ...(onlySelectors.length > 0 ? { only: onlySelectors } : {}), ...(excludeSelectors.length > 0 ? { exclude: excludeSelectors } : {}) }
      : undefined;
  if (selection) {
    const known = await selectorValues();
    const invalid = [...new Set([...onlySelectors, ...excludeSelectors])].filter((value) => !known.has(value) || value === "" || value.startsWith("-"));
    if (invalid.length > 0) {
      return ctx.fail("usage", `Unknown selector: ${invalid.join(", ")}. Use an ecosystem or a rule-id prefix (for example npm.package.request).`, `\n${await selectorValuesSummary()}\n`);
    }
  }
  return { ...state, json, noCache, selection };
}

/** `--all`, `--demo`, and the repository-root check. A multi-path scan is handled here and returns its exit code. */
export async function repositoryPhase(state: Gated, ctx: CommandContext): Promise<number | undefined> {
  const { command, args, positional, demo, json, noCache, selection } = state;
  const allIndex = args.indexOf("--all");
  const allDirectory = allIndex === -1 ? undefined : args[allIndex + 1];
  if (allIndex !== -1 && (command !== "scan" || !allDirectory || allDirectory.startsWith("-"))) {
    return ctx.fail("usage", "--all needs a directory of repositories and is only available for the scan command.");
  }
  if (demo && allIndex !== -1) return ctx.fail("usage", "--all is not available with --demo.");
  if (demo && positional.length > 0) return ctx.fail("usage", "--demo does not take a path argument.");
  if (demo && (args.includes("--baseline") || args.includes("--write-status"))) {
    return ctx.fail("usage", "--baseline and --write-status are not available with --demo.");
  }
  if (command === "scan" && (positional.length > 1 || allDirectory !== undefined)) {
    if (state.format !== undefined && state.format !== "text" && state.format !== "json") {
      return ctx.fail("usage", "Scanning several paths supports --json and --format text|json only.");
    }
    if (args.includes("--baseline") || args.includes("--write-status")) {
      return ctx.fail("usage", "--baseline and --write-status are not available when scanning several paths.");
    }
    let found: string[] = [];
    if (allDirectory !== undefined) {
      try {
        found = await findRepositories(allDirectory);
      } catch (error) {
        return ctx.fail("usage", `Cannot read ${allDirectory}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const paths = [...positional, ...found];
    if (paths.length === 0) return ctx.fail("usage", `No Git repositories found in ${allDirectory}.`);
    const multi = await scanProjects(paths, builtInDetectors, { noCache });
    if (selection) {
      multi.projects = multi.projects.map((project) => {
        const result = applyScanSelection(project.result, selection);
        return { ...project, findings: result.findings.length, result };
      });
      multi.total = { projects: multi.projects.length, findings: multi.projects.reduce((sum, project) => sum + project.findings, 0) };
    }
    process.stdout.write(`${json ? JSON.stringify(multi, null, 2) : renderMultiScanText(multi)}\n`);
    return 0;
  }
  if (!demo) {
    const rootProblem = await repositoryRootProblem(state.pathArgument);
    if (rootProblem) return ctx.failActionable("usage", rootProblem);
  }
  return undefined;
}

/** Scan severity gate syntax and `--as-of` / `--today`, checked before forecast, countdown, plan, fix, and the scan family. */
export function preScanPhase(state: Gated, ctx: CommandContext): number | undefined {
  const scanGate = state.optionValue("--fail-on") ?? state.config?.failOn ?? "none";
  if (state.command === "scan" && scanGate !== "none" && !severityValues.includes(scanGate as Severity)) {
    return ctx.fail("usage", `Unknown severity for --fail-on: ${scanGate} (expected none, ${severityValues.join(", ")}).`);
  }
  const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");
  if (asOfValue !== undefined && !isIsoDate(asOfValue)) {
    return ctx.fail("usage", "--as-of (or --today) must be a date (YYYY-MM-DD).");
  }
  return undefined;
}

export async function afterGates(command: string, args: readonly string[], ctx: CommandContext, handler: (state: Gated) => Promise<number>): Promise<number> {
  const prepared = await prepare(command, args, ctx);
  if (typeof prepared === "number") return prepared;
  const gated = await sharedGates(prepared, ctx);
  if (typeof gated === "number") return gated;
  return handler(gated);
}

export async function withPrepared(command: string, args: readonly string[], ctx: CommandContext, handler: (state: Prepared) => Promise<number>): Promise<number> {
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
  const { command, args, pathArgument, demo, config, json, noCache, selection, findingId, format } = state;
  const minSupportValue = state.optionValue("--min-support-days");
  const minSupportDays = minSupportValue === undefined ? undefined : parseMinSupportDays(minSupportValue);
  if (minSupportValue !== undefined && minSupportDays === undefined) {
    return ctx.fail("usage", "--min-support-days must be a whole number of days (0 to 3650).");
  }
  const cliIgnore = state.optionValues("--ignore");
  const ignorePatterns = args.includes("--ignore") ? cliIgnore : (config?.ignore ?? []);
  const asOfValue = state.optionValue("--as-of") ?? state.optionValue("--today");

  let result = demo ? await scanDemo(builtInDetectors) : await scanRepository(pathArgument, builtInDetectors, { noCache });
  if (asOfValue !== undefined) result = await applyAsOf(result, asOfValue);
  if (minSupportDays !== undefined) result = applyMinSupport(result, minSupportDays, asOfValue ?? new Date().toISOString().slice(0, 10));
  if (ignorePatterns.length > 0) result = applyIgnore(result, ignorePatterns);
  if (selection) result = applyScanSelection(result, selection);
  if (command === "baseline") {
    const output = resolve(state.optionValue("--output") ?? ".evergreen-baseline.json");
    // A missing or unreadable earlier file just means there is no history to carry forward.
    const previous = await readBaseline(output).catch(() => undefined);
    const baseline = createBaseline(result, {}, previous ?? {
      schemaVersion: "evergreen.baseline.v1",
      createdAt: "",
      findings: [],
    });
    await writeBaseline(output, baseline);
    process.stdout.write(`Wrote ${baseline.findings.length} findings to ${output}\n${debtTrendLine(baseline.history ?? [])}\n`);
    return 0;
  }
  let baselineExpiredFailure = false;
  const cliBaselinePaths = state.optionValues("--baseline");
  const baselinePaths = args.includes("--baseline") ? cliBaselinePaths : (config?.baseline ?? []);
  if (baselinePaths.length > 0) {
    const today = asOfValue ?? new Date().toISOString().slice(0, 10);
    const warnValue = state.optionValue("--baseline-warn-days");
    const warnWithinDays = warnValue === undefined ? DEFAULT_WARN_DAYS : Number(warnValue);
    const onExpired = (state.optionValue("--on-expired") ?? "resurface") as ExpiredPolicy;
    if (!isIsoDate(today) || !Number.isInteger(warnWithinDays) || warnWithinDays < 0 || warnWithinDays > 365 || !expiredPolicies.includes(onExpired)) {
      return ctx.fail("usage", `--today must be a date (YYYY-MM-DD), --baseline-warn-days a whole number from 0 to 365, and --on-expired one of ${expiredPolicies.join(", ")}.`);
    }
    let baseline: Awaited<ReturnType<typeof readBaselines>>;
    try {
      baseline = await readBaselines(baselinePaths.map((path) => resolve(path)));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return ctx.failActionable("parse", invalidConfig(detail));
    }
    const evaluated = evaluateBaseline(result, baseline, { today, warnWithinDays, onExpired });
    result = evaluated.result;
    baselineExpiredFailure = expiredSuppressionsFail(onExpired, evaluated.expired);
  }
  if (command === "context") {
    try {
      const packet = createMigrationPacket(result, findingId!, await bundledRules(), await readPinnedRuntimes(result.root));
      process.stdout.write(`${json ? JSON.stringify(packet, null, 2) : renderMigrationPacketText(packet)}\n`);
    } catch (error) {
      return ctx.fail("data", error instanceof Error ? error.message : String(error));
    }
  } else if (command === "report-issue") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) return ctx.fail("data", `Finding not found: ${findingId}`);
    try {
      const report = await createIssueReport(pathArgument, finding);
      const output = state.optionValue("--output");
      if (output) {
        const destination = resolve(output);
        await writeFile(destination, report);
        process.stdout.write(`Wrote the report to ${destination}. Review it before you open an issue; Evergreen never opens one.\n`);
      } else {
        process.stdout.write(`${report}\n`);
      }
    } catch (error) {
      if (error instanceof ReportIssueError) return ctx.fail("data", error.message);
      throw error;
    }
  } else if (command === "explain") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) return ctx.fail("data", `Finding not found: ${findingId}`);
    process.stdout.write(`${json ? JSON.stringify(finding, null, 2) : renderFindingText(finding)}\n`);
  } else if (args.includes("--interactive") && !json && format === "text" && canBrowse(process.stdin, process.stdout)) {
    await browseFindings(result, { input: process.stdin, output: process.stdout });
  } else if (command === "scan" && args.includes("--by-owner")) {
    if (format !== undefined && format !== "text" && format !== "json") return ctx.fail("usage", "--by-owner supports --json and --format text|json only.");
    const groups = await groupScanByOwner(result);
    process.stdout.write(`${json ? JSON.stringify(groups, null, 2) : renderOwnerGroupsText(groups)}\n`);
  } else {
    // Only the shareable HTML report carries a forecast; building it would otherwise slow every other format down.
    const forecast = format === "html" && command === "scan"
      ? buildForecast(result, await bundledRules(), asOfValue ?? new Date().toISOString().slice(0, 10))
      : undefined;
    const output = format === "sarif" ? renderSarif(result) : format === "rdjson" ? renderRdjson(result) : format === "codequality" ? renderCodeQuality(result) : format === "compact" ? renderCompact(result) : format === "html" ? renderHtml(result, { forecast }) : format === "markdown" ? renderMarkdown(result) : format === "junit" ? renderJunit(result) : format === "slack" ? renderSlack(result) : format === "teams" ? renderTeams(result) : format === "webhook" ? renderWebhook(result) : format === "mermaid" ? renderScanMermaid(result, asOfValue ?? new Date().toISOString().slice(0, 10)) : json ? renderJson(result) : renderText(result, { firstRun: command === "scan" && !(await hasPersonalConfig()) });
    process.stdout.write(`${output}\n`);
    if (args.includes("--write-status")) {
      const statusRoot = resolve(pathArgument);
      await writeStatusFile(statusRoot, result);
      process.stderr.write(`Wrote ${STATUS_FILE_NAME} in ${statusRoot}.\n`);
    }
  }
  if (baselineExpiredFailure) {
    return ctx.fail("policy", "Failing because a baseline suppression has expired (--on-expired fail).");
  }
  const scanGate = state.optionValue("--fail-on") ?? config?.failOn ?? "none";
  if (command === "scan" && scanGate !== "none") {
    const blocking = result.findings.filter((finding) => severityValues.indexOf(finding.severity) >= severityValues.indexOf(scanGate as Severity));
    if (blocking.length > 0) return ctx.fail("policy", `${blocking.length} finding${blocking.length === 1 ? "" : "s"} at ${scanGate} or above (--fail-on ${scanGate}).`);
  }
  return 0;
}

/** Returns why `path` cannot be scanned as a repository root, or undefined when it is an existing directory. */
export async function repositoryRootProblem(path: string): Promise<ActionableMessage | undefined> {
  try {
    return (await stat(path)).isDirectory() ? undefined : unreadablePath(path, "not-directory");
  } catch (error) {
    return unreadablePath(path, (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unreadable");
  }
}

/** Valid `--only`/`--exclude` values: ecosystem ids, rule ids, and their dotted prefixes. */
async function selectorValues(): Promise<Set<string>> {
  const values = new Set<string>(builtInDetectors.map((detector) => detector.id));
  for (const rule of await bundledRules()) {
    const parts = rule.id.split(".");
    for (let index = 1; index <= parts.length; index += 1) values.add(parts.slice(0, index).join("."));
  }
  return values;
}

/** Lists the ecosystems and rule-id families a selector may name, for the unknown-selector error. */
async function selectorValuesSummary(): Promise<string> {
  const ecosystems = builtInDetectors.map((detector) => detector.id).sort();
  const prefixes = [...new Set((await bundledRules()).map((rule) => rule.id.split(".").slice(0, 2).join(".")))].sort((left, right) => left.localeCompare(right));
  return `Valid ecosystems: ${ecosystems.join(", ")}. Valid rule prefixes: ${[...ecosystems, ...prefixes].filter((value, index, all) => all.indexOf(value) === index).sort((left, right) => left.localeCompare(right)).join(", ")}.`;
}
