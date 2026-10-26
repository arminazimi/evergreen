import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { purlIdentity } from "../../purl.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseBunVersion, parseBunfig, parseDenoJson } from "./parse.js";

/**
 * Deno and Bun runtime detector.
 *
 * It reads runtime pins in `deno.json`, `deno.jsonc`, `bunfig.toml`, and `.bun-version`.
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

const DENO_BUN_FILES = new Set([
  "deno.json",
  "deno.jsonc",
  "bunfig.toml",
  ".bun-version",
]);

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

export class DenoDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "deno";
  readonly inputs: DetectorInputs = {
    fileNames: ["deno.json", "deno.jsonc", "bunfig.toml", ".bun-version"],
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
      const id = `${rule.id}:${path}:${line}`;
      findings.push({
        id,
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
      const name = basename(file);

      const declarations =
        name === ".bun-version"
          ? parseBunVersion(contents)
          : name === "bunfig.toml"
            ? parseBunfig(contents)
            : parseDenoJson(contents);

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

    findings.sort((left, right) => {
      if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
      return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
    });

    return { findings, unclassified: [] };
  }
}

export const denoDetector = new DenoDetector();
