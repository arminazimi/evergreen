import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { parse } from "yaml";

import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import {
  LOOKUP_PAGE,
  SITE_URL,
  answerLead,
  buildFiles,
  checkCommand,
  drift,
  faqMainEntity,
  loadRegistries,
  lookupEntries,
  lookupUrl,
  pageTitle,
  renderIndex,
  renderLookupPage,
  renderRuleData,
  renderRulePage,
  renderSitemap,
  ruleDataUrl,
  ruleUrl,
  write,
} from "../tools/build-reference-pages.js";
import { answerPageEntries } from "../tools/build-answer-pages.js";

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
  replacement: "Demo 2 | or later",
  deadline: "2026-01-31",
  sources: [{ title: "Demo lifecycle", url: "https://example.com/demo" }],
  provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "someone" },
  ...overrides,
});

const registry = (rules: RegistryV2Rule[], maxReviewAgeDays?: number): RegistryV2 => ({
  schemaVersion: "evergreen.registry.v2",
  ecosystem: "demo",
  ...(maxReviewAgeDays ? { freshness: { maxReviewAgeDays } } : {}),
  rules,
});

function structuredDataRoot(page: string): Record<string, unknown> {
  const match = /<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/.exec(page);
  assert.ok(match, "the page has no JSON-LD block");
  return JSON.parse(match[1]!) as Record<string, unknown>;
}

function structuredData(page: string, type: string): Record<string, unknown> {
  const root = structuredDataRoot(page);
  if (root["@type"] === type) return root;
  const graph = root["@graph"];
  assert.ok(Array.isArray(graph), `structured data has no @graph for ${type}`);
  const node = (graph as Array<Record<string, unknown>>).find((entry) => entry["@type"] === type);
  assert.ok(node, `structured data has no ${type}`);
  return node;
}

test("every bundled rule has a page and a JSON twin, and the committed files match the registry", async () => {
  const registries = await loadRegistries();
  const total = registries.reduce((sum, item) => sum + item.rules.length, 0);
  assert.ok(total >= 100);
  const files = buildFiles(registries);
  const pages = files.filter((file) => file.path.startsWith("docs/rules/") && file.path.endsWith(".md") && !file.path.endsWith("index.md"));
  const twins = files.filter((file) => file.path.startsWith("docs/rules/") && file.path.endsWith(".json"));
  assert.equal(pages.length, total);
  assert.equal(twins.length, total);
  assert.deepEqual(
    twins.map((file) => file.path),
    pages.map((file) => file.path.replace(/\.md$/, ".json")),
  );
  assert.deepEqual(await drift(files), []);
});

test("a page links its JSON twin, and the twin is the evergreen.rule.v1 document", () => {
  const fixture = rule({
    sources: [{ title: "Demo lifecycle", url: "https://example.com/demo", accessedAt: "2026-10-03" }],
    migration: {
      constraints: ["Keep behavior."],
      steps: [{ id: "change", title: "Change it", instructions: "Do the change.", targets: "declaration" }],
      verification: [{ command: "make test", purpose: "Run the tests." }],
    },
  });
  const page = renderRulePage(fixture, 180);
  const frontMatter = parse(page.slice(4, page.indexOf("\n---\n", 4))) as { json_twin: string };
  assert.equal(frontMatter.json_twin, "/rules/demo.thing.eol-1.json");
  assert.equal(ruleDataUrl(fixture.id), `${SITE_URL}/rules/demo.thing.eol-1.json`);

  const contents = renderRuleData(fixture);
  assert.ok(contents.endsWith("\n"));
  const twin = JSON.parse(contents) as Record<string, unknown>;
  assert.equal(twin.schemaVersion, "evergreen.rule.v1");
  assert.equal(twin.id, fixture.id);
  assert.equal(twin.ecosystem, fixture.ecosystem);
  assert.equal(twin.purl, fixture.purl);
  assert.equal(twin.affectedVersions, fixture.vers);
  assert.equal(twin.event, fixture.event);
  assert.equal(twin.severity, fixture.severity);
  assert.equal(twin.title, fixture.title);
  assert.equal(twin.summary, fixture.summary);
  assert.equal(twin.deadline, fixture.deadline);
  assert.equal(twin.replacement, fixture.replacement);
  assert.deepEqual(twin.sources, fixture.sources);
  assert.deepEqual(twin.provenance, fixture.provenance);
  assert.deepEqual(twin.migration, fixture.migration);
});

