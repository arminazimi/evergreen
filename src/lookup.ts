import type { EvidenceSource, Severity } from "./domain.js";
import { BUNDLED_ECOSYSTEMS } from "./data-bundle.js";
import { loadDataFile } from "./data-source.js";
import { parsePurl } from "./purl.js";
import { validateRegistryV2 } from "./registry.js";
import type { LifecycleEvent, RegistryV2Rule } from "./registry.js";
import { versContains } from "./vers.js";

export const LOOKUP_SCHEMA_VERSION = "evergreen.lookup.v1" as const;

export class LookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LookupError";
  }
}

export interface LookupFinding {
  ruleId: string;
  ecosystem: string;
  event: LifecycleEvent;
  severity: Severity;
  title: string;
  summary: string;
  deadline?: string;
  replacement?: string;
  affectedVersions: string;
  sources: EvidenceSource[];
}

export interface LookupResult {
  schemaVersion: typeof LOOKUP_SCHEMA_VERSION;
  query: { name: string; version?: string };
  product: { id: string; purl: string; name: string; ecosystems: string[] };
  version?: string;
  status: LifecycleEvent | "supported";
  deadline?: string;
  replacement?: string;
  findings: LookupFinding[];
}

/** Common names people type that differ from the package URL or product id. */
const ALIASES: Record<string, string> = {
  node: "nodejs",
  "node-js": "nodejs",
  nodejs: "nodejs",
  go: "golang",
  golang: "golang",
  py: "python",
  python3: "python",
  net: "dotnet",
  dotnet: "dotnet",
  k8s: "kubernetes",
  postgres: "postgresql",
  psql: "postgresql",
  mongo: "mongodb",
  "ruby-on-rails": "rails",
};

const statusPrecedence: readonly LifecycleEvent[] = ["end-of-life", "removed", "end-of-support", "deprecated", "scheduled-end-of-life"];

let loadedRules: Promise<RegistryV2Rule[]> | undefined;

/** Every bundled rule, not only the ecosystems `check` resolves: the lookup takes a human name, not a PURL. */
function allRules(): Promise<RegistryV2Rule[]> {
  loadedRules ??= (async () => {
    const rules: RegistryV2Rule[] = [];
    for (const ecosystem of BUNDLED_ECOSYSTEMS) {
      rules.push(...validateRegistryV2(await loadDataFile(`registry/${ecosystem}.json`)).rules);
    }
    return rules;
  })();
  return loadedRules;
}

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

interface Product {
  id: string;
  purl: string;
  name: string;
  ecosystems: string[];
  aliases: Set<string>;
  rules: RegistryV2Rule[];
}

