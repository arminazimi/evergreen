import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { severityValues } from "./domain.js";
import type { ScanResult, Severity } from "./domain.js";

export class RollupError extends Error {}

export const UNOWNED = "unowned";

type SeverityCounts = Record<Severity, number>;

/** Findings counted by severity for one group, plus the repositories they come from. */
export interface RollupGroup {
  name: string;
  findings: number;
  repositories: string[];
  severities: SeverityCounts;
}

/** One summary of many repositories' scan reports, grouped by product and by owner. Deterministic: no clock, no network. */
export interface RollupResult {
  schemaVersion: "evergreen.rollup.v1";
  repositories: number;
  findings: number;
  severities: SeverityCounts;
  byProduct: RollupGroup[];
  byOwner: RollupGroup[];
}

/** A repository's scan report and who owns it. */
export interface RollupInput {
  repository: string;
  owner?: string;
  report: Pick<ScanResult, "findings">;
}

/** The product a rule belongs to: the part of its ID before the first dot, such as `nodejs` in `nodejs.runtime.eol-18`. */
export function productOf(ruleId: string): string {
  const dot = ruleId.indexOf(".");
  return dot === -1 ? ruleId : ruleId.slice(0, dot);
}

function emptyCounts(): SeverityCounts {
  return Object.fromEntries(severityValues.map((severity) => [severity, 0])) as SeverityCounts;
}

function sortedGroups(groups: Map<string, { findings: number; repositories: Set<string>; severities: SeverityCounts }>): RollupGroup[] {
  return [...groups]
    .map(([name, group]) => ({ name, findings: group.findings, repositories: [...group.repositories].sort(), severities: group.severities }))
    .sort((left, right) => right.findings - left.findings || left.name.localeCompare(right.name));
}

/** Merges reports into one summary. The result does not depend on the order of `inputs`. */
export function rollup(inputs: readonly RollupInput[]): RollupResult {
  const severities = emptyCounts();
  const products = new Map<string, { findings: number; repositories: Set<string>; severities: SeverityCounts }>();
  const owners = new Map<string, { findings: number; repositories: Set<string>; severities: SeverityCounts }>();
  const add = (groups: typeof products, name: string, repository: string, severity: Severity): void => {
    const group = groups.get(name) ?? { findings: 0, repositories: new Set<string>(), severities: emptyCounts() };
    group.findings += 1;
    group.repositories.add(repository);
    group.severities[severity] += 1;
    groups.set(name, group);
  };
  let findings = 0;
  for (const input of inputs) {
    for (const finding of input.report.findings) {
      findings += 1;
      severities[finding.severity] += 1;
      add(products, productOf(finding.ruleId), input.repository, finding.severity);
      add(owners, input.owner ?? UNOWNED, input.repository, finding.severity);
    }
  }
  return { schemaVersion: "evergreen.rollup.v1", repositories: new Set(inputs.map((input) => input.repository)).size, findings, severities, byProduct: sortedGroups(products), byOwner: sortedGroups(owners) };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new RollupError(`Cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Reads scan reports (`evergreen scan --json`) from files and merges them. A repository is named after its
 * report file, so `payments.json` is `payments`. `ownersFile` is a JSON object mapping repository names to owners.
 */
export async function rollupFiles(reportPaths: readonly string[], ownersFile?: string): Promise<RollupResult> {
  if (reportPaths.length === 0) throw new RollupError("Give at least one scan report (evergreen scan --json).");
  const owners = ownersFile === undefined ? {} : await readJson(ownersFile);
  if (typeof owners !== "object" || owners === null || Array.isArray(owners) || Object.values(owners).some((owner) => typeof owner !== "string" || owner === "")) {
    throw new RollupError(`${ownersFile} must be a JSON object mapping repository names to owner names.`);
  }
  const inputs: RollupInput[] = [];
  for (const path of reportPaths) {
    const report = (await readJson(path)) as Partial<ScanResult> | null;
    if (report?.schemaVersion !== "evergreen.scan.v1" || !Array.isArray(report.findings)) throw new RollupError(`${path} is not an evergreen.scan.v1 report.`);
    const repository = basename(path, extname(path));
    const owner = (owners as Record<string, string>)[repository];
    inputs.push({ repository, ...(owner === undefined ? {} : { owner }), report: { findings: report.findings } });
  }
  return rollup(inputs);
}

export function renderRollupText(result: RollupResult): string {
  const lines = [`Evergreen rollup: ${result.findings} findings across ${result.repositories} repositories`];
  const section = (title: string, groups: RollupGroup[]): void => {
    if (groups.length === 0) return;
    lines.push("", `${title}:`);
    for (const group of groups) {
      const counts = [...severityValues].reverse().filter((severity) => group.severities[severity] > 0).map((severity) => `${group.severities[severity]} ${severity}`);
      lines.push(`  ${group.name}: ${group.findings} (${counts.join(", ")}) in ${group.repositories.join(", ")}`);
    }
  };
  section("By product", result.byProduct);
  section("By owner", result.byOwner);
  return lines.join("\n");
}