test("every published rule twin is a valid evergreen.rule.v1 document", async () => {
  const { Ajv2020 } = await import("ajv/dist/2020.js");
  const validate = new Ajv2020({ allErrors: true }).compile(JSON.parse(await readFile(resolve("schemas/rule.v1.schema.json"), "utf8")) as object);
  for (const item of await loadRegistries()) {
    for (const entry of item.rules) {
      const twin = JSON.parse(renderRuleData(entry)) as unknown;
      assert.equal(validate(twin), true, `${entry.id}: ${JSON.stringify(validate.errors)}`);
    }
  }
});

test("the site head links a page's JSON twin when its front matter names one", async () => {
  const include = await readFile("docs/_includes/head-custom.html", "utf8");
  assert.match(include, /\{%-\s*if page\.json_twin\s*%\}/);
  assert.match(include, /<link rel="alternate" type="application\/json" href="\{\{ page\.json_twin \| relative_url \}\}">/);
});

test("a page states status, versions, dates, sources, freshness, migration, and detectors", () => {
  const fixture = rule({
    migration: {
      constraints: ["Keep behavior."],
      steps: [{ id: "change", title: "Change it", instructions: "Do the change.", targets: "declaration" }],
      verification: [{ command: "make test", purpose: "Run the tests." }],
    },
  });
  const page = renderRulePage(fixture, 180);
  assert.match(page, /^---\ntitle: "Demo 1 is end of life — dates, impact, migration"\n/);
  assert.match(page, /canonical_url: "https:\/\/arminazimi\.github\.io\/evergreen\/rules\/demo\.thing\.eol-1\.html"/);
  // The first paragraph answers status, date, and replacement, with the source linked.
  assert.match(
    page,
    /^# Demo 1 is end of life\n\n\*\*End of life\*\* as of 2026-01-31\. Replacement: Demo 2 \| or later\. Source: \[Demo lifecycle\]\(https:\/\/example\.com\/demo\)\.\n/m,
  );
  assert.match(page, /Check a version:\n\n```bash\nevergreen check pkg:generic\/demo\n```/);
  assert.equal(answerLead(fixture), "**End of life** as of 2026-01-31. Replacement: Demo 2 | or later. Source: [Demo lifecycle](https://example.com/demo).");
  assert.equal(checkCommand(fixture), "evergreen check pkg:generic/demo");
  assert.match(page, /\| Status \| End of life \|/);
  assert.match(page, /\| Affected versions \| `vers:semver\/<2\.0\.0` \|/);
  assert.match(page, /\| Date from the source \| 2026-01-31 \|/);
  assert.match(page, /\| Replacement \| Demo 2 \\\| or later \|/);
  assert.match(page, /\| Review due \| 2027-03-31 \(180 days after the last review\) \|/);
  assert.match(page, /- \[Demo lifecycle\]\(https:\/\/example\.com\/demo\)/);
  assert.match(page, /1\. \*\*Change it\.\*\* Do the change\./);
  assert.match(page, /- `make test`: Run the tests\./);
  assert.match(page, /No built-in detector reads `demo` declarations yet/);
  assert.match(page, /\]\(\.\.\/lookup\.html\)/);
  assert.match(page, /<form action="\.\.\/lookup\.html" method="get" role="search">/);
});

test("a range with a pipe does not break the table", () => {
  const page = renderRulePage(rule({ vers: "vers:semver/>=1.0.0|<2.0.0" }), 365);
  assert.match(page, /\| Affected versions \| `vers:semver\/>=1\.0\.0\\\|<2\.0\.0` \|/);
});

