// Stage 3 — resolve: merge detector output into the stable, deterministic findings and references a
// scan reports, and apply the `--only`/`--exclude` selectors.

import type { Finding, ScanResult, ScanSelection, UnclassifiedReference } from "../domain.js";

/**
 * Whether `value` (an ecosystem id or a rule-id prefix like `npm.package.request`) matches a rule:
 * it is the ecosystem itself, the full rule id, or a dotted prefix of it.
 */
export function scanSelectorMatches(value: string, detector: string, ruleId: string): boolean {
  return value === detector || ruleId === value || ruleId.startsWith(`${value}.`);
}

/** Keeps only the findings and unclassified references the `--only`/`--exclude` selectors allow. */
export function applyScanSelection(result: ScanResult, selection: ScanSelection): ScanResult {
  const only = selection.only ?? [];
  const exclude = selection.exclude ?? [];
  const included = (ruleId: string, detector: string): boolean =>
    (only.length === 0 || only.some((value) => scanSelectorMatches(value, detector, ruleId))) &&
    (exclude.length === 0 || !exclude.some((value) => scanSelectorMatches(value, detector, ruleId)));
  const findings = result.findings.filter((finding) => included(finding.ruleId, finding.detector));
  const references = (result.unclassified?.references ?? []).filter((reference) =>
    included(`${reference.detector}.${reference.component}`, reference.detector),
  );
  return {
    ...result,
    findings,
    ...(result.unclassified ? { unclassified: { count: references.length, references } } : {}),
    ...(only.length || exclude.length ? { selection } : {}),
  };
}

/** A stable sort key for an unclassified reference. */
function referenceKey(reference: UnclassifiedReference): string {
  return [
    reference.detector,
    reference.component,
    reference.location.path,
    reference.location.line ?? 0,
    reference.reference,
  ].join(":");
}

/** Sorts unclassified references by detector, component, path, line, and reference. */
export function sortReferences(references: readonly UnclassifiedReference[]): UnclassifiedReference[] {
  return [...references].sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}

/** Adds the advisory ids declared for each finding's rule, when the rule has any. */
export function withAdvisories(
  findings: readonly Finding[],
  advisories: ReadonlyMap<string, readonly string[]>,
): Finding[] {
  return findings.map((finding) => {
    const advisoryIds = advisories.get(finding.ruleId);
    return advisoryIds?.length ? { ...finding, advisoryIds: [...advisoryIds] } : finding;
  });
}

/** Sorts findings by their stable id so output is deterministic. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort((left, right) => left.id.localeCompare(right.id));
}
