import { isIsoDate } from "../../src/registry.js";
import { isoDate } from "./canonical.js";
import { ENDOFLIFE_CANDIDATES } from "./endoflife-candidates.js";
import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

export const ENDOFLIFE_API = "https://endoflife.date/api/v1/products";

interface Release {
  name?: string;
  eolFrom?: string | null;
}

interface Product {
  result?: {
    name?: string;
    label?: string;
    identifiers?: Array<{ type?: string; id?: string }>;
    links?: { html?: string; releasePolicy?: string | null };
    releases?: Release[];
  };
}

const DOCKER_PURL = /^pkg:docker\/library\/([a-z0-9]+(?:[._-][a-z0-9]+)*)$/;
const RELEASE_NAME = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

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

const compare = (left: number[], right: number[]) => left[0]! - right[0]! || left[1]! - right[1]! || left[2]! - right[2]!;

export const endoflifeDateImporter: Importer = {
  id: "endoflife-date",
  ecosystem: "container",
  description: "End-of-life release lines of official Docker images, indexed by endoflife.date and evidenced by the vendor's own page",
  sources: [{ title: "endoflife.date API v1 (index only)", url: ENDOFLIFE_API }],

  async import(context) {
    const today = isoDate(context.now);
    const notes: string[] = [];
    const rules: DraftRule[] = [];

    for (const name of ENDOFLIFE_CANDIDATES) {
      const product = (await fetchJson<Product>(context, `${ENDOFLIFE_API}/${name}/`)).result;
      if (!product?.releases) {
        notes.push(`Skipped ${name}: the response has no releases.`);
        continue;
      }
      const image = product.identifiers?.map((item) => (item.type === "purl" && item.id ? DOCKER_PURL.exec(item.id) : null)).find(Boolean);
      if (!image) {
        notes.push(`Skipped ${name}: no official Docker image is listed for it.`);
        continue;
      }
      const vendor = vendorLink(product.links?.releasePolicy);
      if (!vendor) {
        notes.push(`Skipped ${name}: no release-policy link to the vendor's own page, and endoflife.date alone is not evidence.`);
        continue;
      }

      const releases = product.releases
        .map((release) => {
          const match = RELEASE_NAME.exec(release.name ?? "");
          return match
            ? { name: release.name!, version: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)], end: isIsoDate(release.eolFrom) ? release.eolFrom : undefined, eol: release.eolFrom }
            : undefined;
        })
        .filter((release): release is NonNullable<typeof release> => release !== undefined)
        .sort((left, right) => compare(left.version, right.version));
      if (releases.length === 0) {
        notes.push(`Skipped ${name}: no release line has a numeric name.`);
        continue;
      }

      // "and older" is only true below the oldest release that is still supported.
      const live = releases.find((release) => !(release.end !== undefined && release.end <= today));
      if (!live) {
        notes.push(`Skipped ${name}: every release line has ended, so there is no supported line to cut at.`);
        continue;
      }
      const ended = releases.filter((release) => compare(release.version, live.version) < 0);
      const newest = ended[ended.length - 1];
      if (!newest) {
        notes.push(`Skipped ${name}: no release line below ${live.name} has ended.`);
        continue;
      }
      const deadline = ended.map((release) => release.end).filter((date): date is string => date !== undefined).sort().at(-1);
      if (!deadline) {
        notes.push(`Skipped ${name}: the ended release lines have no end date.`);
        continue;
      }

      const repository = image[1]!;
      rules.push({
        id: `container.${repository}.eol-${newest.name}-and-older`,
        ecosystem: "container",
        purl: `pkg:docker/library/${repository}`,
        vers: `vers:semver/<${live.version.join(".")}`,
        event: "end-of-life",
        title: `${product.label ?? name} image release lines ${newest.name} and older are end-of-life`,
        summary: `These ${product.label ?? name} release lines no longer receive fixes from the vendor.`,
        severity: "high",
        replacement: `A ${repository} image on a supported release line`,
        deadline,
        sources: [
          { title: `${product.label ?? name} release policy (vendor)`, url: vendor },
          ...(product.links?.html ? [{ title: "endoflife.date (index; the vendor page above is the evidence)", url: product.links.html }] : []),
        ],
      });
    }

    notes.push(`Drafted ${rules.length} of ${ENDOFLIFE_CANDIDATES.length} candidate products; only the vendor release-policy link counts as evidence.`);
    return { rules, notes };
  },
};
