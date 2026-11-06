// Shared shapes for the endoflife.date comparison and its published JSON.

export interface SnapshotSource {
  homepage: string;
  catalog: string;
  cycles: string;
  license: string;
  licenseUrl: string;
  note: string;
}

export interface SnapshotCycle {
  cycle: string;
  releaseDate?: string;
  eol?: string | boolean;
  support?: string | boolean;
  eoas?: string | boolean;
  discontinued?: string | boolean;
  lts?: string | boolean;
}

export interface Snapshot {
  schemaVersion: "evergreen.comparison.endoflife-date.snapshot.v1";
  retrievedAt: string;
  source: SnapshotSource;
  catalog: string[];
  products: Record<string, SnapshotCycle[]>;
}

export interface RegistryRule {
  id: string;
  ecosystem: string;
  purl: string;
  vers: string;
  event: string;
  deadline?: string;
}

export const LIFECYCLE_EVENTS = ["end-of-life", "scheduled-end-of-life", "end-of-support"] as const;

export type Outcome =
  | "agree"
  | "disagree"
  | "not-comparable"
  | "not-lifecycle-event"
  | "no-snapshot"
  | "no-cycle"
  | "no-rule-date"
  | "no-endoflife-date";

export interface RuleScore {
  ruleId: string;
  ecosystem: string;
  purl: string;
  /** Present for a mapped rule, including one that later fails a different gate. */
  product?: string;
  /** The endoflife.date cycles the rule's range covers. */
  cycles?: string[];
  evergreenDate?: string;
  endoflifeDate?: string;
  outcome: Outcome;
  /** The reason code for `not-comparable`. */
  reason?: string;
  /** Cycles in the range for which endoflife.date publishes no end date. */
  missingCycles?: string[];
}

export interface GroundTruthReference {
  repository: string;
  commit: string;
  path: string;
  line?: number;
}

export interface CorpusEntry {
  repository: string;
  commit: string;
  expected: Array<{
    ruleId: string;
    path: string;
    line?: number;
    groundTruthSource?: { kind: string; note?: string };
  }>;
}

export interface Tally {
  rules: number;
  measured: number;
  agree: number;
  disagree: number;
  notComparable: number;
  notLifecycleEvent: number;
  noSnapshot: number;
  noCycle: number;
  noRuleDate: number;
  noEndoflifeDate: number;
}

export interface ProductRow {
  product: string;
  evergreenRules: number;
  evergreenFamilies: number;
  endoflifeCycles: number;
  measured: number;
  agree: number;
  disagree: number;
}

export interface NotComparableFamily {
  code: string;
  description: string;
  families: number;
  rules: number;
  examples: string[];
}

export interface Coverage {
  endoflifeProducts: number;
  endoflifeOnlyProducts: string[];
  evergreenRules: number;
  evergreenProductFamilies: number;
  sharedProducts: string[];
  mappedProductFamilies: number;
  notComparableFamilies: NotComparableFamily[];
}

export interface VendorCheckedRow {
  ruleId: string;
  product?: string;
  evergreenDate?: string;
  endoflifeDate?: string;
  vendorDate: string;
  evergreenMatches: boolean;
  endoflifeMatches: boolean;
}

export interface Correctness {
  sample: number;
  evergreenMatches: number;
  endoflifeMatches: number;
  rows: VendorCheckedRow[];
}

export interface Disagreement {
  ruleId: string;
  ecosystem: string;
  product?: string;
  cycles: string[];
  evergreenDate: string;
  endoflifeDate: string;
  differenceDays: number;
  inGroundTruth: boolean;
  references: Array<GroundTruthReference & { url: string }>;
  sources: { evergreen: string; endoflife: string };
}

export interface ComparisonResult {
  schemaVersion: "evergreen.comparison.endoflife-date.v1";
  snapshot: {
    retrievedAt: string;
    source: SnapshotSource;
    products: number;
    cycles: number;
  };
  evergreen: {
    registryRules: number;
    productFamilies: number;
    groundTruthRepositories: number;
    groundTruthRecords: number;
    groundTruthRules: number;
  };
  coverage: Coverage;
  agreement: { all: Tally; groundTruth: Tally };
  correctness: Correctness;
  products: ProductRow[];
  disagreements: Disagreement[];
}

export const RESULT_SCHEMA = "evergreen.comparison.endoflife-date.v1" as const;
export const SNAPSHOT_SCHEMA = "evergreen.comparison.endoflife-date.snapshot.v1" as const;
