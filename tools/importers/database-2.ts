import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const ENDOFLIFE_API = "https://endoflife.date/api/v1/products";

/**
 * Products drafted by this importer. `firstMajor` keeps weekly drafts to the lines the detector can
 * meet in a modern Compose or Terraform file; raise or lower it when the registry's range changes.
 */
export const PRODUCTS = [
  { name: "mongodb", slug: "mongodb", label: "MongoDB Server", firstMajor: 4 },
  { name: "redis", slug: "redis", label: "Redis", firstMajor: 5 },
] as const;

interface Release {
  name?: string;
  eolFrom?: string | null;
}

interface Product {
  result?: {
    links?: { html?: string; releasePolicy?: string | null };
    releases?: Release[];
  };
}

const RELEASE_NAME = /^(\d+)\.(\d+)$/;

/** The vendor's own page. endoflife.date itself and web archive snapshots are not the vendor. */
function vendorLink(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return undefined;
    const host = url.hostname.toLowerCase();
    if (host === "endoflife.date" || host.endsWith(".endoflife.date") || host === "web.archive.org" || host === "archive.org") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Drafts one `end-of-life` rule for each Redis and MongoDB release line (`major.minor`) whose end
 * date has passed. endoflife.date is the index; a product is drafted only when it links the vendor's
 * own release policy, which becomes the first source. A line with no end date, or an end date in the
 * future, is never drafted.
 */
export const databaseVendorLifecycleImporter: Importer = {
  id: "database-2",
  ecosystem: "database",
  description: "Redis and MongoDB release lines that have reached end of life, indexed by endoflife.date and evidenced by the vendor's own policy",
  sources: [{ title: "endoflife.date API v1 (index only)", url: ENDOFLIFE_API }],

  async import(context) {
    const today = isoDate(context.now);
    const rules: DraftRule[] = [];
    const notes: string[] = [];

    for (const product of PRODUCTS) {
      const payload = (await fetchJson<Product>(context, `${ENDOFLIFE_API}/${product.slug}/`)).result;
      if (!payload?.releases) {
        notes.push(`Skipped ${product.name}: the response has no releases.`);
        continue;
      }
      const vendor = vendorLink(payload.links?.releasePolicy);
      if (!vendor) {
        notes.push(`Skipped ${product.name}: no release-policy link to the vendor's own page, and endoflife.date alone is not evidence.`);
        continue;
      }

      const lines = payload.releases
        .map((release) => {
          const match = RELEASE_NAME.exec(release.name ?? "");
          return match ? { name: release.name!, major: Number(match[1]), minor: Number(match[2]), end: release.eolFrom } : undefined;
        })
        .filter((line): line is NonNullable<typeof line> => line !== undefined && line.major >= product.firstMajor)
        .sort((left, right) => left.major - right.major || left.minor - right.minor);

      for (const line of lines) {
        if (!isIsoDate(line.end)) {
          notes.push(`Skipped ${product.name} ${line.name}: no end date.`);
          continue;
        }
        if (line.end > today) {
          notes.push(`Skipped ${product.name} ${line.name}: its end of life (${line.end}) is in the future.`);
          continue;
        }
        rules.push({
          id: `database.${product.name}.end-of-life-${line.name}`,
          ecosystem: "database",
          purl: `pkg:generic/${product.name}`,
          vers: `vers:semver/>=${line.major}.${line.minor}.0|<${line.major}.${line.minor + 1}.0`,
          event: "end-of-life",
          title: `${product.label} ${line.name} is end-of-life`,
          summary: `${product.label} ${line.name} reached end of life on ${line.end} and no longer receives fixes from the vendor.`,
          severity: "high",
          deadline: line.end,
          sources: [
            { title: `${product.label} support policy (vendor)`, url: vendor },
            ...(payload.links?.html ? [{ title: "endoflife.date (index; the vendor page above is the evidence)", url: payload.links.html }] : []),
          ],
        });
      }
    }

    notes.push(`Drafted ${rules.length} rule(s) for ${PRODUCTS.length} product(s); only the vendor policy link counts as evidence.`);
    return { rules, notes };
  },
};
