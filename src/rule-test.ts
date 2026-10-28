// Runs one lifecycle rule against its positive and negative fixtures, without writing test code.
//
//   evergreen rules test <rule-id>
//
// The fixtures live in `tests/fixtures/<rule-id>/match` and `tests/fixtures/<rule-id>/clean`. The match fixture
// must observe the rule; the clean fixture must not. Both directories are scanned as untrusted input and offline.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { builtInDetectors } from "./detectors/index.js";
import type { Finding, SourceUsage, UsageMatcher } from "./domain.js";
import { scanRepository } from "./engine.js";
import { analyzeSourceUsage } from "./source-usage.js";

export class RuleTestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleTestError";
  }
}

export interface RuleTestOptions {
  /** Repository root holding `registry/` and `tests/fixtures`; defaults to the current directory. */
  root?: string;
  /** Fixtures root; defaults to `<root>/tests/fixtures`. */
  fixturesRoot?: string;
}

export interface FixtureObservation {
  /** Repository-relative path such as `package.json`, with the line where the rule was observed. */
  path: string;
  line: number;
  /** What was seen: a finding title or, for a usage, the symbol. */
  label: string;
}

export interface FixtureOutcome {
  kind: "match" | "clean";
  directory: string;
  passed: boolean;
  findings: FixtureObservation[];
  usages: FixtureObservation[];
  /** Why the fixture failed, when it did. */
  problem?: string;
}

export interface RuleTestResult {
  ruleId: string;
  /** Repository-relative path of the registry that defines the rule. */
  registry: string;
  passed: boolean;
  fixtures: FixtureOutcome[];
}

interface FoundRule {
  rule: Record<string, unknown>;
  registry: string;
}

const NOT_A_REGISTRY = new Set(["sources.lock.json"]);

/** The rule with this id in `root/registry`, or a clear error naming what to check. */
async function findRule(root: string, ruleId: string): Promise<FoundRule> {
  const directory = join(root, "registry");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new RuleTestError("rules test runs in a checkout of the Evergreen repository: registry/ was not found. Run it from the repository root.");
  }
  for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json") && !NOT_A_REGISTRY.has(candidate.name) && !candidate.name.endsWith("-shas.json")).sort((left, right) => left.name.localeCompare(right.name))) {
    const file = join(directory, entry.name);
    let value: unknown;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch {
      continue;
    }
    if (typeof value !== "object" || value === null) continue;
    const rules = (value as { rules?: unknown }).rules;
    if (!Array.isArray(rules)) continue;
    for (const rule of rules) {
      if (typeof rule === "object" && rule !== null && (rule as { id?: unknown }).id === ruleId) {
        return { rule: rule as Record<string, unknown>, registry: relative(root, file).replaceAll("\\", "/") };
      }
    }
  }
  throw new RuleTestError(`No rule has the id "${ruleId}". Check registry/*.json, or create one with evergreen new-rule.`);
}

/** The usages the rule's own matchers find in the fixture; rules without matchers observe nothing this way. */
async function usageObservations(directory: string, ruleId: string, rule: Record<string, unknown>): Promise<FixtureObservation[]> {
  const matchers = Array.isArray(rule.usage) ? (rule.usage as UsageMatcher[]) : [];
  if (matchers.length === 0) return [];
  const [analysis] = await analyzeSourceUsage(directory, [{ id: ruleId, matchers }]);
  return (analysis?.usages ?? []).map((usage: SourceUsage) => ({ path: usage.location.path, line: usage.location.line ?? 1, label: `${usage.kind} ${usage.symbol}` }));
}

function findingObservations(findings: readonly Finding[]): FixtureObservation[] {
  return findings.map((finding) => ({ path: finding.location.path, line: finding.location.line ?? 1, label: finding.title }));
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function describe(observations: readonly FixtureObservation[]): string[] {
  return observations.map((observation) => `${observation.path}:${observation.line} ${observation.label}`);
}

/**
 * Runs the rule against both fixtures. A fixture observes a rule when the detectors report it there, or -- for a
 * rule that declares usage matchers -- when the usage analysis finds one.
 */
export async function testRule(ruleId: string, options: RuleTestOptions = {}): Promise<RuleTestResult> {
  const root = options.root ?? process.cwd();
  const fixturesRoot = options.fixturesRoot ?? join(root, "tests", "fixtures");
  const found = await findRule(root, ruleId);
  const directory = join(fixturesRoot, ruleId);
  const shownPath = (path: string): string => {
    const relativePath = relative(root, path);
    return relativePath.startsWith("..") ? path : relativePath.replaceAll("\\", "/");
  };

  const fixtures: FixtureOutcome[] = [];
  for (const kind of ["match", "clean"] as const) {
    const fixture = join(directory, kind);
    const shown = shownPath(fixture);
    if (!(await isDirectory(fixture))) {
      fixtures.push({
        kind,
        directory: shown,
        passed: false,
        findings: [],
        usages: [],
        problem: `missing fixture: ${shown} is not a directory. Create both ${shownPath(directory)}/match and clean; see docs/RULES.md.`,
      });
      continue;
    }
    const scan = await scanRepository(fixture, builtInDetectors, { noCache: true });
    const findings = findingObservations(scan.findings.filter((finding) => finding.ruleId === ruleId));
    const usages = findings.length > 0 ? [] : await usageObservations(fixture, ruleId, found.rule);
    const observed = findings.length > 0 || usages.length > 0;
    if (kind === "match") {
      fixtures.push({
        kind,
        directory: shown,
        passed: observed,
        findings,
        usages,
        ...(observed ? {} : { problem: `expected at least one finding for "${ruleId}"; got none.` }),
      });
    } else {
      fixtures.push({
        kind,
        directory: shown,
        passed: !observed,
        findings,
        usages,
        ...(observed ? { problem: `expected no findings for "${ruleId}"; got ${findings.length + usages.length}.` } : {}),
      });
    }
  }

  return {
    ruleId,
    registry: found.registry,
    passed: fixtures.every((fixture) => fixture.passed),
    fixtures,
  };
}

export function renderRuleTestText(result: RuleTestResult): string {
  const lines = [`${result.passed ? "Passed" : "Failed"} ${result.ruleId} (${result.registry})`];
  for (const fixture of result.fixtures) {
    const observed = describe([...fixture.findings, ...fixture.usages]);
    if (fixture.problem !== undefined) {
      lines.push(`  ${fixture.kind}: ${fixture.problem}`);
      if (observed.length > 0) for (const entry of observed) lines.push(`    ${entry}`);
    } else {
      lines.push(`  ${fixture.kind}: ${observed.length === 0 ? "none" : `${observed.length} observation${observed.length === 1 ? "" : "s"}`}`);
      for (const entry of observed) lines.push(`    ${entry}`);
    }
  }
  return lines.join("\n");
}
