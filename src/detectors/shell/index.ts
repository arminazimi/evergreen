import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { versContains } from "../../vers/index.js";
import { parsePowerShell } from "./parse-powershell.js";
import { parseWorkflow } from "./parse-workflow.js";

/**
 * Shell and PowerShell lifecycle detector.
 *
 * It reads the literal `#Requires -Version` directive of `*.ps1` and `*.psm1` files, the literal
 * `PowerShellVersion` key of `*.psd1` manifests, and the tag of pinned `mcr.microsoft.com/powershell`
 * container images in `.github/workflows/*.yml`. Each version is matched against the rules for the
 * PowerShell Package URL. Shell names (`shell: pwsh`) and Bash images carry no PowerShell version and
 * never produce a finding.
 *
 * A version is read as the leading `major.minor`, `major.minor.patch`, or `major.minor.patch.revision`
 * followed by nothing or a `-suffix` (`7.0`, `7.4-ubuntu-22.04`). `lts-...`, `latest`, and anything else
 * carry no version and are never matched. A partial version admits every release it prefixes, so it
 * matches a rule only when the rule's VERS range contains both ends of that span. A rule whose VERS is
 * malformed never matches and does not hide a later rule. Nothing is executed and nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 2000;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const SCRIPT_EXTENSIONS = [".ps1", ".psm1", ".psd1"];
const WORKFLOW_EXTENSIONS = [".yml", ".yaml"];
const OPEN_END = "999999999";
const VERSION = /^(\d+)\.(\d+)(?:\.(\d+))?(?:\.\d+)?(?:-[0-9A-Za-z][0-9A-Za-z._-]*)?$/;
const POWERSHELL_PURL = purlIdentity("pkg:generic/powershell");

async function shellFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, depth: number, inWorkflows: boolean): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      const name = entry.name.toLowerCase();
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        await walk(join(directory, entry.name), depth + 1, entry.name === "workflows" && basename(directory) === ".github");
      } else if (entry.isFile()) {
        const script = SCRIPT_EXTENSIONS.some((extension) => name.endsWith(extension));
        const workflow = inWorkflows && WORKFLOW_EXTENSIONS.some((extension) => name.endsWith(extension));
        if (script || workflow) files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0, false);
  return files;
}

function classify(path: string): "script" | "workflow" {
  return SCRIPT_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension)) ? "script" : "workflow";
}

function powershellRules(rules: readonly RegistryV2Rule[]): RegistryV2Rule[] {
  return rules.filter((rule) => {
    try {
      return purlIdentity(rule.purl) === POWERSHELL_PURL;
    } catch {
      return false;
    }
  });
}

function containsAll(rule: RegistryV2Rule, versions: readonly string[]): boolean {
  try {
    return versions.every((version) => versContains(rule.vers, version));
  } catch {
    return false;
  }
}

/** The first rule whose VERS range contains every release the declared version could mean. */
function ruleForDeclared(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  const match = VERSION.exec(value.trim());
  if (!match) return undefined;
  const [, major, minor, patch] = match;
  const low = `${major}.${minor}.${patch ?? "0"}`;
  const high = `${major}.${minor}.${patch ?? OPEN_END}`;
  return rules.find((rule) => containsAll(rule, low === high ? [low] : [low, high]));
}

export class ShellDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "shell";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = {
    extensions: SCRIPT_EXTENSIONS,
    directories: [".github/workflows"],
  };

  /** `loadRules` lets tests supply rules; by default they come from the bundled or downloaded `registry/shell.json`. */
  constructor(private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () => validateRegistryV2(await loadDataFile("registry/shell.json")).rules) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await shellFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const rules = powershellRules(await this.loadRules());
    const findings: DetectorFinding[] = [];
    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string): void => {
      findings.push({
        id: `${rule.id}:${path}:${line}`,
        ruleId: rule.id,
        title: rule.title,
        summary,
        severity: rule.severity,
        location: { path, line },
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.migration ? { migration: rule.migration } : {}),
        sources: rule.sources,
      });
    };

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);

      if (classify(file) === "script") {
        for (const declaration of parsePowerShell(contents)) {
          const rule = ruleForDeclared(rules, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} requires PowerShell ${declaration.value}. ${rule.summary}`);
        }
      } else {
        for (const declaration of parseWorkflow(contents)) {
          if (declaration.kind !== "image" || declaration.product !== "powershell") continue;
          const rule = ruleForDeclared(rules, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} runs mcr.microsoft.com/powershell:${declaration.value}. ${rule.summary}`);
        }
      }
    }

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });
    return { findings, unclassified: [] };
  }
}

export const shellDetector = new ShellDetector();
