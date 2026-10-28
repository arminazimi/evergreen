import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import {
  FIXTURE_PATH,
  SITE_URL,
  collectSiteUrls,
  docsPathsForUrl,
  missingFromSite,
  parseSitemapUrls,
  renderFixture,
  urlForDocsPath,
} from "../tools/site-urls.js";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

test("docs paths map to the public URLs GitHub Pages serves", () => {
  assert.equal(urlForDocsPath("index.md"), `${SITE_URL}/`);
  assert.equal(urlForDocsPath("MCP.md"), `${SITE_URL}/MCP.html`);
  assert.equal(urlForDocsPath("rules/index.md"), `${SITE_URL}/rules/`);
  assert.equal(urlForDocsPath("rules/npm.package.request.deprecated.md"), `${SITE_URL}/rules/npm.package.request.deprecated.html`);
  assert.equal(urlForDocsPath("dashboard/index.html"), `${SITE_URL}/dashboard/`);
  assert.equal(urlForDocsPath("llms.txt"), `${SITE_URL}/llms.txt`);
  assert.equal(urlForDocsPath("sitemap.xml"), `${SITE_URL}/sitemap.xml`);
  assert.equal(urlForDocsPath("dashboard/style.css"), undefined);
});

test("a public URL resolves back to the docs file that publishes it", () => {
  assert.deepEqual(docsPathsForUrl(`${SITE_URL}/`), ["index.md", "index.html"]);
  assert.deepEqual(docsPathsForUrl(`${SITE_URL}/rules/`), ["rules/index.md", "rules/index.html"]);
  assert.deepEqual(docsPathsForUrl(`${SITE_URL}/MCP.html`), ["MCP.md", "MCP.html"]);
  assert.deepEqual(docsPathsForUrl(`${SITE_URL}/llms.txt`), ["llms.txt"]);
  assert.deepEqual(docsPathsForUrl("https://example.com/elsewhere"), []);
});

test("the committed inventory matches the sitemap and every docs page, and every URL exists", async () => {
  const urls = await collectSiteUrls();
  const fixture = await readFile(resolve(FIXTURE_PATH), "utf8");
  assert.equal(fixture, renderFixture(urls), `run: npm run build --silent && node dist/tools/site-urls.js`);

  const sitemap = parseSitemapUrls(await readFile(resolve("docs/sitemap.xml"), "utf8"));
  assert.ok(sitemap.length >= 100);
  for (const url of sitemap) assert.ok(urls.includes(url), `inventory misses sitemap URL ${url}`);

  const rulePages = urls.filter((url) => url.startsWith(`${SITE_URL}/rules/`) && url.endsWith(".html"));
  assert.ok(rulePages.length >= 100);
  assert.ok(urls.includes(`${SITE_URL}/rules/`));
  for (const url of rulePages) {
    assert.ok(sitemap.includes(url), `rule page ${url} is not in the sitemap`);
  }

  assert.deepEqual(await missingFromSite(urls), []);
  assert.ok(urls.includes(`${SITE_URL}/`));
  assert.ok(urls.includes(`${SITE_URL}/llms.txt`));
  assert.ok(urls.includes(`${SITE_URL}/MCP.html`));
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(urls, [...urls].sort((left, right) => left.localeCompare(right)));
});

test("the machine files stay static and served at their old root URLs", async () => {
  const urls = await collectSiteUrls();
  const machineFiles = ["llms.txt", "llms-full.txt", "sitemap.xml"];
  for (const file of machineFiles) {
    assert.ok(urls.includes(`${SITE_URL}/${file}`), `${file} is missing from the URL inventory`);
    assert.deepEqual(docsPathsForUrl(`${SITE_URL}/${file}`), [file]);
    const text = await readFile(resolve("docs", file), "utf8");
    assert.doesNotMatch(
      text,
      /^---\r?\n/,
      `docs/${file} must stay a static file: front matter would make Jekyll render it through a layout instead of serving it as is`,
    );
  }

  const claimed = new Set(machineFiles.map((file) => `/${file}`));
  for (const entry of await readdir(resolve("docs"), { recursive: true })) {
    if (!entry.endsWith(".md") && !entry.endsWith(".html")) continue;
    const frontMatter = (await readFile(resolve("docs", entry), "utf8")).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const permalink = frontMatter.match(/^permalink:\s*["']?([^"'\s]+)/m)?.[1];
    assert.ok(
      permalink === undefined || !claimed.has(permalink),
      `docs/${entry} publishes ${permalink}, which the machine files own; add the page to llms.txt and sitemap generation instead`,
    );
  }
});

test("--check fails when a listed URL has no file and when the fixture drifts", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-site-urls-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "docs", "rules"), { recursive: true });
  await writeFile(join(root, "docs", "index.md"), "# Home\n");
  await writeFile(join(root, "docs", "rules", "index.md"), "# Rules\n");
  await writeFile(
    join(root, "docs", "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE_URL}/</loc></url>\n  <url><loc>${SITE_URL}/rules/</loc></url>\n  <url><loc>${SITE_URL}/rules/demo.thing.eol-1.html</loc></url>\n</urlset>\n`,
  );

  const urls = await collectSiteUrls(root);
  assert.ok(urls.includes(`${SITE_URL}/rules/demo.thing.eol-1.html`));
  assert.deepEqual(await missingFromSite(urls, root), [`${SITE_URL}/rules/demo.thing.eol-1.html`]);

  await writeFile(join(root, "docs", "rules", "demo.thing.eol-1.md"), "# Demo\n");
  assert.deepEqual(await missingFromSite(urls, root), []);

  await execute(process.execPath, [resolve("dist/tools/site-urls.js"), "--check"]);
});
