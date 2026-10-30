// Generates "Is <Product> end of life?" pages from registry/*.json.
//
//   node dist/tools/build-answer-pages.js [--check]
//
// Output: docs/eol/<slug>.md and docs/eol/index.md. With --check nothing is written: the command exits 1
// and names every file that differs from what the registry would produce, including a docs/eol page that
// no longer belongs to a selected product. It reads registry/*.json only and never uses the network.
//
// Selection (exactly ANSWER_PAGE_LIMIT products):
// 1. Curated priority list (PRIORITY_PRODUCTS), in that order. These are well-known "is X end of life?"
//    queries whose Package URL is present in the registry: Node.js, Python, PHP, Ruby, Java, Go, .NET,
//    PostgreSQL, MySQL, Redis, Ubuntu, Debian, Alpine, Django, Rails, Next.js, Angular, Terraform, Deno,
//    Bun, Elixir, Laravel, Spring Boot, PowerShell, AKS, GKE, EKS, and other widely searched runtimes,
//    frameworks, and images. A listed Package URL with no rule is skipped.
// 2. Fill any remaining slots by the number of end-of-life, end-of-support, and scheduled-end-of-life
//    rules (descending), then by version-less Package URL (ascending).
//
// Rules are grouped by version-less Package URL: version, qualifiers, and subpath removed via purlIdentity.
// Slugs are stable: no namespace → name (pkg:generic/nodejs → nodejs, pkg:pypi/django → django); the Docker
// Official Library namespace is dropped (pkg:docker/library/node → docker-node); otherwise type, namespace,
// and name, with a leading @ removed (pkg:npm/@angular/core → npm-angular-core). Any other character
// outside [a-z0-9] becomes a single hyphen.
//
// build-reference-pages.ts imports answerPageEntries from this file for the sitemap. Imports of that
// module are used only inside functions so the cycle stays safe to load.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { RegistryV2, RegistryV2Rule } from "../src/registry.js";
import { purlIdentity, parsePurl } from "../src/purl.js";
import { SITE_URL, loadRegistries } from "./build-reference-pages.js";
import type { GeneratedFile } from "./build-reference-pages.js";

export const ANSWER_PAGE_LIMIT = 50;
export const EOL_DIRECTORY = "docs/eol";

/**
 * Curated products in selection order. `name` is the subject of "Is <name> end of life?".
 * Package URLs are the readable form; matching uses purlIdentity.
 */
