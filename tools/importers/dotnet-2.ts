import { isIsoDate } from "../../src/registry.js";
import { NUGET_CANDIDATES } from "./dotnet-candidates.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer, ImporterContext } from "./types.js";

export const NUGET_REGISTRATION_BASE = "https://api.nuget.org/v3/registration5-gz-semver2";

interface Deprecation {
  reasons?: unknown;
  message?: unknown;
  alternatePackage?: { id?: unknown };
}

interface Leaf {
  version: string;
  listed: boolean;
  deprecation: Deprecation | undefined;
}

/** The registration URL of a package id. NuGet lowercases ids in its URLs. */
export function registrationUrl(id: string): string {
  return `${NUGET_REGISTRATION_BASE}/${id.toLowerCase()}/index.json`;
}

type Raw = { items?: unknown; "@id"?: unknown; catalogEntry?: { version?: unknown; listed?: unknown; deprecation?: unknown } };

async function leaves(context: ImporterContext, id: string): Promise<Leaf[]> {
  const index = await fetchJson<{ items?: Raw[] }>(context, registrationUrl(id));
  const found: Leaf[] = [];
  for (const page of index.items ?? []) {
    // Small packages inline their pages; large ones link to them.
    const items = Array.isArray(page.items) ? (page.items as Raw[]) : typeof page["@id"] === "string" ? ((await fetchJson<{ items?: Raw[] }>(context, page["@id"])).items ?? []) : [];
    for (const item of items) {
      const entry = item.catalogEntry;
      if (!entry || typeof entry.version !== "string") continue;
      const deprecation = typeof entry.deprecation === "object" && entry.deprecation !== null ? (entry.deprecation as Deprecation) : undefined;
      found.push({ version: entry.version, listed: entry.listed !== false, deprecation });
    }
  }
  return found;
}

/** "obsolete as of 3/31/2023" (the Azure SDK wording) as an ISO date, when the message has it. */
export function obsoleteDate(message: string): string | undefined {
  const match = /\bobsolete as of (\d{1,2})\/(\d{1,2})\/(\d{4})\b/i.exec(message);
  if (!match) return undefined;
  const date = `${match[3]}-${match[1]!.padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
  return isIsoDate(date) ? date : undefined;
}

export const nugetDeprecationImporter: Importer = {
  id: "dotnet-2",
  ecosystem: "dotnet",
  description: "NuGet packages whose publisher has deprecated every version as legacy, from the NuGet registration API",
  sources: [{ title: "NuGet registration API", url: "https://learn.microsoft.com/nuget/api/registration-base-url-resource" }],

  async import(context) {
    const rules: DraftRule[] = [];
    const notes: string[] = [];
    for (const id of [...new Set(NUGET_CANDIDATES)].sort()) {
      const all = (await leaves(context, id)).filter((leaf) => leaf.listed);
      if (all.length === 0) {
        notes.push(`Skipped ${id}: NuGet lists no versions for it.`);
        continue;
      }
      const deprecated = all.filter((leaf) => leaf.deprecation !== undefined);
      if (deprecated.length === 0) {
        notes.push(`${id}: none of its ${all.length} versions is deprecated, so there is nothing to draft.`);
        continue;
      }
      if (deprecated.length < all.length) {
        notes.push(`${id}: only ${deprecated.length} of ${all.length} versions are deprecated, which describes those versions, not the package, so no rule was drafted.`);
        continue;
      }
      const newest = all[all.length - 1]!.deprecation!;
      const reasons = Array.isArray(newest.reasons) ? newest.reasons.filter((reason): reason is string => typeof reason === "string") : [];
      if (!reasons.includes("Legacy")) {
        notes.push(`${id}: deprecated for ${reasons.join(", ") || "no stated reason"}, not as legacy, so no rule was drafted.`);
        continue;
      }
      const message = typeof newest.message === "string" ? newest.message.replace(/\s+/g, " ").trim() : "";
      const alternate = typeof newest.alternatePackage?.id === "string" ? newest.alternatePackage.id : undefined;
      const deadline = obsoleteDate(message);
      rules.push({
        id: `dotnet.package.${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.deprecated`,
        ecosystem: "dotnet",
        purl: `pkg:nuget/${id}`,
        vers: "vers:nuget/*",
        event: "deprecated",
        title: `${id} is deprecated on NuGet`,
        summary: `NuGet marks all ${all.length} listed versions of ${id} as deprecated (reason: Legacy).${message ? ` The publisher's message: "${message}"` : ""}`,
        severity: "medium",
        replacement: alternate ?? `A maintained alternative to ${id}`,
        ...(deadline ? { deadline } : {}),
        sources: [
          { title: `${id} on NuGet (deprecation metadata)`, url: `https://www.nuget.org/packages/${id}` },
          { title: "NuGet package deprecation", url: "https://learn.microsoft.com/nuget/nuget-org/deprecate-packages" },
        ],
      });
    }
    return { rules, notes };
  },
};
