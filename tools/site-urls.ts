// Inventories every published documentation URL so a theme move cannot drop a page.
//
//   node dist/tools/site-urls.js          # writes tests/fixtures/site-urls.json
//   node dist/tools/site-urls.js --check  # exits 1 if the fixture drifts or a URL has no file in docs/
//
// Sources: docs/sitemap.xml plus every page file under docs/ that GitHub Pages would serve.
// The inventory is a sorted JSON array of absolute URLs. No network.

import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SITE_URL = "https://arminazimi.github.io/evergreen";
export const FIXTURE_PATH = "tests/fixtures/site-urls.json";

/** Config and data blobs under docs/ that are not published as pages. */
const SKIP_FILES = new Set(["_config.yml", "coverage-descriptions.json", "differential-report.json"]);
/** Asset trees; the inventory tracks pages, not every static file. */
const SKIP_DIRECTORIES = new Set(["assets"]);

export function parseSitemapUrls(sitemap: string): string[] {
  return [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
}

/** Public URL for a path relative to docs/, or undefined when the file is not a page. */
export function urlForDocsPath(relativePath: string): string | undefined {
  const path = relativePath.replaceAll("\\", "/");
  if (path === "index.md" || path === "index.html") return `${SITE_URL}/`;
  if (path.endsWith("/index.md")) return `${SITE_URL}/${path.slice(0, -"index.md".length)}`;
  if (path.endsWith("/index.html")) return `${SITE_URL}/${path.slice(0, -"index.html".length)}`;
  if (path.endsWith(".md")) return `${SITE_URL}/${path.slice(0, -".md".length)}.html`;
  if (path.endsWith(".html")) return `${SITE_URL}/${path}`;
  if (path.endsWith(".txt") || path.endsWith(".xml")) return `${SITE_URL}/${path}`;
  return undefined;
}

/** Candidate docs/ paths that would publish as `url`. */
export function docsPathsForUrl(url: string): string[] {
  const prefix = `${SITE_URL}/`;
  if (url !== `${SITE_URL}/` && !url.startsWith(prefix)) return [];
  const path = url === `${SITE_URL}/` ? "" : url.slice(prefix.length);
  if (path === "" || path.endsWith("/")) return [`${path}index.md`, `${path}index.html`];
  if (path.endsWith(".html")) return [`${path.slice(0, -".html".length)}.md`, path];
  return [path];
}

async function listPageFiles(docsRoot: string, base = ""): Promise<string[]> {
  const entries = await readdir(join(docsRoot, base), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || SKIP_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await listPageFiles(docsRoot, relative)));
      continue;
    }
    if (entry.name.startsWith("_") || SKIP_FILES.has(entry.name)) continue;
    if (urlForDocsPath(relative) !== undefined) files.push(relative);
  }
  return files;
}

/** Union of sitemap locations and every page under docs/, sorted. */
export async function collectSiteUrls(root = "."): Promise<string[]> {
  const docsRoot = resolve(root, "docs");
  const urls = new Set<string>(parseSitemapUrls(await readFile(join(docsRoot, "sitemap.xml"), "utf8")));
  for (const file of await listPageFiles(docsRoot)) {
    const url = urlForDocsPath(file);
    if (url !== undefined) urls.add(url);
  }
  return [...urls].sort((left, right) => left.localeCompare(right));
}

export function renderFixture(urls: readonly string[]): string {
  return `${JSON.stringify(urls, null, 2)}\n`;
}

/** Inventory URLs that have no matching file under docs/. */
export async function missingFromSite(urls: readonly string[], root = "."): Promise<string[]> {
  const docsRoot = resolve(root, "docs");
  const missing: string[] = [];
  for (const url of urls) {
    let found = false;
    for (const candidate of docsPathsForUrl(url)) {
      try {
        await access(join(docsRoot, candidate));
        found = true;
        break;
      } catch {
        // try the next candidate
      }
    }
    if (!found) missing.push(url);
  }
  return missing;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const urls = await collectSiteUrls();
  const text = renderFixture(urls);
  const target = resolve(FIXTURE_PATH);
  if (argv.includes("--check")) {
    const current = await readFile(target, "utf8").catch(() => "");
    const missing = await missingFromSite(urls);
    if (current === text && missing.length === 0) return 0;
    if (current !== text) {
      console.error(`${FIXTURE_PATH} is out of date. Run: npm run build --silent && node dist/tools/site-urls.js`);
    }
    for (const url of missing) console.error(`missing from docs/: ${url}`);
    return 1;
  }
  await writeFile(target, text);
  console.log(`Wrote ${target} (${urls.length} URLs).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
