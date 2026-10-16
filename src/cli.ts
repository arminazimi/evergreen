#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import http from "node:http";
import process from "node:process";
import { resolve } from "node:path";

import { applyBaseline, createBaseline, readBaseline, writeBaseline } from "./baseline.js";
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
import { renderCheckText, renderFindingText, renderJson, renderMigrationPacketText, renderSarif, renderText } from "./reporters.js";
import { VERSION } from "./version.js";

const HELP = `Evergreen — local-first deprecation intelligence

Usage:
  evergreen scan [path] [--json | --format <text|json|sarif>]
  evergreen scan [path] --baseline <file> [--json]
  evergreen baseline [path] [--output <file>]
  evergreen check <purl> [--fail-on <severity|none>] [--json]
  evergreen data status [--json]
  evergreen init --agents [path] [--file AGENTS.md|CLAUDE.md] [--dry-run]
  evergreen new-detector <id> [--ecosystem <slug>]
  evergreen data update [--data-version <version>] [--json]
  evergreen explain <finding-id> [path] [--json]
  evergreen context <finding-id> [path] [--json]
  evergreen doctor [path] [--json]
  evergreen capabilities [--json]
  evergreen --help
  evergreen --version
`;

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
    process.stderr.write(usage);
    return 2;
  }
  const fileIndex = args.indexOf("--file");
  const fileValue = fileIndex === -1 ? undefined : args[fileIndex + 1];
  if (fileIndex !== -1 && fileValue !== "AGENTS.md" && fileValue !== "CLAUDE.md") {
    process.stderr.write(`--file must be AGENTS.md or CLAUDE.md.\n${usage}`);
    return 2;
  }
  const flags = new Set(["--agents", "--dry-run", "--file"]);
  const positional = args.filter((argument, index) => !flags.has(argument) && index !== fileIndex + 1 && !argument.startsWith("-"));
  const unknown = args.filter((argument) => argument.startsWith("-") && !flags.has(argument));
  if (unknown.length > 0 || positional.length > 1) {
    process.stderr.write(usage);
    return 2;
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
    if (error instanceof AgentFileError) {
      process.stderr.write(`${error.message}\n`);
      return 1;
    }
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
    process.stderr.write(`Usage: evergreen new-detector <id> [--ecosystem <slug>]\n`);
    return 2;
  }
  let scaffold: typeof import("../tools/scaffold/index.js");
  try {
    scaffold = await import("../tools/scaffold/index.js");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      process.stderr.write("new-detector is for contributors: run it from a checkout of the Evergreen repository after npm run build.\n");
      return 2;
    }
    throw error;
  }
  try {
    process.stdout.write(`${scaffold.renderScaffoldResult(await scaffold.scaffoldDetector(id, ecosystem ? { ecosystem } : {}))}\n`);
    return 0;
  } catch (error) {
    if (error instanceof scaffold.ScaffoldError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
}

async function main(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command] = args;
  if (command !== "scan" && command !== "check" && command !== "data" && command !== "new-detector" && command !== "init" && command !== "explain" && command !== "context" && command !== "baseline" && command !== "doctor" && command !== "capabilities") {
    process.stderr.write(`Unknown command: ${command ?? ""}\n\n${HELP}`);
    return 2;
  }

  if (command === "new-detector") return newDetector(args.slice(1));
  if (command === "init") return init(args.slice(1));
  const dataVersionIndex = args.indexOf("--data-version");
  const dataVersionFlag = dataVersionIndex === -1 ? undefined : args[dataVersionIndex + 1];
  if (dataVersionIndex !== -1 && (!dataVersionFlag || dataVersionFlag.startsWith("-"))) {
    process.stderr.write("--data-version needs a version, for example 2026.10.01, or \"bundled\".\n");
    return 2;
  }
  const isUpdate = command === "data" && args[1] === "update";
  const dataPin = isUpdate ? undefined : (dataVersionFlag ?? (process.env.EVERGREEN_DATA_VERSION || undefined));
  if (command !== "capabilities" && !isUpdate) {
    configureActiveData(dataPin === undefined ? {} : { pinnedVersion: dataPin });
    try {
      await getActiveData();
    } catch (error) {
      if (error instanceof DataPinError) {
        process.stderr.write(`${error.message}\n`);
        return 2;
      }
      throw error;
    }
  }
  const formatIndex = args.indexOf("--format");
  const format = formatIndex === -1 ? undefined : args[formatIndex + 1];
  if (formatIndex !== -1 && format !== "text" && format !== "json" && format !== "sarif") {
    process.stderr.write(`Unknown format: ${format ?? ""} (expected text, json, or sarif).\n`);
    return 2;
  }
  if (command === "check" && format !== undefined && format !== "json" && format !== "text") {
    process.stderr.write("check supports --json and --format text|json only.\n");
    return 2;
  }
  if (format === "sarif" && command !== "scan") {
    process.stderr.write("--format sarif is only available for the scan command.\n");
    return 2;
  }
  const json = args.includes("--json") || format === "json";
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
        if (error instanceof DataUpdateError) {
          process.stderr.write(`${error.message}\n`);
          return 1;
        }
        throw error;
      }
    }
    if (subcommand !== "status") {
      process.stderr.write(`Unknown data command: ${subcommand ?? ""}\n\n${HELP}`);
      return 2;
    }
    const status = await getDataStatus();
    process.stdout.write(`${json ? JSON.stringify(status, null, 2) : renderDataStatusText(status)}\n`);
    return 0;
  }
  const valueOptions = new Set(["--baseline", "--output", "--format", "--fail-on", "--data-version"]);
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
      process.stderr.write(`Missing package URL, for example pkg:npm/request@2.88.2.\n\n${HELP}`);
      return 2;
    }
    const gate = optionValue("--fail-on") ?? "high";
    if (gate !== "none" && !severityValues.includes(gate as Severity)) {
      process.stderr.write(`Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).\n`);
      return 2;
    }
    try {
      const check = await checkDependency(purl);
      process.stdout.write(`${json ? JSON.stringify(check, null, 2) : renderCheckText(check)}\n`);
      const rank = (severity: Severity) => severityValues.indexOf(severity);
      return check.status === "affected" && gate !== "none" && rank(check.severity!) >= rank(gate as Severity) ? 1 : 0;
    } catch (error) {
      if (error instanceof CheckDependencyError) {
        process.stderr.write(`${error.message}\n`);
        return 2;
      }
      throw error;
    }
  }
  const findingId = command === "explain" || command === "context" ? positional[0] : undefined;
  if ((command === "explain" || command === "context") && !findingId) {
    process.stderr.write(`Missing finding ID.\n\n${HELP}`);
    return 2;
  }
  const pathArgument = command === "explain" || command === "context"
    ? (positional[1] ?? ".")
    : (positional[0] ?? ".");
  if (command === "doctor") {
    const result = await diagnoseEnvironment(pathArgument);
    process.stdout.write(`${json ? JSON.stringify(result, null, 2) : renderDoctorText(result)}\n`);
    return result.summary.failed > 0 ? 1 : 0;
  }
  let result = await scanRepository(pathArgument, builtInDetectors);
  if (command === "baseline") {
    const output = resolve(optionValue("--output") ?? ".evergreen-baseline.json");
    const baseline = createBaseline(result);
    await writeBaseline(output, baseline);
    process.stdout.write(`Wrote ${baseline.findings.length} findings to ${output}\n`);
    return 0;
  }
  const baselinePath = optionValue("--baseline");
  if (baselinePath) {
    result = applyBaseline(result, await readBaseline(resolve(baselinePath)));
  }
  if (command === "context") {
    try {
      const packet = createMigrationPacket(result, findingId!);
      process.stdout.write(`${json ? JSON.stringify(packet, null, 2) : renderMigrationPacketText(packet)}\n`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  } else if (command === "explain") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) {
      process.stderr.write(`Finding not found: ${findingId}\n`);
      return 1;
    }
    process.stdout.write(`${json ? JSON.stringify(finding, null, 2) : renderFindingText(finding)}\n`);
  } else {
    const output = format === "sarif" ? renderSarif(result) : json ? renderJson(result) : renderText(result);
    process.stdout.write(`${output}\n`);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