export const PRIORITY_PRODUCTS: readonly { readonly purl: string; readonly name: string }[] = [
  { purl: "pkg:generic/nodejs", name: "Node.js" },
  { purl: "pkg:generic/python", name: "Python" },
  { purl: "pkg:generic/php", name: "PHP" },
  { purl: "pkg:generic/ruby", name: "Ruby" },
  { purl: "pkg:generic/java", name: "Java" },
  { purl: "pkg:generic/golang", name: "Go" },
  { purl: "pkg:generic/dotnet", name: ".NET" },
  { purl: "pkg:generic/postgresql", name: "PostgreSQL" },
  { purl: "pkg:generic/mysql", name: "MySQL" },
  { purl: "pkg:generic/redis", name: "Redis" },
  { purl: "pkg:docker/library/ubuntu", name: "Ubuntu" },
  { purl: "pkg:docker/library/debian", name: "Debian" },
  { purl: "pkg:docker/library/alpine", name: "Alpine Linux" },
  { purl: "pkg:pypi/django", name: "Django" },
  { purl: "pkg:gem/rails", name: "Rails" },
  { purl: "pkg:npm/next", name: "Next.js" },
  { purl: "pkg:npm/@angular/core", name: "Angular" },
  { purl: "pkg:generic/terraform", name: "Terraform" },
  { purl: "pkg:generic/deno", name: "Deno" },
  { purl: "pkg:generic/bun", name: "Bun" },
  { purl: "pkg:generic/elixir", name: "Elixir" },
  { purl: "pkg:composer/laravel/framework", name: "Laravel" },
  { purl: "pkg:maven/org.springframework.boot/spring-boot", name: "Spring Boot" },
  { purl: "pkg:generic/powershell", name: "PowerShell" },
  { purl: "pkg:generic/azure-kubernetes-service", name: "Azure Kubernetes Service" },
  { purl: "pkg:generic/google-kubernetes-engine", name: "Google Kubernetes Engine" },
  { purl: "pkg:generic/amazon-eks", name: "Amazon EKS" },
  { purl: "pkg:generic/rust", name: "Rust" },
  { purl: "pkg:generic/dart", name: "Dart" },
  { purl: "pkg:generic/scala", name: "Scala" },
  { purl: "pkg:generic/erlang", name: "Erlang" },
  { purl: "pkg:npm/vue", name: "Vue" },
  { purl: "pkg:npm/react-native", name: "React Native" },
  { purl: "pkg:npm/node-sass", name: "Node Sass" },
  { purl: "pkg:docker/library/node", name: "Node.js Docker image" },
  { purl: "pkg:docker/library/python", name: "Python Docker image" },
  { purl: "pkg:docker/library/postgres", name: "PostgreSQL Docker image" },
  { purl: "pkg:docker/library/mysql", name: "MySQL Docker image" },
  { purl: "pkg:docker/library/redis", name: "Redis Docker image" },
  { purl: "pkg:docker/library/golang", name: "Go Docker image" },
  { purl: "pkg:docker/library/ruby", name: "Ruby Docker image" },
  { purl: "pkg:generic/xcode", name: "Xcode" },
  { purl: "pkg:generic/ios", name: "iOS" },
  { purl: "pkg:docker/library/mariadb", name: "MariaDB" },
  { purl: "pkg:docker/library/traefik", name: "Traefik" },
  { purl: "pkg:docker/library/drupal", name: "Drupal" },
  { purl: "pkg:docker/library/caddy", name: "Caddy" },
  { purl: "pkg:maven/com.android.billingclient/billing", name: "Google Play Billing" },
  { purl: "pkg:generic/google-cloud-sql-postgresql", name: "Cloud SQL for PostgreSQL" },
  { purl: "pkg:docker/library/clickhouse", name: "ClickHouse" },
];

/**
 * Registry rules store scoped npm names encoded (`pkg:npm/%40angular/core`). The readable form
 * (`pkg:npm/@angular/core`) uses the same identity: a raw `@` would otherwise be read as the version.
 */
function canonicalPurl(value: string): string {
  return purlIdentity(value.replaceAll("/@", "/%40"));
}

const PRODUCT_NAMES = new Map(PRIORITY_PRODUCTS.map((product) => [canonicalPurl(product.purl), product.name]));

const LIFECYCLE_COUNT_EVENTS = new Set<RegistryV2Rule["event"]>(["end-of-life", "end-of-support", "scheduled-end-of-life"]);

const EVENT_LABELS: Record<RegistryV2Rule["event"], string> = {
  deprecated: "Deprecated",
  "end-of-support": "End of support",
  "end-of-life": "End of life",
  removed: "Removed",
  "scheduled-end-of-life": "Scheduled end of life",
};

const EVENT_RANK: Record<RegistryV2Rule["event"], number> = {
  "end-of-life": 0,
  removed: 1,
  "end-of-support": 2,
  "scheduled-end-of-life": 3,
  deprecated: 4,
};

export interface AnswerProduct {
  /** Version-less canonical Package URL. */
  purl: string;
  slug: string;
  /** Human name used in "Is <name> end of life?". */
  name: string;
  rules: readonly RegistryV2Rule[];
}

export interface AnswerPageEntry {
  purl: string;
  slug: string;
  name: string;
  loc: string;
  /** Latest `provenance.reviewedAt` among the product's rules. */
  lastmod: string;
}

export const answerIndexUrl = () => `${SITE_URL}/eol/`;
export const answerUrl = (slug: string) => `${SITE_URL}/eol/${slug}.html`;

const yaml = (value: string) => JSON.stringify(value);

