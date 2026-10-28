// Builds docs/llms-full.txt: the full text of every page that docs/llms.txt links to, in the order it lists them.
//
//   npm run build --silent
//   node dist/tools/build-llms-full.js            # writes docs/llms-full.txt
//   node dist/tools/build-llms-full.js --check    # exits 1 if the committed file is out of date
//
// docs/llms.txt is the curated index and the only thing edited by hand; the full file is generated from it, so the
// two cannot disagree about which pages exist. Output is deterministic.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SITE = "https://arminazimi.github.io/evergreen/";

export interface IndexedPage {
  title: string;
  /** The page's file under docs/, such as `MCP.md`. */
  file: string;
  url: string;
}

/** The pages an llms.txt index links to on this site, in order, as the Markdown sources that produce them. */
export function indexedPages(index: string): IndexedPage[] {
  const pages: IndexedPage[] = [];
  for (const match of index.matchAll(/^- \[([^\]]+)\]\((https:\/\/[^)\s]+)\)/gm)) {
    const url = match[2]!;
    if (!url.startsWith(SITE) || !url.endsWith(".html")) continue;
    pages.push({ title: match[1]!, file: `${url.slice(SITE.length, -".html".length)}.md`, url });
  }
  return pages;
}

/** A Markdown page without its Jekyll front matter. */
export function stripFrontMatter(text: string): string {
  return text.startsWith("---\n") ? text.slice(text.indexOf("\n---\n", 4) + 5).replace(/^\n+/, "") : text;
}

/** Drops the `{% raw %}` guards that keep Jekyll from reading `{{ }}` in examples as Liquid. */
export function stripLiquidRaw(text: string): string {
  return text.replace(/^\{% (?:end)?raw %\}\r?\n/gm, "");
}

export function buildLlmsFull(index: string, pages: ReadonlyMap<string, string>): string {
  const parts = [
    "# Evergreen: full documentation",
    "",
    "> The complete text of the Evergreen documentation pages listed in llms.txt, in that order. Each section starts with the page's public address.",
    "",
  ];
  for (const page of indexedPages(index)) {
    const body = pages.get(page.file);
    if (body === undefined) throw new Error(`docs/llms.txt links to ${page.url}, but docs/${page.file} does not exist.`);
    parts.push("---", "", `Source: ${page.url}`, "", stripLiquidRaw(stripFrontMatter(body)).replaceAll("\r\n", "\n").trim(), "");
  }
  return `${parts.join("\n").trimEnd()}\n`;
}

export async function renderLlmsFull(root = "."): Promise<string> {
  const index = await readFile(resolve(root, "docs/llms.txt"), "utf8");
  const pages = new Map<string, string>();
  for (const page of indexedPages(index)) {
    pages.set(page.file, await readFile(resolve(root, "docs", page.file), "utf8").catch(() => undefined as never));
  }
  for (const [file, body] of pages) if (body === undefined) pages.delete(file);
  return buildLlmsFull(index, pages);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = resolve("docs/llms-full.txt");
  renderLlmsFull().then(
    async (text) => {
      if (process.argv.includes("--check")) {
        const current = await readFile(target, "utf8").catch(() => "");
        if (current !== text) {
          process.stderr.write("docs/llms-full.txt is out of date. Run: npm run build:llms\n");
          process.exit(1);
        }
        return;
      }
      await writeFile(target, text);
      process.stdout.write(`Wrote ${target} (${text.length} characters)\n`);
    },
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}
