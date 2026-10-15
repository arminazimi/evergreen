import type { EvidenceSource, MigrationGuidance, Severity, UsageMatcher } from "./domain.js";
import { severityValues } from "./domain.js";
import { parsePurl, purlIdentity } from "./purl.js";
import { isMigrationGuidance, isUsageMatcher, RegistryValidationError, validateRegistry } from "./sdk.js";
import type { Registry, RegistryDefinition } from "./sdk.js";
import { parseVers, validateVersVersions, versionScheme } from "./vers/index.js";

export const REGISTRY_V2_SCHEMA_VERSION = "evergreen.registry.v2" as const;

/** Review window applied when a registry does not declare `freshness.maxReviewAgeDays`. */
export const DEFAULT_MAX_REVIEW_AGE_DAYS = 365;

export const lifecycleEvents = ["deprecated", "end-of-support", "end-of-life", "removed"] as const;
export type LifecycleEvent = (typeof lifecycleEvents)[number];

export interface Provenance {
  /** Date the evidence was last seen at its source (YYYY-MM-DD). */
  observedAt: string;
  /** Date a maintainer last reviewed the rule against its sources (YYYY-MM-DD). */
  reviewedAt: string;
  reviewer: string;
  /** Importer that drafted the rule, when one did. */
  importer?: string;
}

export interface RegistryV2Rule {
  id: string;
  ecosystem: string;
  purl: string;
  vers: string;
  event: LifecycleEvent;
  title: string;
  summary: string;
  severity: Severity;
  replacement?: string;
  deadline?: string;
  sources: EvidenceSource[];
  provenance: Provenance;
  migration?: MigrationGuidance;
  usage?: UsageMatcher[];
  /** Ecosystem matching hints such as `x-npm` or `x-github-actions`. */
  [extension: `x-${string}`]: Record<string, unknown>;
}

export interface RegistryV2 {
  schemaVersion: typeof REGISTRY_V2_SCHEMA_VERSION;
  ecosystem: string;
  freshness?: { maxReviewAgeDays: number };
  rules: RegistryV2Rule[];
}

export interface StaleRule {
  ruleId: string;
  reviewedAt: string;
  ageDays: number;
  maxReviewAgeDays: number;
}

type UnknownRecord = Record<string, unknown>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RULE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const EXTENSION = /^x-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RULE_FIELDS = new Set([
  "id", "ecosystem", "purl", "vers", "event", "title", "summary", "severity", "replacement",
  "deadline", "sources", "provenance", "migration", "usage",
]);

