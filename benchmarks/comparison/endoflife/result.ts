// Assembles the endoflife.date comparison: product coverage, date agreement, and vendor-checked correctness.
//
// Every registry rule lands in exactly one agreement bucket, and the five buckets sum to the registry size.
// The ground-truth sample is the distinct rule ids the pinned corpus expects; it never adds a rule the
// corpus does not exercise.

import { notComparableReason, productFor } from "./mapping.js";
import { scoreRule } from "./score.js";
import { RESULT_SCHEMA } from "./types.js";
import type {
  ComparisonResult,
  CorpusEntry,
  Coverage,
  Correctness,
  Disagreement,
  GroundTruthReference,
  NotComparableFamily,
  ProductRow,
  RegistryRule,
  RuleScore,
  Snapshot,
  Tally,
  VendorCheckedRow,
} from "./types.js";
import { vendorCheckedDate } from "./vendor.js";

export interface BuildInput {
  rules: readonly RegistryRule[];
  snapshot: Snapshot;
  entries: readonly CorpusEntry[];
}

interface GroundTruth {
  references: Map<string, GroundTruthReference[]>;
  notes: Map<string, string[]>;
  records: number;
}

function collectGroundTruth(entries: readonly CorpusEntry[]): GroundTruth {
  const references = new Map<string, GroundTruthReference[]>();
  const notes = new Map<string, string[]>();
  let records = 0;
  for (const entry of entries) {
    for (const expected of entry.expected) {
      records++;
      const list = references.get(expected.ruleId) ?? [];
      list.push({
        repository: entry.repository,
        commit: entry.commit,
        path: expected.path,
        ...(expected.line === undefined ? {} : { line: expected.line }),
      });
      references.set(expected.ruleId, list);
      if (expected.groundTruthSource?.note) {
        notes.set(expected.ruleId, [...(notes.get(expected.ruleId) ?? []), expected.groundTruthSource.note]);
      }
    }
  }
  return { references, notes, records };
}

const emptyTally = (rules: number): Tally => ({
  rules,
  measured: 0,
  agree: 0,
  disagree: 0,
  notComparable: 0,
  notLifecycleEvent: 0,
  noSnapshot: 0,
  noCycle: 0,
  noRuleDate: 0,
  noEndoflifeDate: 0,
});

/** Counts the rows by outcome. `measured` is agree plus disagree. */
export function tally(scores: readonly RuleScore[]): Tally {
  const result = emptyTally(scores.length);
  for (const score of scores) {
    switch (score.outcome) {
      case "agree":
        result.agree++;
        result.measured++;
        break;
      case "disagree":
        result.disagree++;
        result.measured++;
        break;
      case "not-comparable":
        result.notComparable++;
        break;
      case "not-lifecycle-event":
        result.notLifecycleEvent++;
        break;
      case "no-snapshot":
        result.noSnapshot++;
        break;
      case "no-cycle":
        result.noCycle++;
        break;
      case "no-rule-date":
        result.noRuleDate++;
        break;
      case "no-endoflife-date":
        result.noEndoflifeDate++;
        break;
    }
  }
  return result;
}

function coverage(rules: readonly RegistryRule[], snapshot: Snapshot, shared: Set<string>): Coverage {
  const families = [...new Set(rules.map((rule) => rule.purl))];
  const mappedFamilies = families.filter((purl) => productFor(purl));
  const byReason = new Map<string, { description: string; purls: Set<string>; rules: number }>();
  for (const rule of rules) {
    const reason = notComparableReason(rule.purl);
    if (!reason) continue;
    const entry = byReason.get(reason.code) ?? { description: reason.description, purls: new Set<string>(), rules: 0 };
    entry.purls.add(rule.purl);
    entry.rules++;
    byReason.set(reason.code, entry);
  }
  const notComparableFamilies: NotComparableFamily[] = [...byReason.entries()]
    .map(([code, entry]) => ({
      code,
      description: entry.description,
      families: entry.purls.size,
      rules: entry.rules,
      examples: [...entry.purls].sort().slice(0, 5),
    }))
    .sort((left, right) => right.rules - left.rules || left.code.localeCompare(right.code));
  const endoflifeOnlyProducts = snapshot.catalog.filter((product) => !shared.has(product)).sort();
  return {
    endoflifeProducts: snapshot.catalog.length,
    endoflifeOnlyProducts,
    evergreenRules: rules.length,
    evergreenProductFamilies: families.length,
    sharedProducts: [...shared].sort(),
    mappedProductFamilies: mappedFamilies.length,
    notComparableFamilies,
  };
}

