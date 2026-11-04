import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { loadRegistries, renderSitemap } from "../tools/build-reference-pages.js";
import { renderLlmsFull } from "../tools/build-llms-full.js";
import {
  BASELINE_PATH,
  BUILD_TIME_DOCS_FILES,
  BUILD_TIME_MACHINE_FILES,
  SITE_URL,
  collectSiteUrls,
  docsPathsForUrl,
  lostUrls,
  missingFromSite,
  parseSitemapUrls,
  readBaseline,
  readSitemapText,
  redirectedUrls,
  renderInventory,
  urlForDocsPath,
} from "../tools/site-urls.js";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const TOOL = resolve("dist/tools/site-urls.js");

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-site-urls-"));
  temporaryRoots.push(root);
  return root;
}

/** Run the built tool in `cwd` and report the exit code instead of throwing. */
async function runTool(
  cwd: string,
  args: readonly string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [TOOL, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

/** Write the committed baseline into a temporary repository root and return its text. */
async function writeBaseline(root: string, urls: readonly string[]): Promise<string> {
  const text = renderInventory(urls);
  const target = join(root, BASELINE_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
  return text;
}

/** A sitemap holding exactly `urls`, the way GitHub Pages publishes it. */
function sitemap(urls: readonly string[]): string {
  const locations = urls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locations}\n</urlset>\n`;
}

test("docs paths map to the public URLs GitHub Pages serves", () => {
  assert.equal(urlForDocsPath("index.md"), `${SITE_URL}/`);
  assert.equal(urlForDocsPath("MCP.md"), `${SITE_URL}/MCP.html`);
  assert.equal(urlForDocsPath("rules/index.md"), `${SITE_URL}/rules/`);
  assert.equal(
    urlForDocsPath("rules/npm.package.request.deprecated.md"),
    `${SITE_URL}/rules/npm.package.request.deprecated.html`,
  );
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

test("the inventory covers the sitemap and every docs page, and every URL exists", async () => {
  const urls = await collectSiteUrls();

  const sitemapUrls = parseSitemapUrls(await readSitemapText());
  assert.ok(sitemapUrls.length >= 100);
  for (const url of sitemapUrls) assert.ok(urls.includes(url), `inventory misses sitemap URL ${url}`);

  const rulePages = urls.filter((url) => url.startsWith(`${SITE_URL}/rules/`) && url.endsWith(".html"));
  assert.ok(rulePages.length >= 100);
  assert.ok(urls.includes(`${SITE_URL}/rules/`));
  for (const url of rulePages) {
    assert.ok(sitemapUrls.includes(url), `rule page ${url} is not in the sitemap`);
  }

  assert.deepEqual(await missingFromSite(urls), []);
  assert.ok(urls.includes(`${SITE_URL}/`));
  assert.ok(urls.includes(`${SITE_URL}/llms.txt`));
  assert.ok(urls.includes(`${SITE_URL}/MCP.html`));
  assert.ok(urls.includes(`${SITE_URL}/sitemap.xml`));
  assert.equal(new Set(urls).size, urls.length);
  assert.deepEqual(
    urls,
    [...urls].sort((left, right) => left.localeCompare(right)),
  );
});

test("the current inventory is generated into a temporary file, never a committed fixture", async () => {
  const root = await temporaryRoot();
  const baselineBefore = await readFile(resolve(BASELINE_PATH), "utf8");
  const output = join(root, "inventory.json");

  const generated = await runTool(resolve("."), ["--out", output]);
  assert.equal(generated.code, 0, generated.stderr);

  const urls = await collectSiteUrls();
  assert.ok(urls.length >= 900);
  assert.equal(await readFile(output, "utf8"), renderInventory(urls));
  assert.equal(
    await readFile(resolve(BASELINE_PATH), "utf8"),
    baselineBefore,
    "generating must not touch the baseline",
  );
  assert.equal(existsSync(resolve("tests/fixtures/site-urls.json")), false, "the inventory is not a committed fixture");
});

test("the committed baseline is a published-site snapshot that is still served", async () => {
  const baseline = await readBaseline();
  const urls = await collectSiteUrls();

  assert.ok(baseline.length >= 900);
  assert.equal(new Set(baseline).size, baseline.length);
  assert.deepEqual(
    baseline,
    [...baseline].sort((left, right) => left.localeCompare(right)),
  );
  assert.ok(baseline.includes(`${SITE_URL}/`));
  // New pages are allowed; a baseline URL may only leave when it still redirects.
  assert.deepEqual(await lostUrls(baseline, urls), []);

  const check = await runTool(resolve("."), ["--check"]);
  assert.equal(check.code, 0, check.stderr);
});

test("adding a docs page needs no baseline edit", async () => {
  const root = await temporaryRoot();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "index.md"), "# Home\n");
  await writeFile(join(root, "docs", "sitemap.xml"), sitemap([`${SITE_URL}/`]));

  const baseline = await writeBaseline(root, await collectSiteUrls(root));

  assert.equal((await runTool(root, ["--check"])).code, 0);

  await writeFile(join(root, "docs", "new-page.md"), "# New\n");
  const current = await collectSiteUrls(root);
  assert.ok(current.includes(`${SITE_URL}/new-page.html`));

  const check = await runTool(root, ["--check"]);
  assert.equal(check.code, 0, check.stderr);
  assert.equal(await readFile(join(root, BASELINE_PATH), "utf8"), baseline, "a new page must not edit the baseline");

  const generated = await runTool(root, ["--out", "inventory.json"]);
  assert.equal(generated.code, 0, generated.stderr);
  assert.equal(await readFile(join(root, "inventory.json"), "utf8"), renderInventory(current));
});

test("removing a baseline URL without a redirect fails, and a redirect fixes it", async () => {
  const root = await temporaryRoot();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs", "index.md"), "# Home\n");
  await writeFile(join(root, "docs", "old.md"), "# Old\n");
  await writeFile(join(root, "docs", "gone.md"), "# Gone\n");
  // The sitemap lists only the home page, so the deleted pages are the only failure.
  await writeFile(join(root, "docs", "sitemap.xml"), sitemap([`${SITE_URL}/`]));

  const baseline = await collectSiteUrls(root);
  assert.ok(baseline.includes(`${SITE_URL}/old.html`));
  assert.ok(baseline.includes(`${SITE_URL}/gone.html`));
  const baselineText = await writeBaseline(root, baseline);

  await rm(join(root, "docs", "old.md"));
  await rm(join(root, "docs", "gone.md"));

  const lost = await runTool(root, ["--check"]);
  assert.equal(lost.code, 1);
  assert.match(lost.stderr, /URL disappeared without a redirect: .*\/old\.html/);
  assert.match(lost.stderr, /URL disappeared without a redirect: .*\/gone\.html/);
  assert.match(lost.stderr, /redirect_from or a stub in docs\/redirects\//);
  assert.match(lost.stderr, /--update-baseline/);

  const refused = await runTool(root, ["--update-baseline"]);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /refusing to drop .*\/old\.html without a redirect/);
  assert.equal(await readFile(join(root, BASELINE_PATH), "utf8"), baselineText);

  // A stub in docs/redirects/ covers one URL; redirect_from on a surviving page covers the other.
  await mkdir(join(root, "docs", "redirects"), { recursive: true });
  await writeFile(
    join(root, "docs", "redirects", "old.md"),
    "---\npermalink: /old.html\nredirect_to: /\nsitemap: false\n---\n",
  );
  await writeFile(join(root, "docs", "index.md"), "---\nredirect_from:\n  - /gone.html\n---\n# Home\n");

  const redirected = await redirectedUrls(root);
  assert.ok(redirected.includes(`${SITE_URL}/old.html`));
  assert.ok(redirected.includes(`${SITE_URL}/gone.html`));
  // Redirect stubs are not new pages, and a page with its own permalink is not a redirect.
  const current = await collectSiteUrls(root);
  assert.ok(!current.includes(`${SITE_URL}/old.html`));
  assert.ok(!redirected.includes(`${SITE_URL}/`));

  const fixed = await runTool(root, ["--check"]);
  assert.equal(fixed.code, 0, fixed.stderr);
});

test("--check fails when a sitemap URL has no file under docs/", async () => {
  const root = await temporaryRoot();
  await mkdir(join(root, "docs", "rules"), { recursive: true });
  await writeFile(join(root, "docs", "index.md"), "# Home\n");
  await writeFile(join(root, "docs", "rules", "index.md"), "# Rules\n");
  const listed = [`${SITE_URL}/`, `${SITE_URL}/rules/`, `${SITE_URL}/rules/demo.thing.eol-1.html`];
  await writeFile(join(root, "docs", "sitemap.xml"), sitemap(listed));
  await writeBaseline(root, await collectSiteUrls(root));

  const urls = await collectSiteUrls(root);
  assert.ok(urls.includes(`${SITE_URL}/rules/demo.thing.eol-1.html`));
  assert.deepEqual(await missingFromSite(urls, root), [`${SITE_URL}/rules/demo.thing.eol-1.html`]);

  const missing = await runTool(root, ["--check"]);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /missing from docs\/: .*\/rules\/demo\.thing\.eol-1\.html/);

  await writeFile(join(root, "docs", "rules", "demo.thing.eol-1.md"), "# Demo\n");
  assert.deepEqual(await missingFromSite(urls, root), []);
  assert.equal((await runTool(root, ["--check"])).code, 0);
});

test("README inventory URLs that jekyll-readme-index drops keep a redirect", async () => {
  // jekyll-readme-index publishes these READMEs as the directory index (or
  // leaves a sibling index.html in place), so …/README.html would 404 without
  // jekyll-redirect-from. Use redirect_to stubs — redirect_from on the README
  // itself loops when readme-index rewrites the permalink to the directory.
  const redirects: ReadonlyArray<{ path: string; permalink: string; to: string }> = [
    { path: "docs/dashboard/README.md", permalink: "/dashboard/README.html", to: "/dashboard/" },
    { path: "docs/redirects/rfcs-readme.md", permalink: "/rfcs/README.html", to: "/rfcs/" },
    { path: "docs/redirects/i18n-fa-readme.md", permalink: "/i18n/fa/README.html", to: "/i18n/fa/" },
  ];
  for (const entry of redirects) {
    const text = await readFile(resolve(entry.path), "utf8");
    const frontMatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    assert.ok(frontMatter, `${entry.path} needs YAML front matter for the redirect`);
    assert.match(frontMatter, new RegExp(`^redirect_to:\\s*${entry.to.replaceAll("/", "\\/")}\\s*$`, "m"), entry.path);
    assert.match(
      frontMatter,
      new RegExp(`^permalink:\\s*${entry.permalink.replaceAll("/", "\\/").replaceAll(".", "\\.")}\\s*$`, "m"),
      entry.path,
    );
  }

  const redirected = await redirectedUrls();
  for (const entry of redirects) assert.ok(redirected.includes(`${SITE_URL}${entry.permalink}`), entry.path);

  const config = await readFile(resolve("docs/_config.yml"), "utf8");
  assert.match(config, /^\s*-\s*jekyll-redirect-from\s*$/m);
});

test("the machine files stay static and served at their old root URLs", async () => {
  const urls = await collectSiteUrls();
  const machineFiles = ["llms.txt", "llms-full.txt", "sitemap.xml"];
  const buildTime = new Set<string>(BUILD_TIME_MACHINE_FILES);
  for (const file of machineFiles) {
    assert.ok(urls.includes(`${SITE_URL}/${file}`), `${file} is missing from the URL inventory`);
    assert.deepEqual(docsPathsForUrl(`${SITE_URL}/${file}`), [file]);
    const text =
      file === "llms-full.txt"
        ? await renderLlmsFull()
        : file === "sitemap.xml"
          ? renderSitemap(await loadRegistries())
          : await readFile(resolve("docs", file), "utf8");
    assert.doesNotMatch(
      text,
      /^---\r?\n/,
      `docs/${file} must stay a static file: front matter would make Jekyll render it through a layout instead of serving it as is`,
    );
    if (buildTime.has(file)) assert.ok(text.length > 0, `${file} must be buildable`);
  }
  assert.deepEqual([...BUILD_TIME_MACHINE_FILES], ["llms-full.txt", "sitemap.xml"]);
  assert.deepEqual([...BUILD_TIME_DOCS_FILES], ["llms-full.txt", "sitemap.xml", "rules/index.md"]);

  const claimed = new Set(machineFiles.map((file) => `/${file}`));
  for (const entry of await readdir(resolve("docs"), { recursive: true })) {
    if (!entry.endsWith(".md") && !entry.endsWith(".html")) continue;
    const frontMatter =
      (await readFile(resolve("docs", entry), "utf8")).match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    const permalink = frontMatter.match(/^permalink:\s*["']?([^"'\s]+)/m)?.[1];
    assert.ok(
      permalink === undefined || !claimed.has(permalink),
      `docs/${entry} publishes ${permalink}, which the machine files own; add the page to llms.txt and sitemap generation instead`,
    );
  }
});
