// Guards every published documentation URL so a theme move or a deleted page cannot break a link.
//
//   node dist/tools/site-urls.js                   # prints the current URL inventory to stdout
//   node dist/tools/site-urls.js --out <file>      # writes the current URL inventory to <file>
//   node dist/tools/site-urls.js --check           # exits 1 when a URL has no file in docs/ or a baseline URL vanished without a redirect
//   node dist/tools/site-urls.js --update-baseline # rewrites the published-site baseline (release step)
//
// The baseline is a snapshot of the last published site, committed as tests/fixtures/site-urls.baseline.json.
// The current inventory is generated on demand, so a new page never edits a shared fixture: only a page
// that disappears needs a redirect (or a deliberate baseline refresh at release time).
//
// Sources: docs/sitemap.xml plus every page file under docs/ that GitHub Pages would serve. No network.

import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SITE_URL = "https://arminazimi.github.io/evergreen";
/** Snapshot of the URLs the published site serves, captured from the last release. */
export const BASELINE_PATH = "tests/fixtures/site-urls.baseline.json";

/** Config and data blobs under docs/ that are not published as pages. */
const SKIP_FILES = new Set(["_config.yml", "coverage-descriptions.json", "differential-report.json"]);
/** Asset trees and local Jekyll build output, walked by neither scan. */
const SKIP_DIRECTORIES = new Set(["assets", "vendor", "_site"]);
/** Redirect stubs publish only a URL that used to exist, never a new page. */
const REDIRECT_DIRECTORY = "redirects";

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
      if (entry.name === REDIRECT_DIRECTORY) continue;
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

export function renderInventory(urls: readonly string[]): string {
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

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** Every markdown and HTML file under docs/, including redirect stubs and Jekyll internals that may hold front matter. */
async function listFrontMatterFiles(docsRoot: string, base = ""): Promise<string[]> {
  const entries = await readdir(join(docsRoot, base), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_") || SKIP_DIRECTORIES.has(entry.name)) continue;
      files.push(...(await listFrontMatterFiles(docsRoot, relative)));
      continue;
    }
    if (entry.name.endsWith(".md") || entry.name.endsWith(".html")) files.push(relative);
  }
  return files;
}

/** Values of one front-matter key, written either inline or as a block list. */
function frontMatterValues(frontMatter: string, key: string): string[] {
  const lines = frontMatter.split(/\r?\n/);
  const values: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) continue;
    const inline = match[1]!.trim().replace(/^["']|["']$/g, "");
    if (inline !== "") {
      values.push(inline);
      continue;
    }
    for (let item = index + 1; item < lines.length; item += 1) {
      const entry = lines[item]!.match(/^\s+-\s*(.+)$/);
      if (!entry) break;
      values.push(entry[1]!.trim().replace(/^["']|["']$/g, ""));
    }
  }
  return values;
}

/** Absolute URL for a permalink or redirect_from value, which may be site-relative or absolute. */
function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Every URL that docs/ keeps serving as a redirect: `redirect_from` entries on any page, plus the
 * `permalink` of redirect stubs (a page with `redirect_to`). Retired URLs stay reachable this way.
 */
export async function redirectedUrls(root = "."): Promise<string[]> {
  const docsRoot = resolve(root, "docs");
  const urls = new Set<string>();
  for (const file of await listFrontMatterFiles(docsRoot)) {
    const text = await readFile(join(docsRoot, file), "utf8");
    const frontMatter = text.match(FRONT_MATTER)?.[1];
    if (frontMatter === undefined) continue;
    for (const from of frontMatterValues(frontMatter, "redirect_from")) urls.add(absoluteUrl(from));
    if (frontMatterValues(frontMatter, "redirect_to").length === 0) continue;
    for (const permalink of frontMatterValues(frontMatter, "permalink")) urls.add(absoluteUrl(permalink));
  }
  return [...urls].sort((left, right) => left.localeCompare(right));
}

/** Baseline URLs the current inventory no longer publishes and no redirect covers. */
export async function lostUrls(baseline: readonly string[], current: readonly string[], root = "."): Promise<string[]> {
  const redirected = new Set(await redirectedUrls(root));
  const published = new Set(current);
  return baseline.filter((url) => !published.has(url) && !redirected.has(url));
}

/** The published-site baseline committed at tests/fixtures/site-urls.baseline.json. */
export async function readBaseline(root = "."): Promise<string[]> {
  const path = resolve(root, BASELINE_PATH);
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.some((url) => typeof url !== "string")) {
    throw new Error(`${BASELINE_PATH} must be a JSON array of URLs`);
  }
  return parsed;
}

export const USAGE = "usage: node dist/tools/site-urls.js [--out <file> | --check | --update-baseline]";

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const urls = await collectSiteUrls();
  const text = renderInventory(urls);

  if (argv.includes("--check")) {
    const baseline = await readBaseline();
    const missing = await missingFromSite(urls);
    const lost = await lostUrls(baseline, urls);
    if (missing.length === 0 && lost.length === 0) {
      console.log(`${urls.length} published URLs; all ${baseline.length} baseline URLs are still served.`);
      return 0;
    }
    for (const url of missing) console.error(`missing from docs/: ${url}`);
    for (const url of lost) {
      console.error(`URL disappeared without a redirect: ${url}`);
      console.error(
        `  Restore the page, add a redirect (redirect_from or a stub in docs/${REDIRECT_DIRECTORY}/), or refresh ${BASELINE_PATH} at release time with --update-baseline.`,
      );
    }
    return 1;
  }

  if (argv.includes("--update-baseline")) {
    const lost = await lostUrls(await readBaseline(), urls);
    if (lost.length > 0) {
      for (const url of lost) console.error(`refusing to drop ${url} without a redirect`);
      return 1;
    }
    const target = resolve(BASELINE_PATH);
    await writeFile(target, text);
    console.log(`Wrote ${target} (${urls.length} URLs).`);
    return 0;
  }

  const outIndex = argv.indexOf("--out");
  if (outIndex !== -1) {
    const value = argv[outIndex + 1];
    if (value === undefined) {
      console.error(USAGE);
      return 2;
    }
    const target = resolve(value);
    await writeFile(target, text);
    console.log(`Wrote ${target} (${urls.length} URLs).`);
    return 0;
  }

  if (argv.length > 0) {
    console.error(USAGE);
    return 2;
  }
  process.stdout.write(text);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
