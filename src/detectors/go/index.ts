import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import type { UnclassifiedReference } from "../../domain.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding } from "../../sdk.js";
import { versContains } from "../../vers/index.js";
import { parseGoMod } from "./parse-go-mod.js";
import { parseGoWork } from "./parse-go-work.js";

/**
 * Finds Go release lines that no longer receive fixes, and direct modules with a lifecycle rule.
 *
 * It reads `go` and `toolchain` directives in go.mod and go.work, and direct `require` entries in go.mod.
 * A `go` directive is a compatibility floor, so it is reported at medium severity; a `toolchain` line names
 * the toolchain that builds the module, so it keeps the rule's severity. Nothing is run and nothing is
 * fetched: the Go toolchain is never invoked.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "vendor", "dist", "build", "target", ".venv", "venv", "fixtures", "__fixtures__", "testdata"]);
const RUNTIME_PURL = "pkg:generic/golang";

async function goFiles(root: string): Promise<string[]> {
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
      } else if (entry.isFile() && (entry.name === "go.mod" || entry.name === "go.work")) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** `1.22`, `1.22.4`, and `go1.23.1rc1` as a plain version the golang VERS scheme can order. */
function normalizeVersion(value: string): string | undefined {
  const match = /^(?:go)?(\d+)\.(\d+)(?:\.(\d+))?(?:rc\d+)?$/.exec(value);
  return match ? `${match[1]}.${match[2]}.${match[3] ?? "0"}` : undefined;
}

export class GoDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "go";

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await goFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const registry = validateRegistryV2(await loadDataFile("registry/go.json"));
    const runtimeRules = registry.rules.filter((rule) => rule.purl === RUNTIME_PURL);
    const moduleRules = registry.rules.filter((rule) => rule.purl.startsWith("pkg:golang/"));
    const findings: DetectorFinding[] = [];
    const unclassified: Omit<UnclassifiedReference, "detector">[] = [];

    const report = (rule: RegistryV2Rule, path: string, line: number, summary: string, severity = rule.severity): void => {
      findings.push({
        id: `${rule.id}:${path}:${line}`,
        ruleId: rule.id,
        title: rule.title,
        summary,
        severity,
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
      const declarations = basename(file) === "go.work" ? parseGoWork(contents) : parseGoMod(contents);
      for (const declaration of declarations) {
        if (declaration.kind === "require") {
          const rule = matchModule(moduleRules, declaration.module, declaration.value);
          if (rule) report(rule, path, declaration.line, `${path} requires ${declaration.module} ${declaration.value}. ${rule.summary}`);
          continue;
        }
        const version = normalizeVersion(declaration.value);
        if (!version) {
          unclassified.push({ component: "golang", reference: declaration.value, reason: "the version is not a Go release number", location: { path, line: declaration.line } });
          continue;
        }
        const rule = runtimeRules.find((item) => versContains(item.vers, version));
        if (!rule) continue;
        const what = declaration.kind === "toolchain" ? "toolchain" : "go directive";
        report(
          rule,
          path,
          declaration.line,
          `${path} ${what} ${declaration.value} is on Go ${version.split(".").slice(0, 2).join(".")}. ${rule.summary}`,
          declaration.kind === "go" ? "medium" : rule.severity,
        );
      }
    }
    return { findings, unclassified };
  }
}

/** The rule for a direct module at a version, if one covers it. `v1.2.3+incompatible` is compared as 1.2.3. */
export function matchModule(rules: readonly RegistryV2Rule[], module: string, version: string): RegistryV2Rule | undefined {
  const plain = version.replace(/^v/, "").replace(/\+incompatible$/, "");
  try {
    return rules.find((item) => item.purl === `pkg:golang/${module}` && versContains(item.vers, plain));
  } catch {
    return undefined;
  }
}

export const goDetector = new GoDetector();
