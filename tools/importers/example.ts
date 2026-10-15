import { fetchJson } from "./types.js";
import type { DraftRule, Importer } from "./types.js";

// A small, complete importer to copy from. It reads a made-up feed, so it is not registered in
// index.ts. Real importers read an authoritative source and live next to this file.

interface FeedProduct {
  name: string;
  status: string;
  versionsBefore?: string;
  title: string;
  summary: string;
  replacement?: string;
  date?: string;
  url: string;
}

export const EXAMPLE_FEED_URL = "https://example.com/lifecycle-feed.json";

const EVENTS: Record<string, DraftRule["event"]> = { deprecated: "deprecated", eol: "end-of-life" };

export const exampleImporter: Importer = {
  id: "example-feed",
  ecosystem: "npm",
  description: "Example importer for a made-up npm lifecycle feed",
  sources: [{ title: "Example lifecycle feed", url: EXAMPLE_FEED_URL }],

  async import(context) {
    const feed = await fetchJson<{ products: FeedProduct[] }>(context, EXAMPLE_FEED_URL);
    const rules: DraftRule[] = [];
    const notes: string[] = [];

    for (const product of [...feed.products].sort((left, right) => left.name.localeCompare(right.name))) {
      const event = EVENTS[product.status];
      if (!event) {
        notes.push(`Skipped ${product.name}: unknown status "${product.status}".`);
        continue;
      }
      rules.push({
        id: `npm.package.${product.name}.${event === "end-of-life" ? "eol" : "deprecated"}`,
        ecosystem: "npm",
        purl: `pkg:npm/${product.name}`,
        vers: product.versionsBefore ? `vers:npm/<${product.versionsBefore}` : "vers:npm/*",
        event,
        title: product.title,
        summary: product.summary,
        severity: "medium",
        ...(product.replacement ? { replacement: product.replacement } : {}),
        ...(product.date ? { deadline: product.date } : {}),
        sources: [{ title: `${product.name} lifecycle notice`, url: product.url }],
        "x-npm": { package: product.name },
      });
    }
    return { rules, notes };
  },
};
