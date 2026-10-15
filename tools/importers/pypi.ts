import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";
import { PYPI_CANDIDATES } from "./pypi-candidates.js";

const SIMPLE_JSON = "application/vnd.pypi.simple.v1+json";
const SPEC_URL = "https://packaging.python.org/specifications/project-status-markers/";

/** A project name as PyPI allows it: letters and digits, with `. _ -` between them. */
export const PYPI_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** PEP 503 normalization: the form PyPI uses in URLs. */
export const normalizeProject = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");
export const simpleUrl = (name: string) => `https://pypi.org/simple/${normalizeProject(name)}/`;

interface ProjectDetail {
  name?: string;
  meta?: { "api-version"?: string };
  "project-status"?: { status?: string; reason?: string };
}

// Each status, in the words of PEP 792, mapped to the lifecycle event it means for someone who depends on the project.
const STATUSES: Record<string, { event: DraftRule["event"]; severity: DraftRule["severity"]; meaning: string }> = {
  archived: { event: "end-of-life", severity: "medium", meaning: "the project does not expect to be updated in the future" },
  deprecated: { event: "deprecated", severity: "medium", meaning: "the project is considered obsolete and may have been superseded by another project" },
  quarantined: { event: "removed", severity: "critical", meaning: "the project is considered generally unsafe for use, and the index no longer offers its files" },
};

export const pypiStatusImporter: Importer = {
  id: "pypi-status",
  ecosystem: "python",
  description: "PyPI projects that are archived, deprecated, or quarantined, from PEP 792 project status markers",
  sources: [
    { title: "Project status markers", url: SPEC_URL },
    { title: "PyPI Simple API", url: "https://pypi.org/simple/" },
  ],

  async import(context) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    const active: string[] = [];
    const unreported: string[] = [];

    for (const name of [...new Set(PYPI_CANDIDATES)].sort()) {
      if (!PYPI_NAME.test(name)) {
        notes.push(`Skipped ${name}: not a valid PyPI project name.`);
        continue;
      }
      let detail: ProjectDetail;
      try {
        detail = await fetchJson<ProjectDetail>(context, simpleUrl(name), { accept: SIMPLE_JSON });
      } catch (error) {
        // A removed project is worth a note; any other failure must not look like "nothing is archived".
        if (/HTTP 404/.test((error as Error).message)) {
          notes.push(`Skipped ${name}: not found on PyPI.`);
          continue;
        }
        throw error;
      }

      const status = detail["project-status"]?.status;
      if (status === undefined) {
        unreported.push(name);
        continue;
      }
      const known = STATUSES[status];
      if (!known) {
        if (status === "active") active.push(name);
        else notes.push(`Skipped ${name}: unknown project status "${status}".`);
        continue;
      }

      const reason = detail["project-status"]?.reason?.replace(/\s+/g, " ").trim();
      const slug = normalizeProject(name);
      rules.push({
        id: `python.package.${slug}.${status}`,
        ecosystem: "python",
        purl: `pkg:pypi/${slug}`,
        vers: "vers:pypi/*",
        event: known.event,
        title: `${name} is ${status} on PyPI`,
        summary: `PyPI marks ${name} as ${status}: ${known.meaning}.${reason ? ` Reason given: "${reason.length > 200 ? `${reason.slice(0, 199).trimEnd()}…` : reason}"` : ""}`,
        severity: known.severity,
        sources: [
          { title: `${name} on PyPI`, url: `https://pypi.org/project/${slug}/` },
          { title: `${name} project status (PyPI Simple API)`, url: simpleUrl(name) },
          { title: "Project status markers (PEP 792)", url: SPEC_URL },
        ],
        "x-python": { kind: "package", package: name },
      });
    }

    if (active.length > 0) notes.push(`Active, so no rule (remove them from PYPI_CANDIDATES if they stay active): ${active.join(", ")}.`);
    if (unreported.length > 0) notes.push(`PyPI reported no project status for: ${unreported.join(", ")}.`);
    return { rules, notes };
  },
};