const inline = (value: string) =>
  value
    .split(/(`[^`\n]*`)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")))
    .join("");

function markdownEscape(value: string, characters: RegExp): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(characters, (character) => `\\${character}`)
    .replace(/\s*\n\s*/g, " ");
}

const cell = (value: string) => markdownEscape(value, /\|/g);
const linkLabel = (value: string) => inline(markdownEscape(value, /[[\]|]/g));
const scriptJson = (value: unknown) => JSON.stringify(value, null, 2).replace(/</g, "\\u003c");

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Stable page slug for a Package URL. See the file header for the mapping. */
export function productSlug(purl: string): string {
  const parsed = parsePurl(canonicalPurl(purl));
  const name = slugPart(parsed.name);
  if (!parsed.namespace) return name;
  if (parsed.type === "docker" && parsed.namespace === "library") return `docker-${name}`;
  const namespace = parsed.namespace.replace(/^@/, "");
  return [parsed.type, ...namespace.split("/").map(slugPart), name].filter((part) => part.length > 0).join("-");
}

function humanize(name: string): string {
  return name
    .split(/[-_.]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function productName(purl: string): string {
  return PRODUCT_NAMES.get(purl) ?? humanize(parsePurl(purl).name);
}

function lifecycleCount(rules: readonly RegistryV2Rule[]): number {
  return rules.filter((rule) => LIFECYCLE_COUNT_EVENTS.has(rule.event)).length;
}

/** Latest deadline first; a missing day sorts last; then rule id. */
function compareByDeadline(left: RegistryV2Rule, right: RegistryV2Rule): number {
  const byDate = (right.deadline ?? "").localeCompare(left.deadline ?? "");
  if (byDate !== 0) return byDate;
  return left.id.localeCompare(right.id);
}

/** End-of-life rows first, then the latest dated rule in that status, then rule id. */
function compareRules(left: RegistryV2Rule, right: RegistryV2Rule): number {
  const byEvent = EVENT_RANK[left.event] - EVENT_RANK[right.event];
  if (byEvent !== 0) return byEvent;
  return compareByDeadline(left, right);
}

function groupByPurl(registries: readonly RegistryV2[]): Map<string, RegistryV2Rule[]> {
  const groups = new Map<string, RegistryV2Rule[]>();
  for (const registry of registries) {
    for (const rule of registry.rules) {
      const purl = canonicalPurl(rule.purl);
      const existing = groups.get(purl);
      if (existing) existing.push(rule);
      else groups.set(purl, [rule]);
    }
  }
  for (const rules of groups.values()) rules.sort(compareRules);
  return groups;
}

function toProduct(purl: string, rules: readonly RegistryV2Rule[]): AnswerProduct {
  return { purl, slug: productSlug(purl), name: productName(purl), rules };
}

/**
 * The products that get an answer page: the curated list first, then the lifecycle-count fill.
 * `limit` defaults to ANSWER_PAGE_LIMIT.
 */
export function selectProducts(registries: readonly RegistryV2[], limit = ANSWER_PAGE_LIMIT): AnswerProduct[] {
  const groups = groupByPurl(registries);
  const selected: AnswerProduct[] = [];
  const seen = new Set<string>();
  const priority = PRIORITY_PRODUCTS.map((product) => canonicalPurl(product.purl));
  if (new Set(priority).size !== priority.length) throw new Error("PRIORITY_PRODUCTS has a duplicate Package URL.");

  for (const purl of priority) {
    if (selected.length >= limit) break;
    const rules = groups.get(purl);
    if (!rules || seen.has(purl)) continue;
    selected.push(toProduct(purl, rules));
    seen.add(purl);
  }

  const rest = [...groups.entries()]
    .filter(([purl]) => !seen.has(purl))
    .sort((left, right) => {
      const byCount = lifecycleCount(right[1]) - lifecycleCount(left[1]);
      if (byCount !== 0) return byCount;
      return left[0].localeCompare(right[0]);
    });
  for (const [purl, rules] of rest) {
    if (selected.length >= limit) break;
    selected.push(toProduct(purl, rules));
  }

  const slugs = new Set<string>();
  for (const product of selected) {
    if (slugs.has(product.slug)) throw new Error(`Answer-page slug "${product.slug}" is used by more than one product.`);
    slugs.add(product.slug);
  }
  return selected;
}

function latestReview(rules: readonly RegistryV2Rule[]): string {
  const latest = rules.map((rule) => rule.provenance.reviewedAt).sort().at(-1);
  if (latest === undefined) throw new Error("A product page needs at least one rule.");
  return latest;
}

/** Sitemap records for the selected answer pages, in selection order. */
export function answerPageEntries(registries: readonly RegistryV2[]): AnswerPageEntry[] {
  return selectProducts(registries).map((product) => ({
    purl: product.purl,
    slug: product.slug,
    name: product.name,
    loc: answerUrl(product.slug),
    lastmod: latestReview(product.rules),
  }));
}

function featuredSentence(rule: RegistryV2Rule): string {
  const title = rule.title.replace(/[. ]+$/u, "");
  if (rule.deadline && !rule.title.includes(rule.deadline)) return `${title} as of ${rule.deadline}.`;
  if (!rule.deadline) return `${title}. The source gives no day.`;
  return `${title}.`;
}

interface AnswerParts {
  direct: string;
  detail: string;
  closingPlain: string;
  closingMarkdown: string;
}

function answerParts(product: AnswerProduct): AnswerParts {
  const groups: Array<{ events: readonly RegistryV2Rule["event"][]; text: string }> = [
    { events: ["end-of-life", "removed"], text: `Some ${product.name} releases are end of life.` },
    { events: ["end-of-support"], text: `${product.name} has releases that are out of support.` },
    { events: ["scheduled-end-of-life"], text: `${product.name} has a scheduled end of life.` },
  ];
  let matched: readonly RegistryV2Rule[] | undefined;
  let direct = `${product.name} is not recorded as end of life.`;
  for (const group of groups) {
    const rules = product.rules.filter((rule) => group.events.includes(rule.event));
    if (rules.length > 0) {
      matched = rules;
      direct = group.text;
      break;
    }
  }
  const pool = matched ?? product.rules;
  const featured = [...pool].sort(compareByDeadline)[0];
  if (featured === undefined) throw new Error(`Product ${product.purl} has no rules.`);
  const ruleWord = product.rules.length === 1 ? "rule" : "rules";
  const closing = `This page lists ${product.rules.length} reviewed lifecycle ${ruleWord} for`;
  return {
    direct,
    detail: featuredSentence(featured),
    closingPlain: `${closing} ${product.purl}, with the status, date, and source for each.`,
    closingMarkdown: `${closing} \`${product.purl}\`, with the status, date, and source for each.`,
  };
}

