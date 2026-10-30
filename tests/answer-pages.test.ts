import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { parse } from "yaml";

import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import { purlIdentity } from "../src/purl.js";
import { SITE_URL, loadRegistries, renderSitemap } from "../tools/build-reference-pages.js";
import {
  ANSWER_PAGE_LIMIT,
  PRIORITY_PRODUCTS,
  answerLead,
  answerPageEntries,
  buildFiles,
  drift,
  pageTitle,
  productSlug,
  renderAnswerPage,
  selectProducts,
  write,
} from "../tools/build-answer-pages.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const rule = (overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule => ({
  id: "demo.thing.eol-1",
  ecosystem: "demo",
  purl: "pkg:generic/demo",
  vers: "vers:semver/<2.0.0",
  event: "end-of-life",
  title: "Demo 1 is end of life",
  summary: "The vendor lists Demo 1 as end of life.",
  severity: "high",
  replacement: "Demo 2",
  deadline: "2026-01-31",
  sources: [{ title: "Demo lifecycle", url: "https://example.com/demo" }],
  provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "someone" },
  ...overrides,
});

const registry = (rules: RegistryV2Rule[]): RegistryV2 => ({
  schemaVersion: "evergreen.registry.v2",
  ecosystem: "demo",
  rules,
});

function structuredData(page: string): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/.exec(page);
  assert.ok(match, "the page has no JSON-LD block");
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

test("slugs come from the Package URL and stay stable", () => {
  assert.equal(productSlug("pkg:generic/nodejs"), "nodejs");
  assert.equal(productSlug("pkg:pypi/django"), "django");
  assert.equal(productSlug("pkg:npm/@angular/core"), "npm-angular-core");
  assert.equal(productSlug("pkg:npm/%40angular/core"), "npm-angular-core");
  assert.equal(productSlug("pkg:docker/library/node"), "docker-node");
  assert.equal(productSlug("pkg:maven/org.springframework.boot/spring-boot@2.7.0"), "maven-org-springframework-boot-spring-boot");
  assert.equal(productSlug("pkg:composer/laravel/framework"), "composer-laravel-framework");
});

test("selection keeps the curated order, then fills by lifecycle-rule count and purl", () => {
  const products = selectProducts(
    [
      registry([
        rule({ id: "priority.nodejs", purl: "pkg:generic/nodejs", event: "deprecated", title: "Node.js symbol" }),
        rule({ id: "fill.many.a", purl: "pkg:generic/zeta", title: "Zeta old" }),
        rule({ id: "fill.many.b", purl: "pkg:generic/zeta", event: "end-of-support", title: "Zeta support", deadline: "2025-01-01" }),
        rule({ id: "fill.alpha", purl: "pkg:generic/alpha", event: "scheduled-end-of-life", title: "Alpha scheduled" }),
        rule({ id: "fill.beta", purl: "pkg:generic/beta", title: "Beta ended" }),
        rule({ id: "fill.deprecated", purl: "pkg:generic/mmm", event: "deprecated", title: "Mmm deprecated" }),
        rule({ id: "versioned", purl: "pkg:generic/nodejs@20.0.0", event: "end-of-life", title: "Node.js 20 is end of life" }),
      ]),
    ],
    4,
  );
  assert.deepEqual(
    products.map((product) => product.purl),
    ["pkg:generic/nodejs", "pkg:generic/zeta", "pkg:generic/alpha", "pkg:generic/beta"],
  );
  assert.equal(products[0]?.rules.length, 2);
  assert.equal(products[0]?.name, "Node.js");
  assert.equal(products[0]?.slug, "nodejs");
});

test("a priority product missing from the registry is skipped", () => {
  const products = selectProducts(
    [
      registry([
        rule({ id: "z1", purl: "pkg:generic/zeta", title: "Zeta one" }),
        rule({ id: "z2", purl: "pkg:generic/zeta", event: "end-of-life", title: "Zeta two", deadline: "2024-01-01" }),
        rule({ id: "a", purl: "pkg:generic/alpha", title: "Alpha" }),
      ]),
    ],
    2,
  );
  assert.deepEqual(
    products.map((product) => product.purl),
    ["pkg:generic/zeta", "pkg:generic/alpha"],
  );
});

