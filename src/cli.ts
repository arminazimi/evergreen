#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import http from "node:http";
import process from "node:process";
import { resolve } from "node:path";

import { DEFAULT_WARN_DAYS, createBaseline, evaluateBaseline, expiredPolicies, expiredSuppressionsFail, readBaseline, writeBaseline } from "./baseline.js";
import type { ExpiredPolicy } from "./baseline.js";
import { isIsoDate } from "./registry.js";
import { getCapabilityManifest, renderCapabilitiesText } from "./capabilities.js";
import { checkDependency, CheckDependencyError } from "./check-dependency.js";
import { AgentFileError } from "./agent-instructions.js";
import { configureActiveData, DataPinError, getActiveData } from "./data-source.js";
import { DataUpdateError, renderDataUpdateText, updateData } from "./data-update.js";
import { getDataStatus, renderDataStatusText } from "./data-status.js";
import { initAgents } from "./init-agents.js";
import type { AgentFileName } from "./init-agents.js";
import { builtInDetectors } from "./detectors/index.js";
import type { Severity } from "./domain.js";
import { severityValues } from "./domain.js";
import { scanRepository } from "./engine.js";
import { createMigrationPacket } from "./migration-packet.js";
import { diagnoseEnvironment, renderDoctorText } from "./doctor.js";
import { createIssueReport, ReportIssueError } from "./report-issue.js";
import { renderCheckText, renderCompact, renderFindingText, renderJson, renderMigrationPacketText, renderRdjson, renderSarif, renderText } from "./reporters.js";
import { STATUS_FILE_NAME, writeStatusFile } from "./status-file.js";
import { VERSION } from "./version.js";

const HELP = `Evergreen — local-first deprecation intelligence

Usage:
  evergreen scan [path] [--json | --format <text|json|sarif|rdjson|compact>]
  evergreen scan [path] --baseline <file> [--baseline-warn-days <n>] [--on-expired resurface|fail] [--today <YYYY-MM-DD>] [--json]
  evergreen scan [path] --write-status
  evergreen baseline [path] [--output <file>]
  evergreen check <purl> [--fail-on <severity|none>] [--json]
  evergreen mcp
  evergreen data status [--json]
  evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]
  evergreen new-detector <id> [--ecosystem <slug>]
  evergreen data update [--data-version <version>] [--json]
  evergreen explain <finding-id> [path] [--json]
  evergreen context <finding-id> [path] [--json]
  evergreen doctor [path] [--json]
  evergreen report-issue <finding-id> [path] [--output <file>]
  evergreen capabilities [--json]
  evergreen --help
  evergreen --version
`;

/**
 * The stable failure classes. `policy` (1) and `usage` (2) keep the exit codes Evergreen has always used; the rest are
 * distinct so a caller can branch on the exit code alone. Documented in docs/CAPABILITIES.md.
 */
const EXIT_CODES = { policy: 1, usage: 2, data: 3, parse: 4, internal: 5 } as const;
type FailureClass = keyof typeof EXIT_CODES;

let jsonErrors = false;

/**
 * Reports a failure and returns its exit code. The message always goes to stderr; with `--json` it is also written to
 * stdout as an `evergreen.error.v1` document. A `policy` failure is a verdict on a result that was already printed, so
 * it writes no second document.
 */
function fail(kind: FailureClass, message: string, appendix = ""): number {
  process.stderr.write(`${message}\n${appendix}`);
  if (jsonErrors && kind !== "policy") {
    const document = { schemaVersion: "evergreen.error.v1", error: { code: kind, exitCode: EXIT_CODES[kind], message } };
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  }
  return EXIT_CODES[kind];
}

/**
 * `data update` is the one command that uses the network, and it must honor the standard proxy variables. Node does
 * that for `fetch` only when started with NODE_USE_ENV_PROXY, so when a proxy is configured the command runs again
 * in a child process that has it (Node 22.21 and later). Returns that child's exit code, or undefined to carry on.
 */
