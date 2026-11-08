import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "@velella/ebb/data-source";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "@velella/ebb/purl";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { ruleFinding, sortFindings } from "../../rule-finding.js";
import { versContains } from "@velella/ebb/vers/index";
import { parseBunVersion, parseBunfig, parseDenoJson } from "./parse.js";
import type { DenoDeclaration } from "./parse.js";
import { parseToolVersions } from "./parse-tool-versions.js";

/**
 * Deno and Bun runtime detector.
 *
 * It reads runtime pins in `deno.json`, `deno.jsonc`, `bunfig.toml`, `.bun-version`, and `.tool-versions`.
 * Exact version pins are matched against lifecycle rules for `pkg:generic/deno` and `pkg:generic/bun`.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  ".dart_tool",
  "fixtures",
  "__fixtures__",
  "testdata",
]);

const DENO_BUN_FILES = new Set(["deno.json", "deno.jsonc", "bunfig.toml", ".bun-version", ".tool-versions"]);

const DENO_PURL = "pkg:generic/deno";
const BUN_PURL = "pkg:generic/bun";
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

async function denoBunFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile() && DENO_BUN_FILES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

function rulesByPurl(rules: readonly RegistryV2Rule[]): Map<string, RegistryV2Rule[]> {
  const grouped = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    let key: string;
    try {
      key = purlIdentity(rule.purl);
    } catch {
      continue;
    }
    const existing = grouped.get(key);
    if (existing) existing.push(rule);
    else grouped.set(key, [rule]);
  }
  return grouped;
}

function firstMatchingRule(rules: readonly RegistryV2Rule[], version: string): RegistryV2Rule | undefined {
  for (const rule of rules) {
    try {
      if (versContains(rule.vers, version)) return rule;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** The declarations a recognized file names, keyed by its base name. */
function declarationsFor(name: string, contents: string): DenoDeclaration[] {
  if (name === ".bun-version") return parseBunVersion(contents);
  if (name === ".tool-versions") return parseToolVersions(contents);
  if (name === "bunfig.toml") return parseBunfig(contents);
  return parseDenoJson(contents);
}

export class DenoDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "deno";
  readonly inputs: DetectorInputs = {
    fileNames: ["deno.json", "deno.jsonc", "bunfig.toml", ".bun-version", ".tool-versions"],
  };

  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/deno.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await denoBunFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const byPurl = rulesByPurl(await this.loadRules());
    const findings: DetectorFinding[] = [];

    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string): void => {
      findings.push(ruleFinding(rule, path, line, summary));
    };

    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const path = relativePosix(context.root, file);
      const name = basename(file);

      const declarations = declarationsFor(name, contents);

      for (const declaration of declarations) {
        if (!EXACT_VERSION.test(declaration.value)) continue;
        const purl = declaration.kind === "deno-runtime" ? DENO_PURL : BUN_PURL;
        const runtimeName = declaration.kind === "deno-runtime" ? "Deno" : "Bun";
        const rule = firstMatchingRule(byPurl.get(purl) ?? [], declaration.value);
        if (rule) {
          report(rule, path, declaration.line, `${path} pins ${runtimeName} ${declaration.value}. ${rule.summary}`);
        }
      }
    }

    sortFindings(findings);

    return { findings, unclassified: [] };
  }
}

export const denoDetector = new DenoDetector();
