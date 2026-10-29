import { basename } from "node:path";

import { severityValues } from "../domain.js";
import type { Finding, Severity } from "../domain.js";

export const PORTAL_SCHEMA_VERSION = "evergreen.portal.v1" as const;

export type PortalSeverityCounts = Record<Severity, number>;

/** One scanned path summarized for a developer portal catalog. */
export interface PortalService {
  path: string;
  severities: PortalSeverityCounts;
  /** Earliest finding deadline (YYYY-MM-DD), when any finding has one. */
  nextEndOfLife?: string;
  /** Where a portal can open the detailed Evergreen report for this path. */
  reportLink: string;
}

/** Versioned catalog of lifecycle risk per scanned path for Backstage, Grafana, Port, and Cortex. */
export interface PortalCatalog {
  schemaVersion: typeof PORTAL_SCHEMA_VERSION;
  services: PortalService[];
}

export interface PortalServiceInput {
  path: string;
  findings: readonly Pick<Finding, "severity" | "deadline">[];
  reportLink: string;
}

function emptyCounts(): PortalSeverityCounts {
  return Object.fromEntries(severityValues.map((severity) => [severity, 0])) as PortalSeverityCounts;
}

/**
 * Builds a deterministic developer-portal catalog from scanned paths.
 * Input order does not affect the result; services are sorted by path.
 */
export function exportPortal(inputs: readonly PortalServiceInput[]): PortalCatalog {
  const services = inputs
    .map((input): PortalService => {
      const severities = emptyCounts();
      const deadlines: string[] = [];
      for (const finding of input.findings) {
        severities[finding.severity] += 1;
        if (finding.deadline) deadlines.push(finding.deadline);
      }
      deadlines.sort();
      return {
        path: input.path,
        severities,
        ...(deadlines[0] !== undefined ? { nextEndOfLife: deadlines[0] } : {}),
        reportLink: input.reportLink,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
  return { schemaVersion: PORTAL_SCHEMA_VERSION, services };
}

/**
 * Conventional report artifact name for a scanned path. When `reportBaseUrl` is set, returns an
 * absolute URL under that base so portals can deep-link to CI artifacts.
 */
export function portalReportLink(scannedPath: string, reportBaseUrl?: string): string {
  const artifact = `evergreen-report-${basename(scannedPath)}.json`;
  if (reportBaseUrl === undefined || reportBaseUrl === "") return artifact;
  const base = reportBaseUrl.endsWith("/") ? reportBaseUrl : `${reportBaseUrl}/`;
  return new URL(artifact, base).href;
}
