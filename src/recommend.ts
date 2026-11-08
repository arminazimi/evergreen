import type { EvidenceSource } from "./domain.js";
import { EvergreenError } from "./evergreen-error.js";
import { lookupProduct, LookupError } from "@velella/ebb/lookup";
import type { LookupFinding } from "@velella/ebb/lookup";
import { parseVersLenient, versionScheme } from "@velella/ebb/vers";
import type { VersConstraint } from "@velella/ebb/vers";

export const RECOMMEND_SCHEMA_VERSION = "evergreen.recommend.v1" as const;

/** How long a line must stay supported before it is worth writing today. */
export const DEFAULT_MINIMUM_SUPPORT_DAYS = 180;

export type RecommendStatus =
  /** A release line qualifies; `recommended` names it. */
  | "recommended"
  /** The data lists lines for this product, and none is both unended and far enough from its end date. */
  | "no-qualifying-line"
  /** Evergreen has no lifecycle data for this product. That is not a statement that any version is safe. */
  | "no-data";

export interface QualifyingLine {
  /** The release line, such as `22` or `3.12`. */
  line: string;
  supportedUntil: string;
}

export interface AvoidedLine {
  /** The line, or the range as the rule writes it, such as `<5.0.0`. */
  line: string;
  /**
   * Why the entry is listed: the line ended, it ends before the minimum, the product is deprecated, or the rule's
   * range is wider than one release line and so cannot be recommended.
   */
  reason: "ended" | "ends-sooner" | "deprecated" | "not-a-line";
  ruleId: string;
  endDate?: string;
}

export interface RecommendResult {
  schemaVersion: typeof RECOMMEND_SCHEMA_VERSION;
  query: { name: string; minimumSupportDays: number; asOf: string };
  status: RecommendStatus;
  product?: { id: string; purl: string; name: string };
  recommended?: string;
  supportedUntil?: string;
  alternatives: QualifyingLine[];
  avoid: AvoidedLine[];
  sources: EvidenceSource[];
  message: string;
}

export interface RecommendInput {
  /** A product name as `lookup` accepts it, or a package URL such as `pkg:docker/library/node`. */
  name: string;
  /** Days a line must remain supported; defaults to 180. */
  minimumSupportDays?: number;
  /** The date the answer is for, `YYYY-MM-DD`. Injected so the answer is deterministic; defaults to today (UTC). */
  asOf?: string;
}

/** Events that end a line; the others (`deprecated`) carry no end date of their own. */
const END_EVENTS = new Set(["end-of-life", "scheduled-end-of-life", "end-of-support", "removed"]);

const NO_DATA_MESSAGE =
  "Evergreen has no lifecycle data for this product. This is not a statement that any version is safe.";