function relaunchWithEnvironmentProxy(): number | undefined {
  const proxied = ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"].some((name) => process.env[name]);
  if (!proxied || process.env.NODE_USE_ENV_PROXY) return undefined;
  if (typeof http.setGlobalProxyFromEnv === "function") return undefined;
  if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) {
    process.stderr.write("A proxy is configured, but this Node.js cannot use it for downloads. Use Node.js 22.21 or newer.\n");
    return undefined;
  }
  const child = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  return child.status ?? 1;
}

/** `init --agents`: keeps the Evergreen section in AGENTS.md or CLAUDE.md. */
async function init(args: string[]): Promise<number> {
  const usage = "Usage: evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]\n";
  if (!args.includes("--agents")) {
    return fail("usage", usage.trimEnd());
  }
  const fileIndex = args.indexOf("--file");
  const fileValue = fileIndex === -1 ? undefined : args[fileIndex + 1];
  if (fileIndex !== -1 && fileValue !== "AGENTS.md" && fileValue !== "CLAUDE.md") {
    return fail("usage", "--file must be AGENTS.md or CLAUDE.md.", usage);
  }
  const flags = new Set(["--agents", "--dry-run", "--file"]);
  const positional = args.filter((argument, index) => !flags.has(argument) && index !== fileIndex + 1 && !argument.startsWith("-"));
  const unknown = args.filter((argument) => argument.startsWith("-") && !flags.has(argument));
  if (unknown.length > 0 || positional.length > 1) {
    return fail("usage", usage.trimEnd());
  }
  const dryRun = args.includes("--dry-run");
  try {
    const result = await initAgents({ root: positional[0] ?? ".", dryRun, ...(fileValue ? { file: fileValue as AgentFileName } : {}) });
    if (result.change === "unchanged") process.stdout.write(`${result.file} already has the current Evergreen section; nothing to change.\n`);
    else {
      const verb = result.change === "created" ? "create" : result.change === "added" ? "add the Evergreen section to" : "update the Evergreen section in";
      process.stdout.write(dryRun ? `Would ${verb} ${result.file}:\n\n${result.diff}\n` : `${result.change === "created" ? "Created" : result.change === "added" ? "Added the Evergreen section to" : "Updated the Evergreen section in"} ${result.file}.\n`);
    }
    return 0;
  } catch (error) {
    if (error instanceof AgentFileError) return fail("parse", error.message);
    throw error;
  }
}

/** Creates a detector skeleton. The generator lives in the repository's tools, so this works in a checkout only. */
async function newDetector(args: string[]): Promise<number> {
  const ecosystemIndex = args.indexOf("--ecosystem");
  const ecosystem = ecosystemIndex === -1 ? undefined : args[ecosystemIndex + 1];
  const ecosystemValueIndex = ecosystemIndex === -1 ? -1 : ecosystemIndex + 1;
  const id = args.find((argument, index) => !argument.startsWith("-") && index !== ecosystemValueIndex);
  if (!id || (ecosystemIndex !== -1 && (!ecosystem || ecosystem.startsWith("-")))) {
    return fail("usage", "Usage: evergreen new-detector <id> [--ecosystem <slug>]");
  }
  let scaffold: typeof import("../tools/scaffold/index.js");
  try {
    scaffold = await import("../tools/scaffold/index.js");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      return fail("usage", "new-detector is for contributors: run it from a checkout of the Evergreen repository after npm run build.");
    }
    throw error;
  }
  try {
    process.stdout.write(`${scaffold.renderScaffoldResult(await scaffold.scaffoldDetector(id, ecosystem ? { ecosystem } : {}))}\n`);
    return 0;
  } catch (error) {
    if (error instanceof scaffold.ScaffoldError) return fail("usage", error.message);
    throw error;
  }
}

