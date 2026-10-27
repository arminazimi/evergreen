import { fetchJson } from "./types.js";
import type { DraftRule, Importer, ImporterContext } from "./types.js";
import { OSV_CANDIDATES } from "./osv-candidates.js";
import type { OsvCandidate } from "./osv-candidates.js";

export const OSV_QUERY_URL = "https://api.osv.dev/v1/query";
export const OSV_VULN_URL = (id: string) => `https://osv.dev/vulnerability/${encodeURIComponent(id)}`;

interface OsvEvent {
  introduced?: string;
  fixed?: string;
  last_affected?: string;
  limit?: string;
}

interface OsvAffected {
  package?: { name?: string; ecosystem?: string };
  ranges?: Array<{ type?: string; events?: OsvEvent[] }>;
}

interface OsvVuln {
  id?: string;
  withdrawn?: string;
  affected?: OsvAffected[];
}

interface OsvQueryResponse {
  vulns?: OsvVuln[];
}

/** True when this package entry has at least one range and none of those ranges name a fixed version. */
export function isUnfixedForPackage(vuln: OsvVuln, name: string): boolean {
  if (typeof vuln.withdrawn === "string" && vuln.withdrawn) return false;
  const entries = (vuln.affected ?? []).filter((entry) => entry.package?.name === name);
  if (entries.length === 0) return false;
  let sawRange = false;
  for (const entry of entries) {
    for (const range of entry.ranges ?? []) {
      const events = range.events ?? [];
      if (events.length === 0) continue;
      sawRange = true;
      if (events.some((event) => typeof event.fixed === "string" && event.fixed.length > 0)) return false;
    }
  }
  return sawRange;
}

export function queryBody(candidate: OsvCandidate): string {
  return JSON.stringify({ package: { name: candidate.name, ecosystem: candidate.osvEcosystem } });
}

function draftFor(candidate: OsvCandidate, ids: string[]): DraftRule {
  const listed = ids.join(", ");
  return {
    id: candidate.osvRuleId,
    ecosystem: "osv",
    purl: candidate.purl,
    vers: `vers:${candidate.versScheme}/*`,
    event: "deprecated",
    title: `${candidate.name} has unfixed OSV advisories`,
    summary: `OSV lists ${listed} against ${candidate.name} with no fixed version in the affected ranges.`,
    severity: "high",
    sources: ids.map((id) => ({ title: id, url: OSV_VULN_URL(id) })),
    "x-osv": { ids, ruleId: candidate.ruleId },
  };
}

export const osvImporter: Importer = {
  id: "osv",
  ecosystem: "osv",
  description: "OSV advisories with no fixed version for packages that already have a lifecycle rule",
  sources: [
    { title: "OSV API", url: "https://google.github.io/osv.dev/api/" },
    { title: "OSV schema", url: "https://ossf.github.io/osv-schema/" },
  ],

  async import(context: ImporterContext) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const withoutAdvisories: string[] = [];

    for (const candidate of OSV_CANDIDATES) {
      const response = await fetchJson<OsvQueryResponse>(context, OSV_QUERY_URL, {
        accept: "application/json",
        body: queryBody(candidate),
      });
      const ids = [...new Set((response.vulns ?? []).filter((vuln) => typeof vuln.id === "string" && isUnfixedForPackage(vuln, candidate.name)).map((vuln) => vuln.id!))].sort((left, right) =>
        left.localeCompare(right),
      );
      if (ids.length === 0) {
        withoutAdvisories.push(candidate.osvRuleId);
        continue;
      }
      rules.push(draftFor(candidate, ids));
    }

    if (withoutAdvisories.length > 0) {
      notes.push(
        `No unfixed OSV advisories for these lifecycle rules (remove them from OSV_CANDIDATES if that stays true): ${withoutAdvisories.join(", ")}.`,
      );
    }
    return { rules, notes };
  },
};