test("a rule with no day or migration says so instead of inventing one", () => {
  const { deadline: _deadline, replacement: _replacement, ...bare } = rule();
  const page = renderRulePage(bare, 365);
  assert.match(page, /^\*\*End of life\.\*\* The source gives no day\. Source: \[Demo lifecycle\]\(https:\/\/example\.com\/demo\)\.$/m);
  assert.doesNotMatch(page, /Replacement:/);
  assert.match(page, /\| Date from the source \| The source gives no day \|/);
  assert.doesNotMatch(page, /## Migration/);
  assert.doesNotMatch(page, /\| Replacement \|/);
});

test("bundled detectors are linked to their pages", async () => {
  const registries = await loadRegistries();
  const java = registries.find((item) => item.ecosystem === "java")!;
  assert.match(renderRulePage(java.rules[0]!, 180), /\[`java`\]\(\.\.\/detectors\/java\.md\)/);
  const npm = registries.find((item) => item.ecosystem === "npm")!;
  assert.match(renderRulePage(npm.rules[0]!, 365), /The `npm` detector\./);
});

test("titles are unique, follow the search-friendly pattern, and every page names its canonical URL", async () => {
  const titles = new Map<string, string>();
  for (const item of await loadRegistries()) {
    for (const entry of item.rules) {
      const page = renderRulePage(entry, 365);
      const title = /^title: (.*)$/m.exec(page)![1]!;
      assert.ok((JSON.parse(title) as string).endsWith(" — dates, impact, migration"), entry.id);
      assert.equal(titles.has(title), false, `${entry.id} repeats the title of ${titles.get(title)}`);
      titles.set(title, entry.id);
      assert.ok(page.includes(`canonical_url: "${ruleUrl(entry.id)}"`), entry.id);
      assert.ok(entry.title.length > 0 && JSON.parse(title).length <= 120, `${entry.id}: the title is too long for a search result`);
    }
  }
});

test("every rule page answers status, date, and replacement first, then offers evergreen check", async () => {
  for (const item of await loadRegistries()) {
    for (const entry of item.rules) {
      const page = renderRulePage(entry, 365);
      const lead = answerLead(entry);
      const command = checkCommand(entry);
      assert.ok(page.includes(lead), `${entry.id}: missing answer lead`);
      assert.ok(page.includes(`\`\`\`bash\n${command}\n\`\`\``), `${entry.id}: missing check command`);
      assert.ok(page.indexOf(lead) < page.indexOf(command), `${entry.id}: check should follow the answer`);
      if (entry.deadline) assert.match(lead, new RegExp(`as of ${entry.deadline}`));
      else assert.match(lead, /The source gives no day/);
      if (entry.replacement) assert.ok(lead.includes("Replacement:"), entry.id);
      assert.match(lead, /Source: \[/);
    }
  }
});

test("the sitemap lists the site, the lookup page, both indexes, every rule, and every answer page once", async () => {
  const registries = await loadRegistries();
  const sitemap = renderSitemap(registries);
  const answers = answerPageEntries(registries);
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);
  assert.equal(new Set(locations).size, locations.length);
  assert.deepEqual(locations, [...locations].sort());
  assert.ok(locations.includes(`${SITE_URL}/`));
  assert.ok(locations.includes(lookupUrl()));
  assert.ok(locations.includes(`${SITE_URL}/rules/`));
  assert.ok(locations.includes(`${SITE_URL}/eol/`));
  for (const page of answers) assert.ok(locations.includes(page.loc), page.loc);
  assert.equal(locations.length, registries.reduce((sum, item) => sum + item.rules.length, 0) + answers.length + 4);
  assert.match(sitemap, /<url><loc>[^<]+<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod><\/url>/);
  assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(sitemap.length < 50_000_000 && locations.length < 50_000);
});

test("the lookup page inlines every rule with sources and makes no requests", async () => {
  const registries = await loadRegistries();
  const page = renderLookupPage(registries);
  const entries = lookupEntries(registries);
  assert.ok(entries.length >= 100);
  assert.match(page, /^<!doctype html>\n<html lang="en">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/arminazimi\.github\.io\/evergreen\/lookup\.html" \/>/);
  assert.match(page, /<script type="application\/json" id="lookup-data">/);
  assert.doesNotMatch(page, /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/);
  assert.match(page, /makes no network requests after it loads/);

  const match = /<script type="application\/json" id="lookup-data">\n([\s\S]*?)\n\s*<\/script>/.exec(page);
  assert.ok(match);
  const embedded = JSON.parse(match[1]!) as Array<{ id: string; sources: Array<{ url: string }>; title: string }>;
  assert.equal(embedded.length, entries.length);
  assert.deepEqual(
    embedded.map((entry) => entry.id),
    entries.map((entry) => entry.id),
  );
  for (const entry of embedded) {
    assert.ok(entry.sources.length >= 1, entry.id);
    assert.ok(entry.sources.every((source) => /^https?:\/\//.test(source.url)), entry.id);
  }
  assert.match(page, /href = "rules\/" \+/);
  assert.match(page, /sourceLink\.href = source\.url/);
  assert.equal(buildFiles(registries).some((file) => file.path === LOOKUP_PAGE), true);
});

test("lookup data can never close the embedded JSON element", () => {
  const page = renderLookupPage([
    registry([
      rule({
        title: "A </script><script>alert(1)</script> title",
        summary: "Bad </script><script>alert(2)</script> text",
        sources: [{ title: "Doc </script>", url: "https://example.com/x" }],
      }),
    ]),
  ]);
  const block = page.slice(page.indexOf('<script type="application/json" id="lookup-data">'));
  const end = block.indexOf("</script>");
  assert.equal(block.indexOf("</"), end);
  const embedded = JSON.parse(
    /<script type="application\/json" id="lookup-data">\n([\s\S]*?)\n\s*<\/script>/.exec(page)![1]!,
  ) as Array<{ title: string; summary: string }>;
  assert.equal(embedded[0]!.title, "A </script><script>alert(1)</script> title");
  assert.equal(embedded[0]!.summary, "Bad </script><script>alert(2)</script> text");
});

test("the site configuration gives the absolute URL the canonical links rely on", async () => {
  const config = parse(await readFile("docs/_config.yml", "utf8")) as { url: string; baseurl: string };
  assert.equal(`${config.url}${config.baseurl}`, SITE_URL);
});

test("a long summary is cut at a sentence for the description", () => {
  const long = `${"First sentence that is fairly long and descriptive. ".repeat(2)}${"More words follow here. ".repeat(20)}`;
  const description = /^description: (.*)$/m.exec(renderRulePage(rule({ summary: long }), 365))![1]!;
  const text = JSON.parse(description) as string;
  assert.ok(text.length <= 200);
  assert.ok(text.endsWith("."));
});

test("drift names a changed page, a missing page, and a stale page", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-reference-"));
  temporaryRoots.push(root);
    const files = buildFiles([registry([rule(), rule({ id: "demo.other.eol-2", title: "Demo 2 is end of life" })])]);
  await write(files, root);
  assert.deepEqual(await drift(files, root), []);

  await writeFile(join(root, "docs/rules/demo.thing.eol-1.md"), "edited\n");
  const fewer = buildFiles([registry([rule()])]);
  assert.deepEqual(await drift(fewer, root), [
    "differs: docs/lookup.html",
    "differs: docs/rules/demo.thing.eol-1.md",
    "differs: docs/rules/index.md",
    "differs: docs/sitemap.xml",
    "stale: docs/rules/demo.other.eol-2.json",
    "stale: docs/rules/demo.other.eol-2.md",
  ]);

  await write(fewer, root);
  assert.deepEqual(await drift(fewer, root), []);

  await writeFile(join(root, "docs/rules/demo.thing.eol-1.json"), "{}\n");
  assert.deepEqual(await drift(fewer, root), ["differs: docs/rules/demo.thing.eol-1.json"]);
  await write(fewer, root);

  assert.deepEqual(await drift(buildFiles([registry([rule(), rule({ id: "demo.new.eol-3" })])]), root), [
    "differs: docs/lookup.html",
    "differs: docs/rules/index.md",
    "differs: docs/sitemap.xml",
    "missing: docs/rules/demo.new.eol-3.json",
    "missing: docs/rules/demo.new.eol-3.md",
  ]);
});

test("every rule field is rendered in its context and escaped there", () => {
  const fixture = rule({
    title: "Demo 1 <script>alert(1)</script> | upgrade",
    summary: "The vendor says </script><script>alert(2)</script> & more.",
    replacement: "Demo 2 <new> | later",
    requires: { node: "18.0.0", python: "3.10" },
    sources: [{ title: "Demo [lifecycle] <doc>", url: "https://example.com/demo", accessedAt: "2026-10-03" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "A <reviewer> | team", importer: "demo-import" },
    migration: {
      constraints: ["Keep <behavior>."],
      steps: [{ id: "internal-step", title: "Change <it>", instructions: "Do <the> change.", targets: "declaration" }],
      verification: [{ command: "make <test>", purpose: "Run <tests>." }],
    },
    usage: [{ kind: "import", language: "javascript", module: "internal-matcher" }],
  });
  const page = renderRulePage(fixture, 180);

  // Front matter stays a quoted YAML scalar, and the structured data gets the unescaped facts.
  const frontMatter = parse(page.slice(4, page.indexOf("\n---\n", 4))) as { title: string; description: string; canonical_url: string };
  assert.equal(frontMatter.title, pageTitle(fixture));
  assert.equal(frontMatter.description, fixture.summary);
  assert.equal(frontMatter.canonical_url, ruleUrl(fixture.id));

  // Prose is HTML-escaped, so a rule can never inject markup into the page.
  assert.match(page, /^# Demo 1 &lt;script&gt;alert\(1\)&lt;\/script&gt; \| upgrade$/m);
  assert.match(
    page,
    /^\*\*End of life\*\* as of 2026-01-31\. Replacement: Demo 2 &lt;new&gt; \| later\. Source: \[Demo \\\[lifecycle\\\] &lt;doc&gt;\]\(https:\/\/example\.com\/demo\)\.$/m,
  );
  assert.match(page, /^The vendor says &lt;\/script&gt;&lt;script&gt;alert\(2\)&lt;\/script&gt; &amp; more\.$/m);
  assert.match(page, /\| Replacement \| Demo 2 &lt;new&gt; \\\| later \|/);
  assert.match(page, /\| Replacement requires \| Node\.js 18\.0\.0 or newer and Python 3\.10 or newer \|/);
  assert.match(page, /\| Reviewed \| 2026-10-02 by A &lt;reviewer&gt; \\\| team, drafted by the `demo-import` importer \|/);
  assert.match(page, /- \[Demo \\\[lifecycle\\\] &lt;doc&gt;\]\(https:\/\/example\.com\/demo\) \(accessed 2026-10-03\)/);
  assert.match(page, /- Keep &lt;behavior&gt;\./);
  assert.match(page, /1\. \*\*Change &lt;it&gt;\.\*\* Do &lt;the&gt; change\./);
  // Inside a code span entities do not decode, so `<` stays literal there.
  assert.match(page, /- `make <test>`: Run &lt;tests&gt;\./);
  assert.doesNotMatch(page, /internal-matcher|internal-step/);
  assert.doesNotMatch(page, /<new>|<reviewer>|<behavior>|<the>|<tests>/);

  // The index escapes link labels and links every rule.
  assert.match(
    renderIndex([registry([rule({ title: "Demo [1] <x>" })])]),
    /- \[Demo \\\[1\\\] &lt;x&gt;\]\(demo\.thing\.eol-1\.html\) — end of life, `demo\.thing\.eol-1`/,
  );
});

test("a rule without requires or an access date says nothing about them", () => {
  const page = renderRulePage(rule(), 365);
  assert.doesNotMatch(page, /Replacement requires/);
  assert.doesNotMatch(page, /\(accessed /);
});

test("every registry rule appears in the index and the sitemap", async () => {
  const registries = await loadRegistries();
  const index = renderIndex(registries);
  const sitemap = renderSitemap(registries);
  for (const item of registries) {
    for (const entry of item.rules) {
      assert.ok(index.includes(`](${entry.id}.html)`), `${entry.id} is missing from the index`);
      assert.ok(sitemap.includes(`<loc>${ruleUrl(entry.id)}</loc>`), `${entry.id} is missing from the sitemap`);
    }
  }
  const links = [...index.matchAll(/^- \[.*\]\(([^)]+\.html)\) — /gm)];
  assert.equal(links.length, registries.reduce((sum, item) => sum + item.rules.length, 0));
});

test("a rule id in two registries is an error", () => {
  assert.throws(() => buildFiles([registry([rule()]), { ...registry([rule()]), ecosystem: "other" }]), /more than one registry/);
});

test("only v2 rule registries are read from the registry directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-registries-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "demo.json"), JSON.stringify(registry([rule()])));
  await writeFile(join(root, "sources.lock.json"), JSON.stringify({ schemaVersion: "evergreen.source-lock.v1", sources: {} }));
  await writeFile(join(root, "shas.json"), JSON.stringify({ schemaVersion: "other", entries: [] }));
  assert.deepEqual((await loadRegistries(root)).map((item) => item.ecosystem), ["demo"]);
  assert.ok((await readFile(join(root, "demo.json"), "utf8")).length > 0);
});

test("each page carries valid structured data that agrees with the page", async () => {
  for (const item of await loadRegistries()) {
    for (const entry of item.rules) {
      const page = renderRulePage(entry, 365);
      const root = structuredDataRoot(page);
      assert.equal(root["@context"], "https://schema.org");
      assert.ok(Array.isArray(root["@graph"]));

      const data = structuredData(page, "TechArticle");
      assert.equal(data["@type"], "TechArticle");
      assert.equal(data.url, ruleUrl(entry.id));
      assert.equal(data["@id"], data.url);
      assert.equal(data.headline, pageTitle(entry));
      assert.equal(data.dateModified, entry.provenance.reviewedAt);
      assert.deepEqual((data.citation as Array<{ url: string }>).map((citation) => citation.url), entry.sources.map((source) => source.url));
      assert.equal((data.about as { identifier: string }).identifier, entry.purl);
      assert.equal(typeof data.description, "string");
      assert.ok((data.description as string).length <= 201);
      assert.match(data.isBasedOn as string, new RegExp(`/registry/${entry.ecosystem}\\.json$`));
      assert.equal((data.publisher as { url: string }).url, "https://arminazimi.github.io/evergreen");

      const faq = structuredData(page, "FAQPage");
      assert.equal(faq["@type"], "FAQPage");
      assert.equal(faq.url, ruleUrl(entry.id));
      assert.equal(faq["@id"], `${ruleUrl(entry.id)}#faq`);
      assert.deepEqual(faq.mainEntity, faqMainEntity(entry));
      const questions = faq.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
      assert.ok(questions.length >= 2);
      assert.ok(questions.every((question) => question.name.length > 0 && question.acceptedAnswer.text.length > 0));
      assert.ok(questions.some((question) => question.acceptedAnswer.text.includes(checkCommand(entry))));
      if (entry.replacement) {
        assert.ok(questions.some((question) => question.acceptedAnswer.text === entry.replacement));
      }
    }
  }
});

test("the home page publishes SoftwareApplication structured data", async () => {
  const home = await readFile("docs/index.md", "utf8");
  const data = structuredData(home, "SoftwareApplication");
  assert.equal(structuredDataRoot(home)["@context"], "https://schema.org");
  assert.equal(data["@type"], "SoftwareApplication");
  assert.equal(data.name, "Evergreen");
  assert.equal(data.alternateName, "evergreen-deprecation");
  assert.equal(data.applicationCategory, "DeveloperApplication");
  assert.equal(data.operatingSystem, "Node.js 22 or newer");
  assert.equal(data.url, "https://arminazimi.github.io/evergreen/");
  assert.equal(data.downloadUrl, "https://www.npmjs.com/package/evergreen-deprecation");
  assert.equal((data.offers as { price: string; priceCurrency: string }).price, "0");
  assert.equal((data.offers as { price: string; priceCurrency: string }).priceCurrency, "USD");
  assert.deepEqual(data.sameAs, [
    "https://github.com/arminazimi/evergreen",
    "https://www.npmjs.com/package/evergreen-deprecation",
  ]);
  assert.equal(typeof data.description, "string");
  assert.ok((data.description as string).length > 40);
});

test("data can never close the structured-data element", () => {
  const page = renderRulePage(
    rule({
      summary: "Bad </script><script>alert(1)</script> text",
      title: "A </script> title",
      replacement: "Use </script><script>alert(2)</script>",
    }),
    365,
  );
  const block = page.slice(page.indexOf('<script type="application/ld+json">'));
  // Only the closing tag the generator writes: no `</` appears inside the JSON.
  assert.equal(block.indexOf("</"), block.lastIndexOf("</script>"));
  assert.equal(structuredData(page, "TechArticle").headline, "A </script> title — dates, impact, migration");
  assert.equal(structuredData(page, "TechArticle").description, "Bad </script><script>alert(1)</script> text");
  assert.equal(
    (structuredData(page, "FAQPage").mainEntity as Array<{ acceptedAnswer: { text: string } }>).find(
      (question) => question.acceptedAnswer.text.startsWith("Use "),
    )?.acceptedAnswer.text,
    "Use </script><script>alert(2)</script>",
  );
});

test("the page says where the machine-readable data lives and that no CLE export exists yet", () => {
  const page = renderRulePage(rule(), 365);
  assert.match(page, /registry\/demo\.json/);
  assert.match(page, /A CLE \(ECMA-428\) export is not published yet\./);
});

const run = promisify(execFile);
const generator = resolve("dist/tools/build-reference-pages.js");

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
  const root = await mkdtemp(join(tmpdir(), "evergreen-reference-cli-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "registry"), { recursive: true });
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([rule()])));
  await write(buildFiles([registry([rule()])]), root);
  assert.deepEqual(await checkIn(root), { code: 0, stderr: "" });

  // The registry changes, but the pages are not regenerated.
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([rule({ summary: "A different claim." })])));
  const drifted = await checkIn(root);
  assert.equal(drifted.code, 1);
  assert.match(drifted.stderr, /differs: docs\/rules\/demo\.thing\.eol-1\.md/);
  assert.match(drifted.stderr, /differs: docs\/rules\/demo\.thing\.eol-1\.json/);
  assert.match(drifted.stderr, /npm run build:reference/);

  // A rule is removed: its page and its JSON twin are stale.
  await writeFile(join(root, "registry/demo.json"), JSON.stringify(registry([])));
  assert.match((await checkIn(root)).stderr, /stale: docs\/rules\/demo\.thing\.eol-1\.md/);
  assert.match((await checkIn(root)).stderr, /stale: docs\/rules\/demo\.thing\.eol-1\.json/);
});

test("CI runs the drift check", async () => {
  const workflow = parse(await readFile(".github/workflows/ci.yml", "utf8")) as {
    jobs: { check: { steps: Array<{ name?: string; run?: string; if?: string }> } };
  };
  const step = workflow.jobs.check.steps.find((item) => item.run === "node dist/tools/build-reference-pages.js --check");
  assert.ok(step, "ci.yml has no reference-page drift step");
  assert.match(step.if ?? "", /runner\.os == 'Linux'/);
});
