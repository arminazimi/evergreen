import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import type { DraftRule, Importer } from "./types.js";

export const RUBY_BRANCHES_URL = "https://www.ruby-lang.org/en/downloads/branches/";
const SOURCE = { title: "Ruby maintenance branches", url: RUBY_BRANCHES_URL };
const BRANCHES_DATA = /<script\b[^>]*\bid=["']branches\.json["'][^>]*>([\s\S]*?)<\/script>/i;
const RELEASE_NAME = /^\d+\.\d+(?:\.\d+)*$/;

interface BranchEntry {
  name?: unknown;
  status?: unknown;
  security_maintenance_date?: unknown;
  eol_date?: unknown;
}

interface Branch {
  name: string;
  status: string;
  security?: string;
  eol?: string;
}

interface ParsedEntry {
  branch?: Branch;
  note?: string;
}

function segments(name: string): number[] {
  return name.split(".").map(Number);
}

function compareNames(left: string, right: string): number {
  const a = segments(left);
  const b = segments(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

function lowerBound(name: string): string {
  return name.split(".").length === 2 ? `${name}.0` : name;
}

function parseBranches(body: string): unknown[] | undefined {
  const match = BRANCHES_DATA.exec(body);
  if (!match) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]!);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) ? parsed : undefined;
}

function draft(branch: Branch, eol: string, next: string, replacement: string | undefined): DraftRule {
  return {
    id: `ruby.runtime.eol-${branch.name}`,
    ecosystem: "ruby",
    purl: "pkg:generic/ruby",
    vers: `vers:gem/>=${lowerBound(branch.name)}|<${lowerBound(next)}`,
    event: "end-of-life",
    title: `Ruby ${branch.name} is end-of-life`,
    summary: branch.security
      ? `The Ruby maintenance branches page marks Ruby ${branch.name} as eol: normal maintenance ended on ${branch.security} and the branch reached end-of-life on ${eol}.`
      : `The Ruby maintenance branches page marks Ruby ${branch.name} as eol on ${eol}.`,
    severity: "high",
    ...(replacement !== undefined ? { replacement: `Ruby ${replacement} or later` } : {}),
    deadline: eol,
    sources: [SOURCE],
  };
}

export const rubyMaintenanceImporter: Importer = {
  id: "ruby-1",
  ecosystem: "ruby",
  description: "Ruby release lines that have reached end of life, from the official maintenance branches page",
  sources: [SOURCE],

  async import(context) {
    const body = await context.fetchText(RUBY_BRANCHES_URL, { accept: "text/html" });
    const raw = parseBranches(body);
    if (!raw) return { rules: [], notes: ["No usable Ruby maintenance branch data was found in the page."] };

    const parsed: ParsedEntry[] = raw.map((value, index) => {
      if (typeof value !== "object" || value === null) return { note: `Skipped entry ${index + 1}: not an object.` };
      const entry = value as BranchEntry;
      if (typeof entry.name !== "string" || !RELEASE_NAME.test(entry.name)) return { note: `Skipped entry ${index + 1}: no valid Ruby release name.` };
      if (typeof entry.status !== "string" || entry.status.trim() === "") return { note: `Skipped Ruby ${entry.name}: no valid status.` };
      const branch: Branch = {
        name: entry.name,
        status: entry.status.trim(),
        ...(isIsoDate(entry.security_maintenance_date) ? { security: entry.security_maintenance_date } : {}),
        ...(isIsoDate(entry.eol_date) ? { eol: entry.eol_date } : {}),
      };
      return { branch };
    });

    const branches = parsed.flatMap((entry) => (entry.branch ? [entry.branch] : []));
    const names = [...new Set(branches.map((branch) => branch.name))].sort(compareNames);
    const normal = branches
      .filter((branch) => branch.status === "normal maintenance")
      .map((branch) => branch.name)
      .sort(compareNames)[0];
    const today = isoDate(context.now);
    const notes: string[] = [];
    const rules: DraftRule[] = [];

    for (const entry of parsed) {
      if (entry.note !== undefined) {
        notes.push(entry.note);
        continue;
      }
      const branch = entry.branch;
      if (!branch) continue;
      if (branch.status !== "eol") {
        if (branch.status === "security maintenance" && branch.eol !== undefined && branch.eol > today) {
          notes.push(`Not yet end-of-life: Ruby ${branch.name} (EOL ${branch.eol}).`);
        } else {
          notes.push(`Skipped Ruby ${branch.name}: status "${branch.status}".`);
        }
        continue;
      }
      if (branch.eol === undefined) {
        notes.push(`Skipped Ruby ${branch.name}: no valid end-of-life date.`);
        continue;
      }
      if (branch.eol > today) {
        notes.push(`Not yet end-of-life: Ruby ${branch.name} (EOL ${branch.eol}).`);
        continue;
      }
      const next = names.find((name) => compareNames(name, branch.name) > 0);
      if (!next) {
        notes.push(`Skipped Ruby ${branch.name}: no later release line to bound its versions.`);
        continue;
      }
      rules.push(draft(branch, branch.eol, next, normal));
    }

    if (normal === undefined) notes.push("No release line in normal maintenance was found, so drafts have no replacement.");
    return { rules, notes };
  },
};