/** The first paragraph: a direct answer, the latest matching rule, and what the table contains. */
export function answerLead(product: AnswerProduct): string {
  const parts = answerParts(product);
  return `**${inline(parts.direct)}** ${inline(parts.detail)} ${inline(parts.closingMarkdown)}`;
}

function plainAnswer(product: AnswerProduct): string {
  const parts = answerParts(product);
  return `${parts.direct} ${parts.detail} ${parts.closingPlain}`;
}

function shorten(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 200) return normalized;
  const cut = normalized.slice(0, 200);
  const sentence = cut.lastIndexOf(". ");
  return sentence > 80 ? cut.slice(0, sentence + 1) : `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
}

export const pageTitle = (product: AnswerProduct) => `Is ${product.name} end of life? — versions, dates, sources`;

function faqMainEntity(product: AnswerProduct): Array<{
  "@type": "Question";
  name: string;
  acceptedAnswer: { "@type": "Answer"; text: string };
}> {
  return [
    {
      "@type": "Question",
      name: `Is ${product.name} end of life?`,
      acceptedAnswer: { "@type": "Answer", text: plainAnswer(product) },
    },
    {
      "@type": "Question",
      name: `How do I check ${product.name}?`,
      acceptedAnswer: { "@type": "Answer", text: `Run evergreen check ${product.purl}.` },
    },
    {
      "@type": "Question",
      name: `Where do the ${product.name} dates come from?`,
      acceptedAnswer: {
        "@type": "Answer",
        text: "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry.",
      },
    },
  ];
}

function jsonLd(product: AnswerProduct): unknown {
  const url = answerUrl(product.slug);
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url,
    mainEntity: faqMainEntity(product),
  };
}

function sourceLinks(rule: RegistryV2Rule): string {
  if (rule.sources.length === 0) return "The rule names no source";
  return rule.sources.map((source) => `[${linkLabel(source.title)}](${source.url})`).join(", ");
}

/** One product page: the answer, every rule, a check command, and FAQPage structured data. */
export function renderAnswerPage(product: AnswerProduct): string {
  const lines = [
    "---",
    `title: ${yaml(pageTitle(product))}`,
    `description: ${yaml(shorten(plainAnswer(product)))}`,
    `canonical_url: ${yaml(answerUrl(product.slug))}`,
    "---",
    "",
    `# Is ${inline(product.name)} end of life?`,
    "",
    answerLead(product),
    "",
    "Check a version:",
    "",
    "```bash",
    `evergreen check ${product.purl}`,
    "```",
    "",
    "[All product answers](index.html)",
    "",
    "| Rule | Status | Date | Affected versions | Sources |",
    "| --- | --- | --- | --- | --- |",
    ...product.rules.map(
      (rule) =>
        `| [${linkLabel(rule.title)}](../rules/${rule.id}.html) | ${EVENT_LABELS[rule.event]} | ${rule.deadline ?? "The source gives no day"} | \`${cell(rule.vers)}\` | ${sourceLinks(rule)} |`,
    ),
    "",
    "## Data",
    "",
    "This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.",
    "",
    '<script type="application/ld+json">',
    scriptJson(jsonLd(product)),
    "</script>",
    "",
  ];
  return lines.join("\n");
}

