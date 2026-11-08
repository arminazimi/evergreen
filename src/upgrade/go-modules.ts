import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadDataFile } from "@velella/ebb/data-source";
import { parseGoMod } from "../detectors/go/parse-go-mod.js";
import { parseGoWork } from "../detectors/go/parse-go-work.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { versContains } from "@velella/ebb/vers";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

/**
 * Judges a target Go release against the module's own `go` directive, the workspace's `go` directive, and the
 * `go` versions `go mod vendor` recorded for each dependency. Reads files only: no network, no Go toolchain.
 */

const ANALYZER_ID = "go-modules";
const RUNTIME = "go";
const RUNTIME_PURL = "pkg:generic/golang";
const VENDOR_MODULES = "vendor/modules.txt";
const NO_VENDOR_REASON = "Dependencies' Go requirements are not recorded in the repository without vendoring.";

/** `1.22`, `go1.23.1`, and `1.24` as three numeric parts; undefined for anything that is not a Go release number. */
export function normalizeGoVersion(value: string): string | undefined {
  const match = /^(?:go)?([1-9][0-9]*)\.([0-9]+)(?:\.([0-9]+))?$/.exec(value);
  if (!match) return undefined;
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3] ?? 0)}`;
}

/** Orders two normalized Go versions. */
export function compareGoVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export interface VendoredModule {
  module: string;
  version: string;
  /** The `go` annotation `go mod vendor` wrote for this module, and its 1-based line. */
  go?: { value: string; line: number; text: string };
}

/**
 * Parses the module headers and `go` annotations of `vendor/modules.txt`. A `## explicit; go 1.22` line
 * belongs to the `# module version` line above it. Package lines are ignored.
 */
export function parseVendorModules(contents: string): VendoredModule[] {
  const modules: VendoredModule[] = [];
  let current: VendoredModule | undefined;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const text = rawLine.trim();
    const header = /^# \S+ \S+$/.test(text);
    if (header) {
      const separator = text.indexOf(" ", 2);
      current = { module: text.slice(2, separator), version: text.slice(separator + 1) };
      modules.push(current);
      continue;
    }
    if (!text.startsWith("##")) {
      current = undefined;
      continue;
    }
    if (current === undefined) continue;
    const annotation = text
      .slice(2)
      .split(";")
      .map((part) => part.trim())
      .find((part) => /^go [0-9]/.test(part));
    if (annotation === undefined) continue;
    const value = annotation.slice("go ".length);
    if (normalizeGoVersion(value) === undefined) continue;
    current.go = { value, line: index + 1, text };
  }
  return modules;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** The module's `go` annotation when the target is below it, undefined otherwise. */
function goRequirementBelowTarget(module: VendoredModule, targetVersion: string): VendoredModule["go"] {
  const go = module.go;
  if (go === undefined) return undefined;
  const minimum = normalizeGoVersion(go.value);
  if (minimum === undefined) return undefined;
  return compareGoVersions(targetVersion, minimum) < 0 ? go : undefined;
}

async function goRuntimeRules(): Promise<RegistryV2Rule[]> {
  const registry = validateRegistryV2(await loadDataFile("registry/go.json"));
  return registry.rules.filter((rule) => rule.purl === RUNTIME_PURL);
}

function matchesRule(rule: RegistryV2Rule, version: string): boolean {
  try {
    return versContains(rule.vers, version);
  } catch {
    return false;
  }
}

type GoVersion = NonNullable<ReturnType<typeof normalizeGoVersion>>;
type LocatedDeclaration = { path: string; declaration: ReturnType<typeof parseGoMod>[number] };

/** A blocker for each `go` directive whose minimum is above the target. */
function goDirectiveIssues(
  goDirectives: readonly LocatedDeclaration[],
  target: UpgradeTarget,
  targetVersion: GoVersion,
): UpgradeIssue[] {
  const issues: UpgradeIssue[] = [];
  for (const { path, declaration } of goDirectives) {
    if (declaration.kind !== "go") continue;
    const minimum = normalizeGoVersion(declaration.value);
    if (minimum === undefined) continue;
    if (compareGoVersions(targetVersion, minimum) >= 0) continue;
    issues.push({
      analyzer: ANALYZER_ID,
      level: "blocker",
      subject: `go@${declaration.value}`,
      path,
      line: declaration.line,
      reason: `The target Go ${target.version} is below the minimum Go ${declaration.value} declared by ${path}.`,
      evidence: { kind: "manifest", value: declaration.value },
    });
  }
  return issues;
}

