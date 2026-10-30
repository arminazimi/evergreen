import type { DataInfo, Finding, ScanResult, Severity, VerificationCommand } from "./domain.js";
import { verifyFix } from "./fix/verify.js";

/** The format a receipt declares, so a consumer can tell it from its contents. */
export const RECEIPT_SCHEMA = "evergreen.receipt.v1" as const;

/** A finding as a receipt records it: enough to recognize it, not the whole finding. */
export interface ReceiptFinding {
  id: string;
  /** The rule the finding comes from. */
  rule: string;
  title: string;
  severity: Severity;
  /** Repository-relative path. */
  path: string;
  line?: number;
}

/** How many findings the change left each way. */
export interface ReceiptCounts {
  resolved: number;
  remaining: number;
  introduced: number;
}

/** The lifecycle data behind each side of the comparison; null when a scan did not record it. */
export interface ReceiptData {
  before: DataInfo | null;
  after: DataInfo | null;
}

/** What a change did to the findings, in one deterministic object. */
export interface Receipt {
  schema: typeof RECEIPT_SCHEMA;
  counts: ReceiptCounts;
  resolved: ReceiptFinding[];
  remaining: ReceiptFinding[];
  introduced: ReceiptFinding[];
  /** The verification commands the touched rules name. They are printed for the reader and never run. */
  commands: VerificationCommand[];
  data: ReceiptData;
}

export interface BuildReceiptOptions {
  /** Lifecycle data to record for a scan that does not carry its own, for example an older `scan --json` file. */
  data?: Partial<ReceiptData>;
}

const toReceiptFinding = (finding: Finding): ReceiptFinding => ({
  id: finding.id,
  rule: finding.ruleId,
  title: finding.title,
  severity: finding.severity,
  path: finding.location.path,
  ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
});

const byId = (left: ReceiptFinding, right: ReceiptFinding): number => left.id.localeCompare(right.id);

const record = (scanned: DataInfo | undefined, override: DataInfo | null | undefined): DataInfo | null =>
  override !== undefined ? override : (scanned ?? null);

/**
 * Compares the scan taken before a change with the scan after it and records the outcome. The comparison
 * is `verifyFix`: a fix edits in place, so findings match by id. Reads no clock and no environment, and
 * sorts every list, so the same two scans always produce the same receipt.
 */
export function buildReceipt(before: ScanResult, after: ScanResult, options: BuildReceiptOptions = {}): Receipt {
  const comparison = verifyFix(before, after);
  const resolved = comparison.resolved.map(toReceiptFinding).sort(byId);
  const remaining = comparison.remaining.map(toReceiptFinding).sort(byId);
  const introduced = comparison.introduced.map(toReceiptFinding).sort(byId);
  const commands = [...comparison.commands].sort(
    (left, right) => left.command.localeCompare(right.command) || left.purpose.localeCompare(right.purpose),
  );
  return {
    schema: RECEIPT_SCHEMA,
    counts: { resolved: resolved.length, remaining: remaining.length, introduced: introduced.length },
    resolved,
    remaining,
    introduced,
    commands,
    data: { before: record(before.data, options.data?.before), after: record(after.data, options.data?.after) },
  };
}