function renderIndex(products: readonly AnswerProduct[]): string {
  const lines = [
    "---",
    `title: ${yaml("Is it end of life? — versions, dates, sources")}`,
    `description: ${yaml(`Answers to “Is it end of life?” for ${products.length} products, generated from Evergreen's reviewed lifecycle rules: versions, dates, and sources.`)}`,
    `canonical_url: ${yaml(answerIndexUrl())}`,
    "---",
    "",
    "# Is it end of life?",
    "",
    `These ${products.length} pages answer “Is it end of life?” for products people search for. Each page lists every reviewed lifecycle rule for that Package URL: status, date, affected versions, and sources. The pages are generated from the lifecycle registry (\`registry/\`), not written by hand.`,
    "",
    ...products.map((product) => `- [Is ${linkLabel(product.name)} end of life?](${product.slug}.html) — \`${product.purl}\`, ${product.rules.length} ${product.rules.length === 1 ? "rule" : "rules"}`),
    "",
    "Regenerate this index with `npm run build:answer-pages`.",
    "",
  ];
  return lines.join("\n");
}

export function buildFiles(registries: readonly RegistryV2[]): GeneratedFile[] {
  const products = selectProducts(registries);
  const files: GeneratedFile[] = [
    { path: `${EOL_DIRECTORY}/index.md`, contents: renderIndex(products) },
    ...products.map((product) => ({ path: `${EOL_DIRECTORY}/${product.slug}.md`, contents: renderAnswerPage(product) })),
  ];
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

/** Files that differ from `files`, and docs/eol pages that no selected product produces any more. */
export async function drift(files: readonly GeneratedFile[], root = "."): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const actual = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
    if (actual === undefined) problems.push(`missing: ${file.path}`);
    else if (actual !== file.contents) problems.push(`differs: ${file.path}`);
  }
  const expected = new Set(files.map((file) => file.path));
  for (const name of await readdir(resolve(root, EOL_DIRECTORY)).catch(() => [] as string[])) {
    const path = `${EOL_DIRECTORY}/${name}`;
    if (name.endsWith(".md") && !expected.has(path)) problems.push(`stale: ${path}`);
  }
  return problems.sort();
}

export async function write(files: readonly GeneratedFile[], root = "."): Promise<void> {
  const directory = resolve(root, EOL_DIRECTORY);
  await mkdir(directory, { recursive: true });
  const expected = new Set(files.map((file) => file.path));
  for (const name of await readdir(directory)) {
    if (name.endsWith(".md") && !expected.has(`${EOL_DIRECTORY}/${name}`)) await rm(resolve(directory, name));
  }
  for (const file of files) await writeFile(resolve(root, file.path), file.contents);
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const files = buildFiles(await loadRegistries());
  if (argv.includes("--check")) {
    const problems = await drift(files);
    if (problems.length === 0) return 0;
    console.error(`The answer pages are out of date with registry/ (${problems.length} files). Run \`npm run build:answer-pages\` and commit the result:`);
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
    return 1;
  }
  await write(files);
  console.log(`Wrote ${files.length} files in docs/eol/.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