function correctness(groundTruth: GroundTruth, scores: readonly RuleScore[]): Correctness {
  const rows: VendorCheckedRow[] = [];
  for (const score of scores) {
    if (score.outcome !== "agree" && score.outcome !== "disagree") continue;
    const vendorDate = (groundTruth.notes.get(score.ruleId) ?? [])
      .map((note) => vendorCheckedDate(note))
      .find((date) => date !== undefined);
    if (!vendorDate) continue;
    rows.push({
      ruleId: score.ruleId,
      ...(score.product ? { product: score.product } : {}),
      ...(score.evergreenDate ? { evergreenDate: score.evergreenDate } : {}),
      ...(score.endoflifeDate ? { endoflifeDate: score.endoflifeDate } : {}),
      vendorDate,
      evergreenMatches: score.evergreenDate === vendorDate,
      endoflifeMatches: score.endoflifeDate === vendorDate,
    });
  }
  rows.sort((left, right) => left.ruleId.localeCompare(right.ruleId));
  return {
    sample: rows.length,
    evergreenMatches: rows.filter((row) => row.evergreenMatches).length,
    endoflifeMatches: rows.filter((row) => row.endoflifeMatches).length,
    rows,
  };
}

function productRows(scores: readonly RuleScore[], snapshot: Snapshot): ProductRow[] {
  const rows = new Map<string, { families: Set<string>; rules: number; agree: number; disagree: number }>();
  for (const score of scores) {
    if (!score.product) continue;
    const row = rows.get(score.product) ?? { families: new Set<string>(), rules: 0, agree: 0, disagree: 0 };
    row.families.add(score.purl);
    row.rules++;
    if (score.outcome === "agree") row.agree++;
    if (score.outcome === "disagree") row.disagree++;
    rows.set(score.product, row);
  }
  return [...rows.entries()]
    .map(([product, row]) => ({
      product,
      evergreenRules: row.rules,
      evergreenFamilies: row.families.size,
      endoflifeCycles: snapshot.products[product]?.length ?? 0,
      measured: row.agree + row.disagree,
      agree: row.agree,
      disagree: row.disagree,
    }))
    .sort((left, right) => left.product.localeCompare(right.product));
}

function daysBetween(left: string, right: string): number {
  return Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000);
}

function disagreement(score: RuleScore, groundTruth: GroundTruth): Disagreement {
  const references = groundTruth.references.get(score.ruleId) ?? [];
  const product = score.product ?? "";
  return {
    ruleId: score.ruleId,
    ecosystem: score.ecosystem,
    ...(score.product ? { product } : {}),
    cycles: score.cycles ?? [],
    evergreenDate: score.evergreenDate ?? "",
    endoflifeDate: score.endoflifeDate ?? "",
    differenceDays: daysBetween(score.evergreenDate ?? "", score.endoflifeDate ?? ""),
    inGroundTruth: groundTruth.references.has(score.ruleId),
    references: references.map((reference) => ({
      ...reference,
      url: `https://github.com/${reference.repository}/blob/${reference.commit}/${reference.path}${
        reference.line === undefined ? "" : `#L${reference.line}`
      }`,
    })),
    sources: {
      evergreen: `https://github.com/arminazimi/evergreen/blob/main/docs/rules/${score.ruleId}.md`,
      endoflife: `https://endoflife.date/${product}`,
    },
  };
}

/** Builds the published result. The output is deterministic: every collection is sorted and no clock is read. */
export function buildResult(input: BuildInput): ComparisonResult {
  const groundTruth = collectGroundTruth(input.entries);
  const rulesById = new Map(input.rules.map((rule) => [rule.id, rule]));
  const allScores = input.rules.map((rule) => scoreRule(rule, input.snapshot));
  const groundTruthScores = [...groundTruth.references.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((ruleId) => {
      const rule = rulesById.get(ruleId);
      if (!rule) throw new Error(`ground-truth rule "${ruleId}" is not in the registry`);
      return scoreRule(rule, input.snapshot);
    });
  const shared = new Set(
    input.rules.flatMap((rule) => {
      const reference = productFor(rule.purl);
      return reference ? [reference.product] : [];
    }),
  );
  const cycles = Object.values(input.snapshot.products).reduce((sum, list) => sum + list.length, 0);
  return {
    schemaVersion: RESULT_SCHEMA,
    snapshot: {
      retrievedAt: input.snapshot.retrievedAt,
      source: input.snapshot.source,
      products: Object.keys(input.snapshot.products).length,
      cycles,
    },
    evergreen: {
      registryRules: input.rules.length,
      productFamilies: new Set(input.rules.map((rule) => rule.purl)).size,
      groundTruthRepositories: input.entries.length,
      groundTruthRecords: groundTruth.records,
      groundTruthRules: groundTruth.references.size,
    },
    coverage: coverage(input.rules, input.snapshot, shared),
    agreement: { all: tally(allScores), groundTruth: tally(groundTruthScores) },
    correctness: correctness(groundTruth, groundTruthScores),
    products: productRows(allScores, input.snapshot),
    disagreements: allScores
      .filter((score) => score.outcome === "disagree")
      .map((score) => disagreement(score, groundTruth))
      .sort((left, right) => left.ruleId.localeCompare(right.ruleId)),
  };
}