/** Blockers from the vendored modules' own `go` lines, or an unknown when vendoring leaves no such evidence. */
async function vendorIssues(root: string, target: UpgradeTarget, targetVersion: GoVersion): Promise<UpgradeIssue[]> {
  const issues: UpgradeIssue[] = [];
  // `go mod vendor` records each dependency's own `go` version; without vendoring, that evidence is absent.
  const modulesText = await readOptional(join(root, VENDOR_MODULES));
  const vendored = modulesText === undefined ? [] : parseVendorModules(modulesText);
  for (const module of vendored) {
    const go = goRequirementBelowTarget(module, targetVersion);
    if (go === undefined) continue;
    issues.push({
      analyzer: ANALYZER_ID,
      level: "blocker",
      subject: `${module.module}@${module.version}`,
      path: VENDOR_MODULES,
      line: go.line,
      reason: `The target Go ${target.version} is below Go ${go.value}, which ${module.module}@${module.version} declares in ${VENDOR_MODULES}.`,
      evidence: { kind: "lockfile", value: go.text },
    });
  }
  if (vendored.every((module) => module.go === undefined)) {
    issues.push({
      analyzer: ANALYZER_ID,
      level: "unknown",
      subject: "dependencies",
      path: VENDOR_MODULES,
      reason: NO_VENDOR_REASON,
      evidence: {
        kind: "lockfile",
        value: modulesText === undefined ? `${VENDOR_MODULES} is absent` : `${VENDOR_MODULES} records no go version`,
      },
    });
  }
  return issues;
}

export class GoModulesAnalyzer implements UpgradeAnalyzer {
  readonly id = ANALYZER_ID;
  readonly runtimes = [RUNTIME] as const;

  async applies(root: string): Promise<boolean> {
    return (await readOptional(join(root, "go.mod"))) !== undefined;
  }

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    const goMod = await readOptional(join(root, "go.mod"));
    if (goMod === undefined) return [];

    const targetVersion = normalizeGoVersion(target.version);
    if (targetVersion === undefined) {
      return [
        {
          analyzer: ANALYZER_ID,
          level: "unknown",
          subject: `go@${target.version}`,
          path: "go.mod",
          reason: `The target version "${target.version}" is not a Go release number, so the module and vendored requirements cannot be compared.`,
          evidence: { kind: "manifest", value: target.version },
        },
      ];
    }

    const issues: UpgradeIssue[] = [];

    // Since Go 1.21 a `go` line is a minimum, not a suggestion: a toolchain older than it refuses the module.
    const goWork = await readOptional(join(root, "go.work"));
    const declarations = [
      ...parseGoMod(goMod).map((declaration) => ({ path: "go.mod", declaration })),
      ...(goWork === undefined ? [] : parseGoWork(goWork).map((declaration) => ({ path: "go.work", declaration }))),
    ];
    const goDirectives = declarations.filter((entry) => entry.declaration.kind === "go");
    issues.push(...goDirectiveIssues(goDirectives, target, targetVersion));
    issues.push(...(await vendorIssues(root, target, targetVersion)));

    // The target release's own lifecycle, from the bundled Go rules.
    const targetRule = (await goRuntimeRules()).find((rule) => matchesRule(rule, targetVersion));
    if (targetRule !== undefined) {
      const directive = goDirectives.find((entry) => entry.path === "go.mod");
      issues.push({
        analyzer: ANALYZER_ID,
        level: "warning",
        subject: `go@${target.version}`,
        path: "go.mod",
        ...(directive === undefined ? {} : { line: directive.declaration.line }),
        reason: `${targetRule.title}. ${targetRule.summary}`,
        evidence: { kind: "rule", value: targetRule.id },
      });
    }

    return issues;
  }
}

export const goModulesAnalyzer = new GoModulesAnalyzer();