async function main(args: string[]): Promise<number> {
  const formatValue = args[args.indexOf("--format") + 1];
  jsonErrors = args.includes("--json") || (args.includes("--format") && formatValue === "json");
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command] = args;
  if (command !== "scan" && command !== "check" && command !== "data" && command !== "new-detector" && command !== "init" && command !== "mcp" && command !== "explain" && command !== "context" && command !== "baseline" && command !== "doctor" && command !== "report-issue" && command !== "capabilities") {
    return fail("usage", `Unknown command: ${command ?? ""}`, `\n${HELP}`);
  }

  if (command === "mcp") {
    // The MCP server owns stdin and stdout until the host disconnects, so there is no exit code to return.
    (await import("./mcp-server.js")).startMcpServer();
    return await new Promise<number>(() => undefined);
  }
  if (command === "new-detector") return newDetector(args.slice(1));
  if (command === "init") return init(args.slice(1));
  const dataVersionIndex = args.indexOf("--data-version");
  const dataVersionFlag = dataVersionIndex === -1 ? undefined : args[dataVersionIndex + 1];
  if (dataVersionIndex !== -1 && (!dataVersionFlag || dataVersionFlag.startsWith("-"))) {
    return fail("usage", "--data-version needs a version, for example 2026.10.01, or \"bundled\".");
  }
  const isUpdate = command === "data" && args[1] === "update";
  const dataPin = isUpdate ? undefined : (dataVersionFlag ?? (process.env.EVERGREEN_DATA_VERSION || undefined));
  if (command !== "capabilities" && !isUpdate) {
    configureActiveData(dataPin === undefined ? {} : { pinnedVersion: dataPin });
    try {
      await getActiveData();
    } catch (error) {
      if (error instanceof DataPinError) return fail(error.malformed ? "usage" : "data", error.message);
      throw error;
    }
  }
  const formatIndex = args.indexOf("--format");
  const format = formatIndex === -1 ? undefined : args[formatIndex + 1];
  if (formatIndex !== -1 && format !== "text" && format !== "json" && format !== "sarif" && format !== "rdjson" && format !== "compact") {
    return fail("usage", `Unknown format: ${format ?? ""} (expected text, json, sarif, rdjson, or compact).`);
  }
  if (command === "check" && format !== undefined && format !== "json" && format !== "text") {
    return fail("usage", "check supports --json and --format text|json only.");
  }
  if ((format === "sarif" || format === "rdjson" || format === "compact") && command !== "scan") {
    return fail("usage", `--format ${format} is only available for the scan command.`);
  }
  const json = args.includes("--json") || format === "json";
  if (args.includes("--write-status") && command !== "scan") {
    return fail("usage", "--write-status is only available for the scan command.");
  }
  if (command === "capabilities") {
    const manifest = getCapabilityManifest();
    process.stdout.write(`${json ? JSON.stringify(manifest, null, 2) : renderCapabilitiesText(manifest)}\n`);
    return 0;
  }
  if (command === "data") {
    const subcommand = args[1];
    if (subcommand === "update") {
      const relaunched = relaunchWithEnvironmentProxy();
      if (relaunched !== undefined) return relaunched;
      try {
        const result = await updateData(dataVersionFlag ? { version: dataVersionFlag } : {});
        process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderDataUpdateText(result)}\n`);
        return 0;
      } catch (error) {
        if (error instanceof DataUpdateError) return fail("data", error.message);
        throw error;
      }
    }
    if (subcommand !== "status") {
      return fail("usage", `Unknown data command: ${subcommand ?? ""}`, `\n${HELP}`);
    }
    const status = await getDataStatus();
    process.stdout.write(`${json ? JSON.stringify(status, null, 2) : renderDataStatusText(status)}\n`);
    return 0;
  }
  const valueOptions = new Set(["--baseline", "--output", "--format", "--fail-on", "--data-version", "--today", "--baseline-warn-days", "--on-expired"]);
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
  const optionValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  if (command === "check") {
    const purl = positional[0];
    if (!purl) {
      return fail("usage", "Missing package URL, for example pkg:npm/request@2.88.2.", `\n${HELP}`);
    }
    const gate = optionValue("--fail-on") ?? "high";
    if (gate !== "none" && !severityValues.includes(gate as Severity)) {
      return fail("usage", `Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).`);
    }
    try {
      const check = await checkDependency(purl);
      process.stdout.write(`${json ? JSON.stringify(check, null, 2) : renderCheckText(check)}\n`);
      const rank = (severity: Severity) => severityValues.indexOf(severity);
      return check.status === "affected" && gate !== "none" && rank(check.severity!) >= rank(gate as Severity) ? EXIT_CODES.policy : 0;
    } catch (error) {
      if (error instanceof CheckDependencyError) return fail("parse", error.message);
      throw error;
    }
  }
  const takesFindingId = command === "explain" || command === "context" || command === "report-issue";
  const findingId = takesFindingId ? positional[0] : undefined;
  if (takesFindingId && !findingId) {
    return fail("usage", "Missing finding ID.", `\n${HELP}`);
  }
  const pathArgument = takesFindingId
    ? (positional[1] ?? ".")
    : (positional[0] ?? ".");
  if (command === "doctor") {
    const result = await diagnoseEnvironment(pathArgument);
    process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderDoctorText(result)}\n`);
    return result.summary.failed > 0 ? EXIT_CODES.policy : 0;
  }
  let result = await scanRepository(pathArgument, builtInDetectors);
  if (command === "baseline") {
    const output = resolve(optionValue("--output") ?? ".evergreen-baseline.json");
    const baseline = createBaseline(result);
    await writeBaseline(output, baseline);
    process.stdout.write(`Wrote ${baseline.findings.length} findings to ${output}\n`);
    return 0;
  }
  let baselineExpiredFailure = false;
  const baselinePath = optionValue("--baseline");
  if (baselinePath) {
    const today = optionValue("--today") ?? new Date().toISOString().slice(0, 10);
    const warnValue = optionValue("--baseline-warn-days");
    const warnWithinDays = warnValue === undefined ? DEFAULT_WARN_DAYS : Number(warnValue);
    const onExpired = (optionValue("--on-expired") ?? "resurface") as ExpiredPolicy;
    if (!isIsoDate(today) || !Number.isInteger(warnWithinDays) || warnWithinDays < 0 || warnWithinDays > 365 || !expiredPolicies.includes(onExpired)) {
      return fail("usage", `--today must be a date (YYYY-MM-DD), --baseline-warn-days a whole number from 0 to 365, and --on-expired one of ${expiredPolicies.join(", ")}.`);
    }
    let baseline: Awaited<ReturnType<typeof readBaseline>>;
    try {
      baseline = await readBaseline(resolve(baselinePath));
    } catch (error) {
      return fail("parse", error instanceof Error ? error.message : String(error));
    }
    const evaluated = evaluateBaseline(result, baseline, { today, warnWithinDays, onExpired });
    result = evaluated.result;
    baselineExpiredFailure = expiredSuppressionsFail(onExpired, evaluated.expired);
  }
  if (command === "context") {
    try {
      const packet = createMigrationPacket(result, findingId!);
      process.stdout.write(`${json ? JSON.stringify(packet, null, 2) : renderMigrationPacketText(packet)}\n`);
    } catch (error) {
      return fail("data", error instanceof Error ? error.message : String(error));
    }
  } else if (command === "report-issue") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) {
      return fail("data", `Finding not found: ${findingId}`);
    }
    try {
      const report = await createIssueReport(pathArgument, finding);
      const output = optionValue("--output");
      if (output) {
        const destination = resolve(output);
        await writeFile(destination, report);
        process.stdout.write(`Wrote the report to ${destination}. Review it before you open an issue; Evergreen never opens one.\n`);
      } else {
        process.stdout.write(`${report}\n`);
      }
    } catch (error) {
      if (error instanceof ReportIssueError) return fail("data", error.message);
      throw error;
    }
  } else if (command === "explain") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) {
      return fail("data", `Finding not found: ${findingId}`);
    }
    process.stdout.write(`${json ? JSON.stringify(finding, null, 2) : renderFindingText(finding)}\n`);
  } else {
    const output = format === "sarif" ? renderSarif(result) : format === "rdjson" ? renderRdjson(result) : format === "compact" ? renderCompact(result) : json ? renderJson(result) : renderText(result);
    process.stdout.write(`${output}\n`);
    if (args.includes("--write-status")) {
      const statusRoot = resolve(pathArgument);
      await writeStatusFile(statusRoot, result);
      process.stderr.write(`Wrote ${STATUS_FILE_NAME} in ${statusRoot}.\n`);
    }
  }
  if (baselineExpiredFailure) {
    return fail("policy", "Failing because a baseline suppression has expired (--on-expired fail).");
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.exitCode = fail("internal", `Evergreen failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`);
}
