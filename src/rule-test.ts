import type { Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { builtInDetectors } from "./detectors/index.js";
import type { Finding } from "./domain.js";
import { scanRepository } from "./engine.js";
import { REGISTRY_V2_SCHEMA_VERSION } from "./registry.js";
import type { RegistryV2Rule } from "./registry.js";
import type { Detector } from "./sdk.js";

export const RULE_TEST_SCHEMA_VERSION = "evergreen.rules-test.v1" as const;

/** The findings a fixture produced for one rule. */
export interface RuleTestFixture {
  directory: string;
  findings: Finding[];
}

export interface RuleTestOutcome {
  schemaVersion: typeof RULE_TEST_SCHEMA_VERSION;
  ruleId: string;
  passed: boolean;
  match: RuleTestFixture;
  clean: RuleTestFixture;
  problems: string[];
}

export interface RuleTestOptions {
  /** Repository root; fixture paths are resolved from here. Defaults to the working directory. */
  root?: string;
  /** Directory holding `fixtures/`; defaults to `<root>/fixtures`. */
  fixturesDirectory?: string;
  detectors?: readonly Detector[];
}

export class RuleTestError extends Error {}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function display(path: string): string {
  const relativePath = relative(process.cwd(), resolve(path));
  return (relativePath === "" ? path : relativePath).replaceAll("\\", "/");
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Rules in every registry file under `directory`, in file order. Invalid or non-v2 files are skipped. */
export async function loadRegistryRules(directory = "registry"): Promise<RegistryV2Rule[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new RuleTestError(`Cannot read ${display(directory)}: rules test works in a checkout of the Evergreen repository, after npm run build.`);
  }
  const rules: RegistryV2Rule[] = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json")).sort((left, right) => left.name.localeCompare(right.name))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(directory, entry.name), "utf8"));
    } catch {
      const path = join(directory, entry.name);
      throw new RuleTestError(`${display(path)} is not valid JSON; run evergreen rules lint first.`);
    }
    if (!isRecord(parsed) || parsed.schemaVersion !== REGISTRY_V2_SCHEMA_VERSION || !Array.isArray(parsed.rules)) continue;
    for (const rule of parsed.rules) {
      if (isRecord(rule) && typeof rule.id === "string") rules.push(rule as unknown as RegistryV2Rule);
    }
  }
  return rules;
}

export async function findRule(id: string, registryDirectory = "registry"): Promise<RegistryV2Rule | undefined> {
  return (await loadRegistryRules(registryDirectory)).find((rule) => rule.id === id);
}

function describeFinding(finding: Finding): string {
  const line = finding.location.line === undefined ? "" : `:${finding.location.line}`;
  return `${finding.location.path}${line} (${finding.severity}) ${finding.summary}`;
}

/**
 * Runs a rule against `fixtures/<id>/match` and `fixtures/<id>/clean`. `match` must produce at least one
 * finding for the rule and `clean` none; both directories must exist. Scans are offline and never cached here.
 */
export async function testRule(rule: RegistryV2Rule, options: RuleTestOptions = {}): Promise<RuleTestOutcome> {
  const root = options.root ?? process.cwd();
  const fixtures = options.fixturesDirectory ?? join(root, "fixtures");
  const detectors = options.detectors ?? builtInDetectors;
  const problems: string[] = [];

  const inspect = async (name: "match" | "clean"): Promise<RuleTestFixture | undefined> => {
    const directory = join(fixtures, rule.id, name);
    if (!(await isDirectory(directory))) return undefined;
    const result = await scanRepository(directory, detectors, { noCache: true });
    return { directory, findings: result.findings.filter((finding) => finding.ruleId === rule.id) };
  };

  const match = await inspect("match");
  const clean = await inspect("clean");
  const fixturePath = (name: "match" | "clean") => display(join(fixtures, rule.id, name));

  if (match === undefined) {
    problems.push(`${fixturePath("match")}: missing; add a project that must produce a finding for "${rule.id}".`);
  } else if (match.findings.length === 0) {
    problems.push(`${fixturePath("match")}: expected at least one finding for "${rule.id}"; actual: none.`);
  }

  if (clean === undefined) {
    problems.push(`${fixturePath("clean")}: missing; add a project that must produce no finding for "${rule.id}".`);
  } else if (clean.findings.length > 0) {
    const actual = clean.findings.map((finding) => `  ${describeFinding(finding)}`).join("\n");
    problems.push(`${fixturePath("clean")}: expected no findings for "${rule.id}"; actual:\n${actual}`);
  }

  return {
    schemaVersion: RULE_TEST_SCHEMA_VERSION,
    ruleId: rule.id,
    passed: problems.length === 0,
    match: match ?? { directory: join(fixtures, rule.id, "match"), findings: [] },
    clean: clean ?? { directory: join(fixtures, rule.id, "clean"), findings: [] },
    problems,
  };
}

export function renderRuleTestText(outcomes: readonly RuleTestOutcome[]): string {
  const lines: string[] = [];
  for (const outcome of outcomes) {
    if (outcome.passed) {
      const found = outcome.match.findings.length;
      lines.push(`PASS ${outcome.ruleId} (match: ${found} finding${found === 1 ? "" : "s"}, clean: 0 findings)`);
      continue;
    }
    lines.push(`FAIL ${outcome.ruleId}`);
    for (const problem of outcome.problems) lines.push(...problem.split("\n").map((line) => `  ${line}`));
  }
  const failed = outcomes.filter((outcome) => !outcome.passed).length;
  lines.push(failed === 0
    ? `All ${outcomes.length} rule fixture${outcomes.length === 1 ? "" : "s"} passed.`
    : `${failed} of ${outcomes.length} rule fixture${outcomes.length === 1 ? "" : "s"} failed.`);
  return lines.join("\n");
}
