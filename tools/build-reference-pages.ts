// Generates one public reference page and a JSON twin per lifecycle rule, an index, a lookup page, and a
// sitemap, from registry/*.json.
//
//   node dist/tools/build-reference-pages.js [--check]
//
// Output: docs/lookup.html, docs/rules/<rule id>.md, docs/rules/<rule id>.json, docs/rules/index.md, and
// docs/sitemap.xml. With --check nothing is written: the command exits 1 and names every file that differs
// from what the registry would produce, so a page can never silently disagree with the data. It reads
// registry/*.json only and never uses the network. The lookup page inlines its search index so it works
// offline and makes no requests.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { getCapabilityManifest } from "../src/capabilities.js";
import { DEFAULT_MAX_REVIEW_AGE_DAYS, REGISTRY_V2_SCHEMA_VERSION, validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import { toRuleDocument } from "../src/rule-resources.js";

export const SITE_URL = "https://arminazimi.github.io/evergreen";
const REPOSITORY_URL = "https://github.com/arminazimi/evergreen";
const RULES_DIRECTORY = "docs/rules";
export const LOOKUP_PAGE = "docs/lookup.html";
export const lookupUrl = () => `${SITE_URL}/lookup.html`;

const EVENT_LABELS: Record<RegistryV2Rule["event"], string> = {
  deprecated: "Deprecated",
  "end-of-support": "End of support",
  "end-of-life": "End of life",
  removed: "Removed",
  "scheduled-end-of-life": "Scheduled end of life",
};

const RUNTIME_LABELS: Record<"node" | "python", string> = { node: "Node.js", python: "Python" };

/** Detector pages that exist; other detectors are described in the detector guide. */
const DETECTOR_PAGES = new Set(["container", "go", "java", "kubernetes"]);

export interface GeneratedFile {
  /** Repository-relative path. */
  path: string;
  contents: string;
}

export const ruleUrl = (id: string) => `${SITE_URL}/rules/${id}.html`;
/** The machine-readable twin of a rule page, published beside it. */
export const ruleDataUrl = (id: string) => `${SITE_URL}/rules/${id}.json`;
const ruleDataPath = (id: string) => `/rules/${id}.json`;
const dataUrl = (ecosystem: string) => `${REPOSITORY_URL}/blob/main/registry/${ecosystem}.json`;

/** A rule as an `evergreen.rule.v1` document: the same facts the page renders, for agents that read JSON. */
export function renderRuleData(rule: RegistryV2Rule): string {
  return `${JSON.stringify(toRuleDocument(rule), null, 2)}\n`;
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** A string safe inside a YAML double-quoted scalar. */
const yaml = (value: string) => JSON.stringify(value);

/** Prose for Markdown: HTML in a rule can never turn into markup, but inline code spans stay literal. */
const inline = (value: string) =>
  value
    .split(/(`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("");

/** Escape the characters that would break Markdown, and the escape character itself, then collapse newlines. */
function markdownEscape(value: string, characters: RegExp): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(characters, (character) => `\\${character}`)
    .replace(/\s*\n\s*/g, " ");
}

/** A code span: no pipes or newlines, but keep `<` literal, because entities inside code do not decode. */
const cell = (value: string) => markdownEscape(value, /\|/g);

/** A prose table cell: escaped for both the table and Markdown. */
const proseCell = (value: string) => inline(cell(value));

/** A link label: no square brackets that would end the label early. */
const linkLabel = (value: string) => inline(markdownEscape(value, /[[\]|]/g));

/** JSON for a `<script>` element: `<` is escaped so the data can never close the element. */
const scriptJson = (value: unknown) => JSON.stringify(value, null, 2).replace(/</g, "\\u003c");

/** The runtimes a replacement needs, as one table cell. */
function requirements(requires: NonNullable<RegistryV2Rule["requires"]>): string {
  return (Object.keys(RUNTIME_LABELS) as Array<keyof typeof RUNTIME_LABELS>)
    .filter((runtime) => requires[runtime] !== undefined)
    .map((runtime) => `${RUNTIME_LABELS[runtime]} ${requires[runtime]!} or newer`)
    .join(" and ");
}

/** The page title: the rule's own title (which names the product and version) plus what the page offers. */
export const pageTitle = (rule: RegistryV2Rule) => `${rule.title} — dates, impact, migration`;

/** A short description for search results: the summary, cut at a sentence or word boundary. */
function description(rule: RegistryV2Rule): string {
  const text = rule.summary.replace(/\s+/g, " ").trim();
  if (text.length <= 200) return text;
  const cut = text.slice(0, 200);
  const sentence = cut.lastIndexOf(". ");
  return sentence > 80 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

function detectorsFor(ecosystem: string): string[] {
  return getCapabilityManifest().ecosystems.find((entry) => entry.id === ecosystem)?.detectorIds.slice().sort() ?? [];
}

/** schema.org metadata for a rule page, so search engines and agents can read it as data. */
function jsonLd(rule: RegistryV2Rule, url: string): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": url,
    url,
    mainEntityOfPage: url,
    headline: pageTitle(rule),
    description: description(rule),
    inLanguage: "en",
    dateModified: rule.provenance.reviewedAt,
    keywords: [rule.event, rule.ecosystem, rule.severity],
    about: { "@type": "Thing", name: rule.title, identifier: rule.purl },
    citation: rule.sources.map((source) => ({ "@type": "CreativeWork", name: source.title, url: source.url })),
    isBasedOn: dataUrl(rule.ecosystem),
    publisher: { "@type": "Organization", name: "Evergreen", url: SITE_URL },
  };
}

export function renderRulePage(rule: RegistryV2Rule, maxReviewAgeDays: number): string {
  const reviewDue = addDays(rule.provenance.reviewedAt, maxReviewAgeDays);
  const lines: string[] = [
    "---",
    `title: ${yaml(pageTitle(rule))}`,
    `description: ${yaml(description(rule))}`,
    `canonical_url: ${yaml(ruleUrl(rule.id))}`,
    `json_twin: ${yaml(ruleDataPath(rule.id))}`,
    "---",
    "",
    `# ${inline(rule.title)}`,
    "",
    inline(rule.summary),
    "",
    `[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>`,
    "",
    "| | |",
    "| --- | --- |",
    `| Status | ${EVENT_LABELS[rule.event]} |`,
    `| Severity | ${rule.severity} |`,
    `| Ecosystem | \`${rule.ecosystem}\` |`,
    `| Component | \`${cell(rule.purl)}\` |`,
    `| Affected versions | \`${cell(rule.vers)}\` |`,
    `| Date from the source | ${rule.deadline ?? "The source gives no day"} |`,
    ...(rule.replacement ? [`| Replacement | ${proseCell(rule.replacement)} |`] : []),
    ...(rule.requires ? [`| Replacement requires | ${proseCell(requirements(rule.requires))} |`] : []),
    `| Evidence last seen | ${rule.provenance.observedAt} |`,
    `| Reviewed | ${rule.provenance.reviewedAt} by ${proseCell(rule.provenance.reviewer)}${rule.provenance.importer ? `, drafted by the \`${rule.provenance.importer}\` importer` : ""} |`,
    `| Review due | ${reviewDue} (${maxReviewAgeDays} days after the last review) |`,
    `| Rule ID | \`${rule.id}\` |`,
    "",
    "## Sources",
    "",
    ...rule.sources.map((source) => `- [${linkLabel(source.title)}](${source.url})${source.accessedAt ? ` (accessed ${source.accessedAt})` : ""}`),
  ];

  if (rule.migration) {
    lines.push("", "## Migration", "", "**Constraints**", "", ...rule.migration.constraints.map((constraint) => `- ${inline(constraint)}`));
    lines.push("", "**Steps**", "", ...rule.migration.steps.map((step, index) => `${index + 1}. **${inline(step.title)}.** ${inline(step.instructions)}`));
    lines.push("", "**Verification**", "", ...rule.migration.verification.map((check) => `- \`${check.command}\`: ${inline(check.purpose)}`));
  }

  const url = ruleUrl(rule.id);
  const detectors = detectorsFor(rule.ecosystem);
  lines.push("", "## Detected by", "");
  if (detectors.length === 0) {
    lines.push(`No built-in detector reads \`${rule.ecosystem}\` declarations yet; the rule is data in the [lifecycle registry](${dataUrl(rule.ecosystem)}).`);
  } else {
    const links = detectors.map((id) => (DETECTOR_PAGES.has(id) ? `[\`${id}\`](../detectors/${id}.md)` : `\`${id}\``));
    lines.push(`The ${links.join(" and ")} detector${detectors.length > 1 ? "s" : ""}. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).`);
  }

  lines.push(
    "",
    "## Data",
    "",
    `This page is generated from [\`registry/${rule.ecosystem}.json\`](${dataUrl(rule.ecosystem)}), rule \`${rule.id}\`, in the \`${REGISTRY_V2_SCHEMA_VERSION}\` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.`,
    "",
    '<script type="application/ld+json">',
    scriptJson(jsonLd(rule, url)),
    "</script>",
    "",
  );
  return lines.join("\n");
}

/** One searchable rule for the public lookup page. Sources are linked from each result. */
export interface LookupRuleEntry {
  id: string;
  title: string;
  summary: string;
  event: RegistryV2Rule["event"];
  severity: RegistryV2Rule["severity"];
  ecosystem: string;
  purl: string;
  vers: string;
  deadline?: string;
  replacement?: string;
  sources: Array<{ title: string; url: string }>;
}

/** Compact rule records for the client-side lookup index, in rule-id order. */
export function lookupEntries(registries: readonly RegistryV2[]): LookupRuleEntry[] {
  const entries: LookupRuleEntry[] = [];
  for (const registry of registries) {
    for (const rule of registry.rules) {
      entries.push({
        id: rule.id,
        title: rule.title,
        summary: rule.summary,
        event: rule.event,
        severity: rule.severity,
        ecosystem: rule.ecosystem,
        purl: rule.purl,
        vers: rule.vers,
        ...(rule.deadline ? { deadline: rule.deadline } : {}),
        ...(rule.replacement ? { replacement: rule.replacement } : {}),
        sources: rule.sources.map((source) => ({ title: source.title, url: source.url })),
      });
    }
  }
  return entries.sort((left, right) => left.id.localeCompare(right.id));
}

/** Static lookup page: the rule index is inlined so the page works offline and makes no requests. */
export function renderLookupPage(registries: readonly RegistryV2[]): string {
  const entries = lookupEntries(registries);
  const data = scriptJson(entries);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lifecycle lookup — Evergreen</title>
    <meta
      name="description"
      content="Type a package or runtime name to see its end-of-life, deprecated, or removed status from Evergreen's reviewed lifecycle rules."
    />
    <link rel="canonical" href="${lookupUrl()}" />
    <style>
${LOOKUP_STYLES}
    </style>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="masthead">
      <p class="kicker"><a href="${SITE_URL}/">Evergreen</a> / Lookup</p>
      <h1>Lifecycle lookup</h1>
      <p class="lede">
        Type a package or runtime name to find its reviewed lifecycle status.
        Results link to each rule's reference page and its authoritative sources.
        This page embeds ${entries.length} rules and makes no network requests after it loads.
      </p>
    </header>
    <main id="main">
      <form class="search" role="search" action="#" method="get">
        <label class="search-label" for="query">Package or runtime</label>
        <input
          id="query"
          name="q"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="for example node, python, alpine, request"
          aria-describedby="status"
        />
      </form>
      <p id="status" class="status" role="status" aria-live="polite">Type a name to search ${entries.length} lifecycle rules.</p>
      <div id="results" class="results" aria-live="polite"></div>
      <noscript>
        <p class="status">
          JavaScript is required to search on this page. You can browse every rule in the
          <a href="rules/">lifecycle reference</a> instead.
        </p>
      </noscript>
    </main>
    <footer class="foot">
      <p>
        Generated from <a href="${REPOSITORY_URL}/tree/main/registry">registry/</a> by
        <a href="${REPOSITORY_URL}/blob/main/tools/build-reference-pages.ts">tools/build-reference-pages.ts</a>.
        Regenerate with <code>npm run build:reference</code>. The same facts are also available from the
        <a href="api/v1/">lifecycle API</a> and the <a href="rules/">rule reference</a>.
      </p>
    </footer>
    <script type="application/json" id="lookup-data">
${data}
    </script>
    <script>
${LOOKUP_SCRIPT}
    </script>
  </body>
</html>
`;
}

const LOOKUP_STYLES = `:root {
  color-scheme: light dark;
  --canvas: #f3ece8;
  --surface: #ffffff;
  --text: #0a0a0c;
  --muted: #4a4548;
  --link: #6f2136;
  --accent: #8f3048;
  --rule: #d4cbc4;
  --focus: #8f3048;
  --badge-surface: #8f3048;
  --badge-text: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --canvas: #121014;
    --surface: #1c191e;
    --text: #f3ece8;
    --muted: #b8afb3;
    --link: #f0a3b4;
    --accent: #f0a3b4;
    --rule: #3a3338;
    --focus: #f0a3b4;
    --badge-surface: #f0a3b4;
    --badge-text: #2b0710;
  }
}

* { box-sizing: border-box; }
html { background: var(--canvas); }
body {
  margin: 0 auto;
  max-width: 46rem;
  padding: 1.5rem clamp(1rem, 4vw, 2.5rem) 3rem;
  background: var(--canvas);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 1rem;
  line-height: 1.55;
}
.skip-link {
  position: absolute;
  left: -100rem;
  top: 0;
  padding: 0.6rem 1rem;
  background: var(--surface);
  color: var(--text);
}
.skip-link:focus { left: 1rem; z-index: 1; }
a {
  color: var(--link);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.18em;
}
a:hover, a:focus-visible { text-decoration-thickness: 2px; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
.masthead { margin-bottom: 1.75rem; }
.kicker {
  margin: 0 0 0.5rem;
  color: var(--muted);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.kicker a { color: inherit; }
h1 {
  margin: 0 0 0.65rem;
  font-size: clamp(1.7rem, 4vw, 2.2rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
}
.lede { margin: 0; color: var(--muted); max-width: 40rem; }
.search { margin: 0 0 0.85rem; }
.search-label {
  display: block;
  margin-bottom: 0.4rem;
  font-weight: 600;
}
#query {
  width: 100%;
  padding: 0.85rem 1rem;
  border: 1px solid var(--rule);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.status { margin: 0 0 1.25rem; color: var(--muted); font-size: 0.95rem; }
.results { display: grid; gap: 0.85rem; }
.result {
  padding: 1rem 1.1rem;
  border: 1px solid var(--rule);
  border-radius: 0.45rem;
  background: var(--surface);
}
.result-title {
  margin: 0 0 0.45rem;
  font-size: 1.05rem;
  line-height: 1.3;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  margin: 0 0 0.55rem;
  color: var(--muted);
  font-size: 0.88rem;
}
.badge {
  display: inline-block;
  padding: 0.1rem 0.45rem;
  border-radius: 0.25rem;
  background: var(--badge-surface);
  color: var(--badge-text);
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.summary { margin: 0 0 0.65rem; }
.sources { margin: 0; padding-left: 1.15rem; }
.sources li { margin: 0.15rem 0; }
.purl, .vers { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.84em; }
.foot {
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-size: 0.9rem;
}
.foot code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}`;

const LOOKUP_SCRIPT = `(function () {
  var EVENT_LABELS = {
    deprecated: "Deprecated",
    "end-of-support": "End of support",
    "end-of-life": "End of life",
    removed: "Removed",
    "scheduled-end-of-life": "Scheduled end of life"
  };
  var dataElement = document.getElementById("lookup-data");
  var queryInput = document.getElementById("query");
  var statusElement = document.getElementById("status");
  var resultsElement = document.getElementById("results");
  var form = document.querySelector("form.search");
  if (!dataElement || !queryInput || !statusElement || !resultsElement || !form) return;

  var rules = JSON.parse(dataElement.textContent || "[]");
  var total = rules.length;

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function haystack(rule) {
    return normalize([
      rule.id,
      rule.title,
      rule.summary,
      rule.event,
      rule.ecosystem,
      rule.purl,
      rule.vers,
      rule.replacement || "",
      rule.deadline || "",
      rule.sources.map(function (source) { return source.title; }).join(" ")
    ].join(" "));
  }

  rules.forEach(function (rule) {
    rule._haystack = haystack(rule);
  });

  function matches(rule, tokens) {
    return tokens.every(function (token) {
      return rule._haystack.indexOf(token) !== -1;
    });
  }

  function text(value) {
    return document.createTextNode(value == null ? "" : String(value));
  }

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function renderResult(rule) {
    var article = el("article", "result");
    var title = el("h2", "result-title");
    var link = el("a");
    link.href = "rules/" + encodeURIComponent(rule.id).replace(/%2E/g, ".") + ".html";
    link.appendChild(text(rule.title));
    title.appendChild(link);
    article.appendChild(title);

    var meta = el("p", "meta");
    var badge = el("span", "badge");
    badge.appendChild(text(EVENT_LABELS[rule.event] || rule.event));
    meta.appendChild(badge);
    meta.appendChild(text(" · " + rule.severity + " · " + rule.ecosystem));
    if (rule.deadline) meta.appendChild(text(" · " + rule.deadline));
    article.appendChild(meta);

    var purl = el("p", "meta");
    var purlCode = el("code", "purl");
    purlCode.appendChild(text(rule.purl));
    purl.appendChild(purlCode);
    purl.appendChild(text(" · "));
    var versCode = el("code", "vers");
    versCode.appendChild(text(rule.vers));
    purl.appendChild(versCode);
    article.appendChild(purl);

    var summary = el("p", "summary");
    summary.appendChild(text(rule.summary));
    article.appendChild(summary);

    if (rule.replacement) {
      var replacement = el("p", "meta");
      replacement.appendChild(text("Replacement: " + rule.replacement));
      article.appendChild(replacement);
    }

    if (rule.sources && rule.sources.length) {
      var sources = el("ul", "sources");
      rule.sources.forEach(function (source) {
        var item = el("li");
        var sourceLink = el("a");
        sourceLink.href = source.url;
        sourceLink.rel = "noopener noreferrer";
        sourceLink.appendChild(text(source.title));
        item.appendChild(sourceLink);
        sources.appendChild(item);
      });
      article.appendChild(sources);
    }

    return article;
  }

  function search(rawQuery) {
    var query = normalize(rawQuery);
    resultsElement.textContent = "";
    if (!query) {
      statusElement.textContent = "Type a name to search " + total + " lifecycle rules.";
      return;
    }
    var tokens = query.split(/\\s+/).filter(Boolean);
    var found = rules.filter(function (rule) { return matches(rule, tokens); });
    if (found.length === 0) {
      statusElement.textContent = "No rules match “" + rawQuery.trim() + "”.";
      return;
    }
    statusElement.textContent = found.length === 1
      ? "1 rule matches."
      : found.length + " rules match.";
    var limit = Math.min(found.length, 50);
    for (var index = 0; index < limit; index += 1) {
      resultsElement.appendChild(renderResult(found[index]));
    }
    if (found.length > limit) {
      var more = el("p", "status");
      more.appendChild(text("Showing the first " + limit + " of " + found.length + " matches. Narrow the query to see the rest."));
      resultsElement.appendChild(more);
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    search(queryInput.value);
  });
  queryInput.addEventListener("input", function () {
    search(queryInput.value);
  });

  var params = new URLSearchParams(window.location.search);
  var initial = params.get("q");
  if (initial) {
    queryInput.value = initial;
    search(initial);
  }
})();`;

export function renderIndex(registries: readonly RegistryV2[]): string {
  const lines = [
    "---",
    'title: "Lifecycle reference — end of life, removed, and deprecated components"',
    'description: "One page per lifecycle rule: status, affected versions, dates, sources, migration, and the detector that reads it."',
    `canonical_url: ${yaml(`${SITE_URL}/rules/`)}`,
    "---",
    "",
    "# Lifecycle reference",
    "",
    "Every lifecycle claim Evergreen makes comes from a reviewed rule with an authoritative source. Each rule has a page with its status, affected versions, dates, sources, and migration steps. These pages are generated from the registry; see [Lifecycle rules](../RULES.md).",
  ];
  for (const registry of registries) {
    lines.push("", `## ${registry.ecosystem}`, "");
    for (const rule of [...registry.rules].sort((left, right) => left.id.localeCompare(right.id))) {
      lines.push(`- [${linkLabel(rule.title)}](${rule.id}.html) — ${EVENT_LABELS[rule.event].toLowerCase()}, \`${rule.id}\``);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function renderSitemap(registries: readonly RegistryV2[]): string {
  const entries: Array<{ loc: string; lastmod?: string }> = [
    { loc: `${SITE_URL}/` },
    { loc: lookupUrl() },
    { loc: `${SITE_URL}/rules/` },
  ];
  for (const registry of registries) {
    for (const rule of registry.rules) entries.push({ loc: ruleUrl(rule.id), lastmod: rule.provenance.reviewedAt });
  }
  entries.sort((left, right) => left.loc.localeCompare(right.loc));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) => `  <url><loc>${entry.loc}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}</url>`),
    "</urlset>",
    "",
  ].join("\n");
}

/** The v2 registries in `registry/`, in ecosystem order. Other JSON files there are not rule registries. */
export async function loadRegistries(directory = "registry"): Promise<RegistryV2[]> {
  const registries: RegistryV2[] = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
    const value = JSON.parse(await readFile(join(directory, name), "utf8")) as { schemaVersion?: string };
    if (value.schemaVersion === REGISTRY_V2_SCHEMA_VERSION) registries.push(validateRegistryV2(value));
  }
  return registries.sort((left, right) => left.ecosystem.localeCompare(right.ecosystem));
}

export function buildFiles(registries: readonly RegistryV2[]): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: LOOKUP_PAGE, contents: renderLookupPage(registries) },
    { path: `${RULES_DIRECTORY}/index.md`, contents: renderIndex(registries) },
    { path: "docs/sitemap.xml", contents: renderSitemap(registries) },
  ];
  const seen = new Set<string>();
  for (const registry of registries) {
    const days = registry.freshness?.maxReviewAgeDays ?? DEFAULT_MAX_REVIEW_AGE_DAYS;
    for (const rule of registry.rules) {
      if (seen.has(rule.id)) throw new Error(`Rule id "${rule.id}" appears in more than one registry.`);
      seen.add(rule.id);
      files.push({ path: `${RULES_DIRECTORY}/${rule.id}.md`, contents: renderRulePage(rule, days) });
      files.push({ path: `${RULES_DIRECTORY}/${rule.id}.json`, contents: renderRuleData(rule) });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/** Files that differ from `files`, and generated pages that no rule produces any more. */
export async function drift(files: readonly GeneratedFile[], root = "."): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const actual = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
    if (actual === undefined) problems.push(`missing: ${file.path}`);
    else if (actual !== file.contents) problems.push(`differs: ${file.path}`);
  }
  const expected = new Set(files.map((file) => file.path));
  for (const name of await readdir(resolve(root, RULES_DIRECTORY)).catch(() => [] as string[])) {
    const path = `${RULES_DIRECTORY}/${name}`;
    if ((name.endsWith(".md") || name.endsWith(".json")) && !expected.has(path)) problems.push(`stale: ${path}`);
  }
  return problems.sort();
}

export async function write(files: readonly GeneratedFile[], root = "."): Promise<void> {
  const expected = new Set(files.map((file) => file.path));
  await mkdir(resolve(root, RULES_DIRECTORY), { recursive: true });
  for (const name of await readdir(resolve(root, RULES_DIRECTORY))) {
    if ((name.endsWith(".md") || name.endsWith(".json")) && !expected.has(`${RULES_DIRECTORY}/${name}`)) await rm(resolve(root, RULES_DIRECTORY, name));
  }
  for (const file of files) await writeFile(resolve(root, file.path), file.contents);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const files = buildFiles(await loadRegistries());
  if (argv.includes("--check")) {
    const problems = await drift(files);
    if (problems.length === 0) return 0;
    console.error(`The reference pages are out of date with registry/ (${problems.length} files). Run \`npm run build:reference\` and commit the result:`);
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
    return 1;
  }
  await write(files);
  console.log(`Wrote ${files.length} files in docs/lookup.html, docs/rules/, and docs/sitemap.xml.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