function productId(purl: string): string {
  const parsed = parsePurl(purl);
  const parts = [parsed.type, ...(parsed.namespace ? parsed.namespace.split("/") : []), parsed.name];
  return parts.join("-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

/** A rule with only symbol matchers describes an API inside a product, not the product's own lifecycle. */
const isProductRule = (rule: RegistryV2Rule): boolean => rule.usage === undefined || rule.usage.some((matcher) => matcher.kind !== "symbol");

function productsOf(rules: readonly RegistryV2Rule[]): Product[] {
  const products = new Map<string, Product>();
  for (const rule of rules) {
    let product = products.get(rule.purl);
    if (!product) {
      const parsed = parsePurl(rule.purl);
      product = { id: productId(rule.purl), purl: rule.purl, name: parsed.name, ecosystems: [], aliases: new Set(), rules: [] };
      for (const alias of [product.id, parsed.name, ...(parsed.namespace ? parsed.namespace.split("/") : [])]) {
        const normalized = normalize(alias);
        if (normalized !== "") product.aliases.add(normalized);
      }
      products.set(rule.purl, product);
    }
    product.rules.push(rule);
    if (!product.ecosystems.includes(rule.ecosystem)) product.ecosystems.push(rule.ecosystem);
  }
  for (const product of products.values()) product.ecosystems.sort();
  return [...products.values()].sort((left, right) => left.purl.localeCompare(right.purl));
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length]!;
}

function nearestProduct(query: string, products: readonly Product[]): Array<{ product: Product; distance: number }> {
  return products
    .map((product) => ({ product, distance: Math.min(...[...product.aliases].map((alias) => editDistance(query, alias))) }))
    .sort((left, right) => left.distance - right.distance || left.product.id.localeCompare(right.product.id));
}

function resolveProduct(name: string, products: readonly Product[]): Product {
  const query = ALIASES[normalize(name)] ?? normalize(name);
  const matches = products.filter((product) => product.aliases.has(query));
  if (matches.length === 0) {
    const suggestions = [...new Set(nearestProduct(query, products).slice(0, 3).map(({ product }) => product.name))];
    throw new LookupError(`Unknown product "${name}". Did you mean ${suggestions.map((id) => `"${id}"`).join(", ")}?`);
  }
  if (matches.length === 1) return matches[0]!;
  const named = matches.filter((product) => normalize(product.name) === query);
  const candidates = named.length > 0 ? named : matches;
  return [...candidates].sort((left, right) => right.rules.length - left.rules.length || left.id.localeCompare(right.id))[0]!;
}

function versionCandidates(version: string): string[] {
  return /^\d+$/.test(version) ? [version, `${version}.0.0`] : [version];
}

function matchesVersion(rule: RegistryV2Rule, version: string): boolean {
  return versionCandidates(version).some((candidate) => {
    try {
      return versContains(rule.vers, candidate);
    } catch {
      return false;
    }
  });
}

const deadlineOrder = (left: LookupFinding, right: LookupFinding): number =>
  (left.deadline === undefined ? 1 : 0) - (right.deadline === undefined ? 1 : 0) ||
  (left.deadline ?? "").localeCompare(right.deadline ?? "") ||
  left.ruleId.localeCompare(right.ruleId);

function toFinding(rule: RegistryV2Rule): LookupFinding {
  return {
    ruleId: rule.id,
    ecosystem: rule.ecosystem,
    event: rule.event,
    severity: rule.severity,
    title: rule.title,
    summary: rule.summary,
    ...(rule.deadline === undefined ? {} : { deadline: rule.deadline }),
    ...(rule.replacement === undefined ? {} : { replacement: rule.replacement }),
    affectedVersions: rule.vers,
    sources: rule.sources,
  };
}

/**
 * Resolves a product name, and optionally a version, against the bundled rules. Names come from the product's
 * package URL, its id, and a small alias table, so `node 18` and `nodejs 18` reach the same rules. No network.
 */
export async function lookupProduct(name: string, version?: string): Promise<LookupResult> {
  const products = productsOf(await allRules());
  const product = resolveProduct(name, products);
  const findings = product.rules
    .filter(isProductRule)
    .filter((rule) => version === undefined || matchesVersion(rule, version))
    .map(toFinding)
    .sort(deadlineOrder);
  const primary = statusPrecedence
    .map((event) => findings.find((finding) => finding.event === event))
    .find((finding) => finding !== undefined);
  const dated = findings.filter((finding) => finding.deadline !== undefined).map((finding) => finding.deadline!);
  return {
    schemaVersion: LOOKUP_SCHEMA_VERSION,
    query: { name, ...(version === undefined ? {} : { version }) },
    product: { id: product.id, purl: product.purl, name: product.name, ecosystems: product.ecosystems },
    ...(version === undefined ? {} : { version }),
    status: primary?.event ?? "supported",
    ...(dated.length === 0 ? {} : { deadline: dated.sort()[0] }),
    ...(primary?.replacement === undefined ? {} : { replacement: primary.replacement }),
    findings,
  };
}

/** Plain text: the verdict first, then each rule with its evidence links. */
export function renderLookupText(result: LookupResult): string {
  const lines = [`${result.product.name}${result.version === undefined ? "" : ` ${result.version}`} — ${result.status}`];
  if (result.deadline !== undefined) lines.push(`Ended: ${result.deadline}`);
  if (result.replacement !== undefined) lines.push(`Replacement: ${result.replacement}`);
  if (result.findings.length === 0) lines.push("No lifecycle rule matches this version.");
  for (const finding of result.findings) {
    lines.push(`- ${finding.event}${finding.deadline === undefined ? "" : ` ${finding.deadline}`}: ${finding.title} (${finding.severity})`);
    for (const source of finding.sources) lines.push(`  ${source.title}: ${source.url}`);
  }
  lines.push(`Product: ${result.product.purl}`);
  return lines.join("\n");
}