const DAY_MS = 86_400_000;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(date: string): boolean {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

/** The line a bounded range such as `>=20.0.0|<21.0.0` names (`20`), or undefined for any other range. */
function boundedLine(vers: string): { line: string; lower: string } | undefined {
  const range = parseVersLenient(vers);
  const [first, second, ...rest] = range.constraints;
  if (range.all || second === undefined || rest.length > 0 || first === undefined) return undefined;
  if (first.comparator !== ">=" || second.comparator !== "<") return undefined;
  return { line: first.version.replace(/(\.0)+$/, ""), lower: first.version };
}

function rangeLabel(vers: string): string {
  const range = parseVersLenient(vers);
  if (range.all) return "*";
  return range.constraints
    .map((constraint: VersConstraint) => `${constraint.comparator}${constraint.version}`)
    .join("|");
}

interface Candidate {
  line: string;
  lower: string;
  scheme: string;
  endDate: string;
  finding: LookupFinding;
}

function toCandidate(finding: LookupFinding): Candidate | undefined {
  if (!END_EVENTS.has(finding.event) || finding.deadline === undefined) return undefined;
  const bounded = boundedLine(finding.affectedVersions);
  if (bounded === undefined) return undefined;
  return {
    ...bounded,
    scheme: parseVersLenient(finding.affectedVersions).scheme,
    endDate: finding.deadline,
    finding,
  };
}

function avoidEntry(finding: LookupFinding, asOfDay: number, thresholdDay: number): AvoidedLine {
  const line = boundedLine(finding.affectedVersions)?.line ?? rangeLabel(finding.affectedVersions);
  const base = { line, ruleId: finding.ruleId };
  if (!END_EVENTS.has(finding.event)) return { ...base, reason: "deprecated" };
  if (finding.deadline === undefined) return { ...base, reason: "ended" };
  const end = dayNumber(finding.deadline);
  const reason = end <= asOfDay ? "ended" : end < thresholdDay ? "ends-sooner" : "not-a-line";
  return { ...base, reason, endDate: finding.deadline };
}

const newestFirst = (left: Candidate, right: Candidate): number => {
  try {
    return versionScheme(right.scheme).compare(right.lower, left.lower);
  } catch {
    return right.lower.localeCompare(left.lower);
  }
};

const bySortKey = (left: AvoidedLine, right: AvoidedLine): number =>
  (right.endDate ?? "").localeCompare(left.endDate ?? "") || left.ruleId.localeCompare(right.ruleId);

function describe(result: Pick<RecommendResult, "status" | "recommended" | "supportedUntil">, name: string): string {
  if (result.status === "recommended")
    return `Write ${name} ${result.recommended ?? ""}: the bundled data supports it until ${result.supportedUntil ?? ""}. This covers only what Evergreen's data lists; it is not a statement about newer versions.`;
  return `No release line of ${name} in Evergreen's data is both unended and far enough from its end date. The data lists only lines that end or are deprecated, so this is not a statement that any version is safe.`;
}

/**
 * Answers "which version should I write today?" from the bundled lifecycle rules alone. A line qualifies when it is
 * not ended and its end date is at least `minimumSupportDays` after `asOf`. The newest qualifying line is
 * recommended. The bundled data distinguishes no long-term line from a current one, so newest wins. Reads no network.
 */
function validate(input: RecommendInput): RecommendResult["query"] {
  const minimumSupportDays = input.minimumSupportDays ?? DEFAULT_MINIMUM_SUPPORT_DAYS;
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  if (!isoDate.test(asOf) || !isRealDate(asOf))
    throw new EvergreenError("invalid-argument", `Invalid asOf date "${asOf}"; expected YYYY-MM-DD.`);
  if (!Number.isInteger(minimumSupportDays) || minimumSupportDays < 0)
    throw new EvergreenError("invalid-argument", "minimumSupportDays must be a non-negative integer.");
  return { name: input.name, minimumSupportDays, asOf };
}

function noData(query: RecommendResult["query"], product?: RecommendResult["product"]): RecommendResult {
  return {
    schemaVersion: RECOMMEND_SCHEMA_VERSION,
    query,
    status: "no-data",
    ...(product === undefined ? {} : { product }),
    alternatives: [],
    avoid: [],
    sources: [],
    message: NO_DATA_MESSAGE,
  };
}

function classify(findings: readonly LookupFinding[], query: RecommendResult["query"]) {
  const asOfDay = dayNumber(query.asOf);
  const thresholdDay = asOfDay + query.minimumSupportDays;
  const qualifying: Candidate[] = [];
  const avoid: AvoidedLine[] = [];
  for (const finding of findings) {
    const candidate = toCandidate(finding);
    if (candidate !== undefined && dayNumber(candidate.endDate) >= thresholdDay) qualifying.push(candidate);
    else avoid.push(avoidEntry(finding, asOfDay, thresholdDay));
  }
  qualifying.sort(newestFirst);
  return { qualifying, avoid: avoid.sort(bySortKey) };
}

function uniqueSources(findings: readonly LookupFinding[]): EvidenceSource[] {
  const sources = findings.flatMap((finding) => finding.sources);
  return [...new Map(sources.map((source) => [source.url, source])).values()];
}

export async function recommendVersion(input: RecommendInput): Promise<RecommendResult> {
  const query = validate(input);
  let lookup;
  try {
    lookup = await lookupProduct(input.name);
  } catch (error) {
    if (error instanceof LookupError) return noData(query);
    throw error;
  }
  const { id, purl, name } = lookup.product;
  const product = { id, purl, name };
  if (lookup.findings.length === 0) return noData(query, product);

  const { qualifying, avoid } = classify(lookup.findings, query);
  const [best, ...others] = qualifying;
  const pick = best === undefined ? {} : { recommended: best.line, supportedUntil: best.endDate };
  const status: RecommendStatus = best === undefined ? "no-qualifying-line" : "recommended";
  return {
    schemaVersion: RECOMMEND_SCHEMA_VERSION,
    query,
    status,
    product,
    ...pick,
    alternatives: others.map((candidate) => ({ line: candidate.line, supportedUntil: candidate.endDate })),
    avoid,
    sources: uniqueSources(best === undefined ? lookup.findings : [best.finding]),
    message: describe({ status, ...pick }, product.name),
  };
}

/** Plain text: the answer first, then what to avoid, then the evidence links. */
export function renderRecommendText(result: RecommendResult): string {
  const lines = [result.message];
  if (result.status === "recommended")
    lines.unshift(
      `${result.product?.name ?? result.query.name}: ${result.recommended} (supported until ${result.supportedUntil})`,
    );
  for (const alternative of result.alternatives)
    lines.push(`Alternative: ${alternative.line} (until ${alternative.supportedUntil})`);
  for (const entry of result.avoid)
    lines.push(`Avoid: ${entry.line} (${entry.reason}${entry.endDate === undefined ? "" : ` ${entry.endDate}`})`);
  for (const source of result.sources) lines.push(`  ${source.title}: ${source.url}`);
  if (result.product !== undefined) lines.push(`Product: ${result.product.purl}`);
  lines.push(`As of ${result.query.asOf}, at least ${result.query.minimumSupportDays} days of support.`);
  return lines.join("\n");
}
