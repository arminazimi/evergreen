// Promises how fresh each importer source is, reports misses, and opens an issue for each one.
//
//   node dist/tools/importers/freshness.js [--registry-dir registry] [--today YYYY-MM-DD] [--dry-run]
//                                          [--max-open 10] [--repo OWNER/REPO]
//
// Every importer reads one authoritative source. tools/importers/freshness.json sets, per importer, the
// most days that may pass before a maintainer last reviewed a rule drafted from that source
// (`provenance.reviewedAt`, newest first). Past that, the source has missed its target: the dashboard
// shows it, and this command opens one issue for it.
//
// The measure uses only committed files. This tool never uses the network to measure; the one network
// call is the optional issue creation through the GitHub CLI, as in candidate-issues.ts.
// Each issue carries a marker (<!-- evergreen-source-freshness: <importer> -->). An importer with an
// open issue is not filed again, so a source that stays stale has one issue, and the number of open
// freshness issues is capped. Exit code 10 means at least one target was missed.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RegistryV2 } from "../../src/registry.js";
import { loadRegistries } from "../check-sources.js";
import { defaultGitHubRunner } from "./candidate-issues.js";
import type { CandidateIssueRunner, IssueRecord, RenderedCandidateIssue } from "./candidate-issues.js";

export const FRESHNESS_TARGETS_FILE = "tools/importers/freshness.json";
export const FRESHNESS_MARKER_PREFIX = "<!-- evergreen-source-freshness:";
export const DEFAULT_MAX_OPEN_FRESHNESS = 10;
export const FRESHNESS_LABELS = ["type: task", "area: data", "area: validation", "lane: maintainer"];

export interface FreshnessTargets {
  /** Importer id to the most days a source may go without a reviewed rule. */
  maxAgeDays: Record<string, number>;
}

export type FreshnessStatus = "met" | "missed" | "no-rules";

export interface SourceFreshness {
  importer: string;
  /** The promise: days allowed since the newest review. */
  targetDays: number;
  /** Rules in the registry that this importer drafted. */
  rules: number;
  /** The newest `provenance.reviewedAt` among them, or null when there are none. */
  lastReviewedAt: string | null;
  /** Whole days from `lastReviewedAt` to the reference day (never negative), or null when there are no rules. */
  ageDays: number | null;
  status: FreshnessStatus;
}

