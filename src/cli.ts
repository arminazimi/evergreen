#!/usr/bin/env node

import process from "node:process";
import { resolve } from "node:path";

import { applyBaseline, createBaseline, readBaseline, writeBaseline } from "./baseline.js";
import { getCapabilityManifest, renderCapabilitiesText } from "./capabilities.js";
import { checkDependency, CheckDependencyError } from "./check-dependency.js";
import { getDataStatus, renderDataStatusText } from "./data-status.js";
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
  evergreen explain <finding-id> [path] [--json]
  evergreen context <finding-id> [path] [--json]
  evergreen doctor [path] [--json]
  evergreen capabilities [--json]
  evergreen --help
  evergreen --version
`;

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
  if (command !== "scan" && command !== "check" && command !== "data" && command !== "explain" && command !== "context" && command !== "baseline" && command !== "doctor" && command !== "capabilities") {
    process.stderr.write(`Unknown command: ${command ?? ""}\n\n${HELP}`);
    return 2;
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
    if (subcommand !== "status") {
      process.stderr.write(`Unknown data command: ${subcommand ?? ""}\n\n${HELP}`);
      return 2;
    }
    const status = await getDataStatus();
    process.stdout.write(`${json ? JSON.stringify(status, null, 2) : renderDataStatusText(status)}\n`);
    return 0;
  }
  const valueOptions = new Set(["--baseline", "--output", "--format", "--fail-on"]);
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
