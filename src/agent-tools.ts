import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { findingFingerprint } from "./baseline.js";
import { bundledRules } from "./check-dependency.js";
import type { DataInfo, Finding, ScanResult, Severity, SourceLocation, VerificationCommand } from "./domain.js";
import { createMigrationPacket } from "./migration-packet.js";
import type { Receipt } from "./receipt.js";
import { buildReceipt } from "./receipt.js";
import { renderReceiptMarkdown } from "./receipt-markdown.js";
import { readPinnedRuntimes } from "./runtime-pin.js";
import { runScanRequest } from "./scan-request.js";
import type { MigrationPacket } from "./migration-packet.js";

/** A finding reduced to what a list of deprecations shows. */
export interface DeprecationSummary {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  location: SourceLocation;
  usageCount: number;
  affectedFiles: number;
}

/** The deprecations a scan found, trimmed for display to an agent. */
export interface DeprecationList {
  schemaVersion: "evergreen.deprecations.v1";
  repositoryRoot: string;
  scannedAt: string;
  count: number;
  deprecations: DeprecationSummary[];
  data?: DataInfo;
}

/** The result of checking a migration against a later scan. */
export interface MigrationVerification {
  schemaVersion: "evergreen.verification.v1";
  repositoryRoot: string;
  findingId: string;
  verifiedAt: string;
  verified: boolean;
  commandsExecuted: false;
  summary: string;
  remainingFindings: Finding[];
  suggestedCommands: VerificationCommand[];
  /** What the change since this session's last scan did to the findings; present when a scan was observed first. */
  receipt?: Receipt;
  /** `receipt` rendered for a pull request body. */
  receipt_markdown?: string;
}

/** A finding observed in this session, with the repository it came from. */
export interface ObservedFinding {
  /** Short stable key of the repository root, used in the finding's resource URI. */
  repositoryKey: string;
  repositoryRoot: string;
  finding: Finding;
}

export const repositoryKey = (root: string): string => createHash("sha256").update(root).digest("hex").slice(0, 8);

/** Thrown when a finding is used before this session scanned the repository that contains it. */
export class FindingNotObservedError extends Error {
  constructor(findingId: string) {
    super(
      `Finding was not observed in this MCP session: ${findingId}. Call scan_repository, explain_deprecation, or create_migration_context before editing the repository.`,
    );
    this.name = "FindingNotObservedError";
  }
}

/**
 * Owns Evergreen's agent workflow behind a local, transport-independent interface.
 * Transport adapters should translate inputs and outputs only.
 */
export class EvergreenAgentTools {
  private readonly observed = new Map<string, Map<string, Finding>>();
  /** The most recent complete scan per repository, the "before" side of the next receipt. */
  private readonly lastScan = new Map<string, ScanResult>();

  async scan(repositoryPath = ".", baselinePath?: string): Promise<ScanResult> {
    // A baseline path is relative to the repository, as in the Action.
    const { result } = await runScanRequest({
      root: repositoryPath,
      ...(baselinePath ? { baselinePath } : {}),
    });
    this.remember(result);
    return result;
  }

  async list(repositoryPath = "."): Promise<DeprecationList> {
    const result = await this.scan(repositoryPath);
    return {
      schemaVersion: "evergreen.deprecations.v1",
      repositoryRoot: result.root,
      scannedAt: result.scannedAt,
      count: result.findings.length,
      ...(result.data ? { data: result.data } : {}),
      deprecations: result.findings.map((finding) => ({
        id: finding.id,
        ruleId: finding.ruleId,
        title: finding.title,
        severity: finding.severity,
        location: finding.location,
        usageCount: finding.impact?.usageCount ?? finding.usages?.length ?? 0,
        affectedFiles:
          finding.impact?.affectedFiles ?? new Set((finding.usages ?? []).map((usage) => usage.location.path)).size,
      })),
    };
  }

  async explain(findingId: string, repositoryPath = "."): Promise<Finding> {
    const result = await this.scan(repositoryPath);
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) throw new Error(`Finding not found: ${findingId}`);
    return finding;
  }

  async context(findingId: string, repositoryPath = "."): Promise<MigrationPacket> {
    const result = await this.scan(repositoryPath);
    return createMigrationPacket(result, findingId, await bundledRules(), await readPinnedRuntimes(result.root));
  }

  async verify(findingId: string, repositoryPath = "."): Promise<MigrationVerification> {
    const root = resolve(repositoryPath);
    const observed = this.observed.get(root)?.get(findingId);
    if (!observed) throw new FindingNotObservedError(findingId);

    const before = this.lastScan.get(root);
    const { result } = await runScanRequest({ root });
    const remainingFindings = result.findings.filter(
      (finding) => finding.ruleId === observed.ruleId && finding.location.path === observed.location.path,
    );
    this.remember(result);
    const verified = remainingFindings.length === 0;
    const receipt = before ? buildReceipt(before, result) : undefined;
    const suggestedCommands = [
      ...(observed.migration?.verification ?? []),
      {
        command: "evergreen scan . --json",
        purpose: "Confirm the lifecycle finding no longer appears.",
      },
    ].filter(
      (command, index, commands) => commands.findIndex((candidate) => candidate.command === command.command) === index,
    );

    return {
      schemaVersion: "evergreen.verification.v1",
      repositoryRoot: result.root,
      findingId,
      verifiedAt: result.scannedAt,
      verified,
      commandsExecuted: false,
      summary: verified
        ? "The previously observed deprecation is absent from a fresh local scan."
        : `A fresh local scan still reports ${remainingFindings.length} matching deprecation${remainingFindings.length === 1 ? "" : "s"}.`,
      remainingFindings,
      suggestedCommands,
      ...(receipt ? { receipt, receipt_markdown: renderReceiptMarkdown(receipt) } : {}),
    };
  }

  /** Every finding observed by this session so far, ordered by repository, then finding id. */
  observedFindings(): ObservedFinding[] {
    return [...this.observed.entries()]
      .flatMap(([root, findings]) =>
        [...findings.values()].map((finding) => ({
          repositoryKey: repositoryKey(root),
          repositoryRoot: root,
          finding,
        })),
      )
      .sort(
        (left, right) =>
          left.repositoryRoot.localeCompare(right.repositoryRoot) || left.finding.id.localeCompare(right.finding.id),
      );
  }

  observedFinding(key: string, findingId: string): ObservedFinding | undefined {
    return this.observedFindings().find((entry) => entry.repositoryKey === key && entry.finding.id === findingId);
  }

  private remember(result: ScanResult): void {
    this.lastScan.set(result.root, result);
    const findings = this.observed.get(result.root) ?? new Map<string, Finding>();
    for (const finding of result.findings) {
      const previous = findings.get(finding.id);
      if (!previous || findingFingerprint(previous) !== findingFingerprint(finding)) {
        findings.set(finding.id, finding);
      }
    }
    this.observed.set(result.root, findings);
  }
}