test("the registry yields exactly 50 curated products, and each page answers from those rules", async () => {
  assert.equal(PRIORITY_PRODUCTS.length, ANSWER_PAGE_LIMIT);
  const registries = await loadRegistries();
  const products = selectProducts(registries);
  assert.equal(products.length, ANSWER_PAGE_LIMIT);
  assert.deepEqual(
    products.map((product) => product.slug),
    PRIORITY_PRODUCTS.map((product) => productSlug(product.purl)),
  );
  assert.deepEqual(
    products.map((product) => product.name),
    PRIORITY_PRODUCTS.map((product) => product.name),
  );
  assert.equal(products.find((product) => product.slug === "npm-angular-core")?.purl, "pkg:npm/%40angular/core");
  assert.equal(new Set(products.map((product) => product.slug)).size, products.length);

  const files = buildFiles(registries);
  assert.equal(files.length, ANSWER_PAGE_LIMIT + 1);
  const index = files.find((file) => file.path === "docs/eol/index.md");
  assert.ok(index);
  assert.match(index.contents, /canonical_url: "https:\/\/arminazimi\.github\.io\/evergreen\/eol\/"/);
  assert.match(index.contents, /not written by hand/);

  for (const product of products) {
    assert.ok(product.rules.length > 0, product.purl);
    for (const entry of product.rules) assert.equal(purlIdentity(entry.purl), product.purl);
    const page = files.find((file) => file.path === `docs/eol/${product.slug}.md`);
    assert.ok(page, product.slug);
    const frontMatter = parse(page.contents.slice(4, page.contents.indexOf("\n---\n", 4))) as {
      title: string;
      description: string;
      canonical_url: string;
    };
    assert.equal(frontMatter.title, pageTitle(product));
    assert.equal(frontMatter.title, `Is ${product.name} end of life? — versions, dates, sources`);
    assert.equal(frontMatter.canonical_url, `${SITE_URL}/eol/${product.slug}.html`);
    assert.ok(frontMatter.description.length > 0 && frontMatter.description.length <= 200, product.slug);
    assert.ok(page.contents.includes(answerLead(product)), product.slug);
    assert.ok(page.contents.includes(`\`\`\`bash\nevergreen check ${product.purl}\n\`\`\``), product.slug);
    assert.match(page.contents, /generated from the lifecycle registry/);
    assert.match(page.contents, /not written by hand/);
    assert.ok(index.contents.includes(`(${product.slug}.html)`), product.slug);
    for (const entry of product.rules) assert.ok(page.contents.includes(`](../rules/${entry.id}.html)`), entry.id);

    const faq = structuredData(page.contents);
    assert.equal(faq["@context"], "https://schema.org");
    assert.equal(faq["@type"], "FAQPage");
    assert.equal(faq.url, frontMatter.canonical_url);
    assert.equal(faq["@id"], `${frontMatter.canonical_url}#faq`);
    const questions = faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    assert.equal(questions[0]?.name, `Is ${product.name} end of life?`);
    assert.match(questions[0]?.acceptedAnswer.text ?? "", /reviewed lifecycle rules?/);
    assert.equal(questions[1]?.name, `How do I check ${product.name}?`);
    assert.equal(questions[1]?.acceptedAnswer.text, `Run evergreen check ${product.purl}.`);
  }

  const sitemap = renderSitemap(registries);
  assert.ok(sitemap.includes(`<loc>${SITE_URL}/eol/</loc>`));
  for (const page of answerPageEntries(registries)) {
    assert.ok(sitemap.includes(`<loc>${page.loc}</loc><lastmod>${page.lastmod}</lastmod>`), page.slug);
  }
});

test("the committed answer pages match the registry", async () => {
  const registries = await loadRegistries();
  assert.deepEqual(await drift(buildFiles(registries)), []);
  const sitemap = await readFile("docs/sitemap.xml", "utf8");
  for (const page of answerPageEntries(registries)) assert.ok(sitemap.includes(`<loc>${page.loc}</loc>`), page.loc);
  assert.ok(sitemap.includes(`<loc>${SITE_URL}/eol/</loc>`));
});