/** Version schemes each PURL type may use. Types not listed accept any registered scheme. */
const SCHEMES_BY_PURL_TYPE: Record<string, readonly string[]> = {
  npm: ["npm", "semver"],
  pypi: ["pypi"],
  golang: ["golang", "semver"],
  cargo: ["cargo", "semver"],
  maven: ["maven"],
  nuget: ["nuget"],
  gem: ["gem"],
  composer: ["composer", "semver"],
  github: ["semver"],
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

function ruleIssues(rule: unknown, index: number, ecosystem: string | undefined): string[] {
  if (!isRecord(rule)) return [`rules[${index}]: must be an object`];
  const name = isNonEmptyString(rule.id) ? `rule "${rule.id}"` : `rules[${index}]`;
  const issues: string[] = [];
  const problem = (message: string) => issues.push(`${name}: ${message}`);

  if (!isNonEmptyString(rule.id)) problem("id is required");
  else if (!RULE_ID.test(rule.id)) problem("id must use lowercase letters, numbers, dots, and hyphens");

  if (!isNonEmptyString(rule.ecosystem) || !SLUG.test(rule.ecosystem)) problem("ecosystem is required and must be a lowercase slug");
  else if (ecosystem !== undefined && rule.ecosystem !== ecosystem) {
    problem(`ecosystem "${rule.ecosystem}" does not match the registry ecosystem "${ecosystem}"`);
  }

  for (const key of Object.keys(rule)) {
    if (!RULE_FIELDS.has(key) && !EXTENSION.test(key)) problem(`unknown field "${key}"`);
    if (EXTENSION.test(key) && !isRecord(rule[key])) problem(`${key} must be an object`);
  }

  for (const field of ["title", "summary"] as const) {
    if (!isNonEmptyString(rule[field])) problem(`${field} is required`);
  }
  if (!severityValues.includes(rule.severity as Severity)) problem(`severity must be one of ${severityValues.join(", ")}`);
  if (!lifecycleEvents.includes(rule.event as LifecycleEvent)) problem(`event must be one of ${lifecycleEvents.join(", ")}`);
  if (rule.replacement !== undefined && !isNonEmptyString(rule.replacement)) problem("replacement must be a non-empty string");
  if (rule.deadline !== undefined && !isIsoDate(rule.deadline)) problem("deadline must be a valid date (YYYY-MM-DD)");

  let purlType: string | undefined;
  if (!isNonEmptyString(rule.purl)) {
    problem("purl is required");
  } else {
    try {
      const parsed = parsePurl(rule.purl);
      const identity = purlIdentity(parsed);
      if (identity !== rule.purl) problem(`purl must be canonical and version-less (expected "${identity}")`);
      purlType = parsed.type;
    } catch (error) {
      problem(`purl is invalid: ${(error as Error).message}`);
    }
  }

  if (!isNonEmptyString(rule.vers)) {
    problem("vers is required");
  } else {
    try {
      const range = parseVers(rule.vers);
      versionScheme(range.scheme);
      validateVersVersions(range);
      const allowed = purlType ? SCHEMES_BY_PURL_TYPE[purlType] : undefined;
      if (allowed && !allowed.includes(range.scheme)) {
        problem(`vers scheme "${range.scheme}" does not fit purl type "${purlType}" (use ${allowed.join(" or ")})`);
      }
    } catch (error) {
      problem(`vers is invalid: ${(error as Error).message}`);
    }
  }

  if (!Array.isArray(rule.sources) || rule.sources.length === 0) {
    problem("sources must list at least one authoritative source");
  } else {
    rule.sources.forEach((source, sourceIndex) => {
      if (!isRecord(source) || !isNonEmptyString(source.title)) problem(`sources[${sourceIndex}].title is required`);
      if (!isRecord(source) || !isNonEmptyString(source.url) || !/^https:\/\/\S+$/.test(source.url)) {
        problem(`sources[${sourceIndex}].url must be an https URL`);
      }
      if (isRecord(source) && source.accessedAt !== undefined && !isIsoDate(source.accessedAt)) {
        problem(`sources[${sourceIndex}].accessedAt must be a valid date (YYYY-MM-DD)`);
      }
    });
  }

  if (!isRecord(rule.provenance)) {
    problem("provenance is required");
  } else {
    const { observedAt, reviewedAt, reviewer, importer } = rule.provenance;
    if (observedAt === undefined) problem("provenance.observedAt is required");
    else if (!isIsoDate(observedAt)) problem("provenance.observedAt must be a valid date (YYYY-MM-DD)");
    if (reviewedAt === undefined) problem("provenance.reviewedAt is required");
    else if (!isIsoDate(reviewedAt)) problem("provenance.reviewedAt must be a valid date (YYYY-MM-DD)");
    if (isIsoDate(observedAt) && isIsoDate(reviewedAt) && dayNumber(reviewedAt) < dayNumber(observedAt)) {
      problem("provenance.reviewedAt must not be earlier than provenance.observedAt");
    }
    if (!isNonEmptyString(reviewer)) problem("provenance.reviewer is required");
    if (importer !== undefined && !isNonEmptyString(importer)) problem("provenance.importer must be a non-empty string");
  }

  if (rule.migration !== undefined && !isMigrationGuidance(rule.migration)) problem("migration is not valid migration guidance");
  if (rule.usage !== undefined && (!Array.isArray(rule.usage) || !rule.usage.every(isUsageMatcher))) {
    problem("usage must be a list of valid usage matchers");
  }
  return issues;
}

/** Lists every problem in a v2 registry, or an empty array when it is valid. Never throws. */
export function registryV2Issues(value: unknown): string[] {
  if (!isRecord(value)) return ["registry must be a JSON object"];
  const issues: string[] = [];
  if (value.schemaVersion !== REGISTRY_V2_SCHEMA_VERSION) {
    issues.push(`schemaVersion must be "${REGISTRY_V2_SCHEMA_VERSION}", found "${String(value.schemaVersion ?? "missing")}"`);
  }
  const ecosystem = isNonEmptyString(value.ecosystem) && SLUG.test(value.ecosystem) ? value.ecosystem : undefined;
  if (!ecosystem) issues.push("ecosystem is required and must be a lowercase slug");

  if (value.freshness !== undefined) {
    const days = isRecord(value.freshness) ? value.freshness.maxReviewAgeDays : undefined;
    if (typeof days !== "number" || !Number.isInteger(days) || days < 1) {
      issues.push("freshness.maxReviewAgeDays must be a positive integer");
    }
  }
  for (const key of Object.keys(value)) {
    if (!["schemaVersion", "ecosystem", "freshness", "rules"].includes(key)) issues.push(`unknown field "${key}"`);
  }

  if (!Array.isArray(value.rules)) {
    issues.push("rules must be an array");
    return issues;
  }
  const seen = new Set<string>();
  value.rules.forEach((rule, index) => {
    issues.push(...ruleIssues(rule, index, ecosystem));
    const id = isRecord(rule) ? rule.id : undefined;
    if (isNonEmptyString(id)) {
      if (seen.has(id)) issues.push(`rule "${id}": id is duplicated`);
      seen.add(id);
    }
  });
  return issues;
}

/** Validates a v2 registry and throws one error that lists every problem found. */
export function validateRegistryV2(value: unknown): RegistryV2 {
  const issues = registryV2Issues(value);
  if (issues.length > 0) {
    const shown = issues.slice(0, 20).map((issue) => `- ${issue}`);
    if (issues.length > 20) shown.push(`- … and ${issues.length - 20} more`);
    throw new RegistryValidationError(`Invalid registry (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n${shown.join("\n")}`);
  }
  return value as RegistryV2;
}

/**
 * Rules whose last review is older than the registry's review window.
 * Scans never call this; maintainer tooling and scheduled checks do, so scans stay deterministic.
 */
export function staleRules(registry: RegistryV2, now: Date): StaleRule[] {
  const maxReviewAgeDays = registry.freshness?.maxReviewAgeDays ?? DEFAULT_MAX_REVIEW_AGE_DAYS;
  const today = Math.floor(now.getTime() / 86_400_000);
  return registry.rules
    .map((rule) => ({
      ruleId: rule.id,
      reviewedAt: rule.provenance.reviewedAt,
      ageDays: today - dayNumber(rule.provenance.reviewedAt),
      maxReviewAgeDays,
    }))
    .filter((entry) => entry.ageDays > maxReviewAgeDays);
}

const V2_ONLY_FIELDS = new Set(["purl", "vers", "event", "provenance"]);

/**
 * A v2 rule seen through the shape detectors already consume: v2-only identity and provenance
 * fields are dropped, and the `x-<ecosystem>` hints are merged in. A rule migrated from v1 therefore
 * looks exactly like it did before, which keeps scan output unchanged.
 */
export function legacyRule(rule: RegistryV2Rule): Record<string, unknown> {
  const view: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rule)) {
    if (V2_ONLY_FIELDS.has(key) || EXTENSION.test(key)) continue;
    view[key] = value;
  }
  const hints = (rule as unknown as UnknownRecord)[`x-${rule.ecosystem}`];
  return isRecord(hints) ? { ...view, ...hints } : view;
}

/**
 * Loads a registry file that is either the detector's own v1 format or the shared v2 format.
 * Both produce the detector's rule type, so a registry can move to v2 without changing the detector.
 */
export function loadRegistryRules<Rule>(
  value: unknown,
  definition: RegistryDefinition<Rule>,
): Registry<Rule> {
  if (isRecord(value) && value.schemaVersion === REGISTRY_V2_SCHEMA_VERSION) {
    const registry = validateRegistryV2(value);
    const rules = registry.rules.map((rule) => {
      const view = legacyRule(rule);
      if (!definition.isRule(view)) {
        throw new RegistryValidationError(
          `Invalid registry rule "${rule.id}": it does not have the fields this detector reads. Check its "x-${rule.ecosystem}" hints.`,
        );
      }
      return view;
    });
    return { schemaVersion: REGISTRY_V2_SCHEMA_VERSION, rules };
  }
  if (isRecord(value) && value.schemaVersion !== definition.schemaVersion && value.schemaVersion !== undefined) {
    throw new RegistryValidationError(
      `Unsupported registry schema: ${String(value.schemaVersion)}; expected ${definition.schemaVersion} or ${REGISTRY_V2_SCHEMA_VERSION}.`,
    );
  }
  return validateRegistry(value, definition);
}