export interface FreshnessReport {
  referenceDay: string;
  sources: SourceFreshness[];
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function dayNumber(value: string, name: string): number {
  const match = DAY.exec(value);
  const time = match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : Number.NaN;
  if (!match || new Date(time).toISOString().slice(0, 10) !== value)
    throw new Error(`${name} must be a calendar day written YYYY-MM-DD, not "${value}".`);
  return time / 86_400_000;
}

export function parseFreshnessTargets(value: unknown): FreshnessTargets {
  const days = typeof value === "object" && value !== null && "maxAgeDays" in value ? value.maxAgeDays : undefined;
  if (typeof days !== "object" || days === null || Array.isArray(days) || Object.keys(days).length === 0)
    throw new Error(`${FRESHNESS_TARGETS_FILE} needs a non-empty maxAgeDays object.`);
  const maxAgeDays: Record<string, number> = {};
  for (const [importer, target] of Object.entries(days)) {
    if (typeof target !== "number" || !Number.isInteger(target) || target < 1)
      throw new Error(
        `${FRESHNESS_TARGETS_FILE}: the target for "${importer}" must be a whole number of days, 1 or more.`,
      );
    maxAgeDays[importer] = target;
  }
  return { maxAgeDays };
}

export async function loadFreshnessTargets(root = "."): Promise<FreshnessTargets> {
  return parseFreshnessTargets(JSON.parse(await readFile(resolve(root, FRESHNESS_TARGETS_FILE), "utf8")));
}

/** Measures every importer in `targets` against the reviewed rules it drafted. Pure: no clock, no network. */
export function measureFreshness(
  registries: readonly { name: string; registry: RegistryV2 }[],
  targets: FreshnessTargets,
  today: string,
): FreshnessReport {
  const reference = dayNumber(today, "--today");
  const newest = new Map<string, { count: number; reviewedAt: string }>();
  for (const { registry } of registries) {
    for (const rule of registry.rules) {
      const importer = rule.provenance.importer;
      if (importer === undefined || !(importer in targets.maxAgeDays)) continue;
      const entry = newest.get(importer) ?? { count: 0, reviewedAt: "" };
      entry.count++;
      if (rule.provenance.reviewedAt > entry.reviewedAt) entry.reviewedAt = rule.provenance.reviewedAt;
      newest.set(importer, entry);
    }
  }
  const sources = Object.keys(targets.maxAgeDays)
    .sort()
    .map((importer): SourceFreshness => {
      const targetDays = targets.maxAgeDays[importer]!;
      const seen = newest.get(importer);
      if (!seen || seen.reviewedAt === "")
        return {
          importer,
          targetDays,
          rules: seen?.count ?? 0,
          lastReviewedAt: null,
          ageDays: null,
          status: "no-rules",
        };
      const ageDays = Math.max(0, reference - dayNumber(seen.reviewedAt, `${importer} reviewedAt`));
      return {
        importer,
        targetDays,
        rules: seen.count,
        lastReviewedAt: seen.reviewedAt,
        ageDays,
        status: ageDays > targetDays ? "missed" : "met",
      };
    });
  return { referenceDay: today, sources };
}

export const missedSources = (report: FreshnessReport): SourceFreshness[] =>
  report.sources.filter((source) => source.status === "missed");

export function formatFreshnessMarker(importer: string): string {
  return `${FRESHNESS_MARKER_PREFIX} ${importer} -->`;
}

export function extractFreshnessKey(body: string | undefined): string | null {
  return body?.match(/<!--\s*evergreen-source-freshness:\s*([^\s]+)\s*-->/)?.[1] ?? null;
}

export function renderFreshnessIssue(source: SourceFreshness, referenceDay: string): RenderedCandidateIssue {
  const body = `${formatFreshnessMarker(source.importer)}
## Goal
Review the \`${source.importer}\` source again so its freshness target is met.

## What was missed
- **Source**: importer \`${source.importer}\` (see \`docs/IMPORTERS.md\`)
- **Target**: a rule drafted from it is reviewed at least every ${source.targetDays} days (\`tools/importers/freshness.json\`)
- **Newest review**: ${source.lastReviewedAt ?? "none"} (${source.ageDays ?? "?"} days before ${referenceDay})
- **Rules drafted from it**: ${source.rules}

## Agent brief

### Files
• \`registry/\` (the rules whose \`provenance.importer\` is \`${source.importer}\`)
• \`tools/importers/freshness.json\` (only if the target itself is wrong)

### Steps
1. Run \`node dist/tools/importers/run.js ${source.importer}\` and compare it with the registry as \`docs/IMPORTERS.md\` describes, or open the weekly draft pull request for \`${source.importer}\`.
2. Check each source against its rule. Update the rule, or confirm it is still right, and set \`provenance.reviewedAt\` to the day you checked.
3. If the source is gone or no longer useful, say so in the pull request instead of raising the target.

### Do not
• Do not raise a target only to silence this issue.
• Do not add network access to scans.

## Done when
- [ ] \`provenance.reviewedAt\` is current for the rules drafted from \`${source.importer}\`.
- [ ] \`npm run check\` passes.
`;
  return {
    ruleId: source.importer,
    title: `data: ${source.importer} source missed its ${source.targetDays}-day freshness target`,
    body,
    labels: FRESHNESS_LABELS,
  };
}

export interface FreshnessSelection {
  toOpen: SourceFreshness[];
  skippedTracked: string[];
  openCount: number;
  capped: boolean;
}

/** An importer with an open issue is not filed again; a closed issue does not stop a new miss from being filed. */
export function selectMissesToOpen(
  missed: readonly SourceFreshness[],
  existing: readonly IssueRecord[],
  maxOpen = DEFAULT_MAX_OPEN_FRESHNESS,
): FreshnessSelection {
  const tracked = new Set<string>();
  let openCount = 0;
  for (const issue of existing) {
    const key = extractFreshnessKey(issue.body);
    if (!key) continue;
    if (!issue.state || issue.state.toUpperCase() === "OPEN") {
      tracked.add(key);
      openCount++;
    }
  }
  const eligible = missed.filter((source) => !tracked.has(source.importer));
  const toOpen = eligible.slice(0, Math.max(0, maxOpen - openCount));
  return {
    toOpen,
    skippedTracked: missed.filter((source) => tracked.has(source.importer)).map((source) => source.importer),
    openCount,
    capped: eligible.length > toOpen.length,
  };
}

export function renderFreshnessText(report: FreshnessReport): string {
  const lines = report.sources.map((source) => {
    const age = source.ageDays === null ? "no reviewed rules" : `${source.ageDays} days since ${source.lastReviewedAt}`;
    return `${source.status === "missed" ? "!" : " "} ${source.importer}: ${source.status}; target ${source.targetDays} days; ${age}`;
  });
  return `${lines.join("\n")}\n${missedSources(report).length} missed of ${report.sources.length} source(s)\n`;
}

export interface FreshnessOptions {
  dryRun?: boolean;
  maxOpen?: number;
  repo?: string;
  runner?: CandidateIssueRunner;
}

/** Opens an issue for each missed source that has none open yet. */
export async function reportMisses(
  report: FreshnessReport,
  options: FreshnessOptions = {},
): Promise<{ opened: RenderedCandidateIssue[]; selection: FreshnessSelection }> {
  const runner = options.runner ?? defaultGitHubRunner;
  const missed = missedSources(report);
  let existing: IssueRecord[] = [];
  if (missed.length > 0 && (!options.dryRun || options.runner)) {
    try {
      existing = await runner.listExistingIssues(options.repo);
    } catch (error) {
      if (!options.dryRun) throw error;
    }
  }
  const selection = selectMissesToOpen(missed, existing, options.maxOpen);
  const opened: RenderedCandidateIssue[] = [];
  for (const source of selection.toOpen) {
    const rendered = renderFreshnessIssue(source, report.referenceDay);
    if (!options.dryRun) await runner.createIssue(rendered, options.repo);
    opened.push(rendered);
  }
  return { opened, selection };
}

function numberOption(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 0) throw new Error(`${name} needs a non-negative number.`);
  return parsed;
}

export async function main(argv: string[], runner?: CandidateIssueRunner): Promise<number> {
  const options: FreshnessOptions = {};
  let registryDir = "registry";
  let today: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    const value = () =>
      argv[++index] ??
      (() => {
        throw new Error(`${argument} needs a value.`);
      })();
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--max-open") options.maxOpen = numberOption(argv[++index], "--max-open");
    else if (argument === "--repo") options.repo = value();
    else if (argument === "--registry-dir") registryDir = value();
    else if (argument === "--today") today = value();
    else throw new Error(`Unknown argument ${argument}.`);
  }
  if (runner) options.runner = runner;
  const report = measureFreshness(
    await loadRegistries(resolve(registryDir)),
    await loadFreshnessTargets(),
    today ?? new Date().toISOString().slice(0, 10),
  );
  process.stdout.write(renderFreshnessText(report));
  const { opened, selection } = await reportMisses(report, options);
  process.stdout.write(
    `Issues ${options.dryRun ? "to open" : "opened"}: ${opened.length}; already tracked: ${selection.skippedTracked.length}\n`,
  );
  if (selection.capped) process.stdout.write("Open freshness issue cap reached; the rest are deferred.\n");
  return missedSources(report).length > 0 ? 10 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