test("a rule cannot inject markup into the page or close the structured-data element", () => {
  const page = renderAnswerPage({
    purl: "pkg:generic/demo",
    slug: "demo",
    name: "Demo <script>",
    rules: [
      rule({
        title: "Demo </script><script>alert(1)</script> | now",
        vers: "vers:semver/<2|>=1",
        sources: [{ title: "Demo [doc] <x>", url: "https://example.com/a?b=1&c=2" }],
      }),
    ],
  });
  assert.match(page, /^# Is Demo &lt;script&gt; end of life\?$/m);
  assert.match(page, /\[Demo &lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt; \\\| now\]\(\.\.\/rules\/demo\.thing\.eol-1\.html\)/);
  assert.match(page, /`vers:semver\/<2\\\|>=1`/);
  assert.match(page, /\[Demo \\\[doc\\\] &lt;x&gt;\]\(https:\/\/example\.com\/a\?b=1&c=2\)/);
  const body = page.slice(page.indexOf("\n---\n", 4));
  assert.doesNotMatch(body, /<script>alert/);
  const block = page.slice(page.indexOf('<script type="application/ld+json">'));
  assert.equal(block.indexOf("</"), block.indexOf("</script>"));
  const data = structuredData(page);
  const questions = data.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
  assert.equal(questions[0]?.name, "Is Demo <script> end of life?");
  assert.match(questions[0]?.acceptedAnswer.text ?? "", /<\/script>/);
});

test("drift names a changed page, a missing page, and a stale page", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-answer-"));
  temporaryRoots.push(root);
  const files = buildFiles([registry([rule()])]);
  await write(files, root);
  assert.deepEqual(await drift(files, root), []);

  await writeFile(join(root, "docs/eol/demo.md"), "edited\n");
  await writeFile(join(root, "docs/eol/old.md"), "stale\n");
  assert.deepEqual(await drift(files, root), ["differs: docs/eol/demo.md", "stale: docs/eol/old.md"]);

  await write(files, root);
  assert.deepEqual(await drift(files, root), []);
  assert.equal(await readFile(join(root, "docs/eol/old.md"), "utf8").catch(() => ""), "");

  await rm(join(root, "docs/eol/demo.md"));
  assert.deepEqual(await drift(files, root), ["missing: docs/eol/demo.md"]);
});

const run = promisify(execFile);
const generator = resolve("dist/tools/build-answer-pages.js");

async function checkIn(directory: string): Promise<{ code: number; stderr: string }> {
  try {
    await run(process.execPath, [generator, "--check"], { cwd: directory });
    return { code: 0, stderr: "" };
  } catch (error) {
    const failure = error as { code: number; stderr: string };
    return { code: failure.code, stderr: failure.stderr };
  }
}

test("--check passes on fresh pages and fails, naming the page, when one drifts", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-answer-cli-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "registry"), { recursive: true });
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([rule()])));
  await write(buildFiles([registry([rule()])]), root);
  assert.deepEqual(await checkIn(root), { code: 0, stderr: "" });

  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([rule({ title: "Demo 1 changed" })])));
  const drifted = await checkIn(root);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stderr, /differs: docs\/eol\/demo\.md/);
  assert.match(drifted.stderr, /npm run build:answer-pages/);

  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([])));
  const removed = await checkIn(root);
  assert.match(removed.stderr, /stale: docs\/eol\/demo\.md/);
  assert.match(removed.stderr, /differs: docs\/eol\/index\.md/);
});

test("CI and the npm scripts run the answer-page drift check", async () => {
  const workflow = parse(await readFile(".github/workflows/ci.yml", "utf8")) as {
    jobs: { check: { steps: Array<{ name?: string; run?: string; if?: string }> } };
  };
  const reference = workflow.jobs.check.steps.find((item) => item.run === "node dist/tools/build-reference-pages.js --check");
  const step = workflow.jobs.check.steps.find((item) => item.run === "node dist/tools/build-answer-pages.js --check");
  assert.ok(reference, "ci.yml has no reference-page drift step");
  assert.ok(step, "ci.yml has no answer-page drift step");
  assert.equal(step.if, reference.if);
  assert.match(step.if ?? "", /runner\.os == 'Linux'/);
  assert.match(step.if ?? "", /matrix\.node == 24/);

  const pkg = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["build:answer-pages"], "npm run build --silent && node dist/tools/build-answer-pages.js");
  assert.equal(pkg.scripts["check:answer-pages"], "npm run build --silent && node dist/tools/build-answer-pages.js --check");
  assert.match(await readFile("AGENTS.md", "utf8"), /`docs\/eol\/` \| `npm run build:answer-pages`/);
});
