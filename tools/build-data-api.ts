// Generates the static lifecycle API under docs/api/v1/ from registry/*.json.
//
//   node dist/tools/build-data-api.js [--check] [--root DIR]
//
// Output: index.json, products/<id>.json (one per PURL identity), and recent.json (the rules with the
// newest review dates). Every document is validated against schemas/api-product.v1.schema.json before it is
// written. Paths and object keys are sorted and nothing reads a clock, so the same registry files always
// produce the same bytes. With --check nothing is written: the command exits 1 and names every file that
// differs from what the registry would produce. The pages site serves docs/, so the output is published at
// https://arminazimi.github.io/evergreen/api/v1/.

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";

import { parsePurl, purlIdentity } from "../src/purl.js";
import type { PackageUrl } from "../src/purl.js";
import { lifecycleEvents, REGISTRY_V2_SCHEMA_VERSION, validateRegistryV2 } from "../src/registry.js";
import type { LifecycleEvent, RegistryV2, RegistryV2Rule } from "../src/registry.js";

export const API_DIRECTORY = "docs/api/v1";
export const PRODUCTS_DIRECTORY = `${API_DIRECTORY}/products`;
export const INDEX_SCHEMA_VERSION = "evergreen.api-index.v1" as const;
export const PRODUCT_SCHEMA_VERSION = "evergreen.api-product.v1" as const;
export const RECENT_SCHEMA_VERSION = "evergreen.api-recent.v1" as const;
/** The recent-changes file carries the rules with the newest review dates, at most this many. */
export const RECENT_LIMIT = 100;

export interface GeneratedFile {
  /** Repository-relative path. */
  path: string;
  contents: string;
}

export interface ApiDocumentFile {
  path: string;
  document: ApiDocument;
}

export interface ApiIndexEntry {
  id: string;
  purl: string;
  type: string;
  namespace?: string;
  name: string;
  ecosystems: string[];
  events: LifecycleEvent[];
  earliestDeadline?: string;
  latestReview: string;
  rules: number;
  path: string;
}

export interface ApiIndex {
  schemaVersion: typeof INDEX_SCHEMA_VERSION;
  products: ApiIndexEntry[];
  recent: string;
  rules: number;
  latestReview: string;
}

export interface ApiProduct {
  schemaVersion: typeof PRODUCT_SCHEMA_VERSION;
  id: string;
  purl: string;
  type: string;
  namespace?: string;
  name: string;
  ecosystems: string[];
  events: LifecycleEvent[];
  earliestDeadline?: string;
  latestReview: string;
  rules: RegistryV2Rule[];
}

export interface ApiChange {
  ruleId: string;
  productId: string;
  path: string;
  purl: string;
  ecosystem: string;
  event: LifecycleEvent;
  severity: RegistryV2Rule["severity"];
  title: string;
  deadline?: string;
  reviewedAt: string;
  observedAt: string;
}

export interface ApiRecent {
  schemaVersion: typeof RECENT_SCHEMA_VERSION;
  changes: ApiChange[];
}

export type ApiDocument = ApiIndex | ApiProduct | ApiRecent;

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Sorts object keys at every level, so a reformatted registry still gives identical bytes. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compare(left, right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

export const renderDocument = (document: unknown): string => `${JSON.stringify(canonical(document), null, 2)}\n`;

/** A stable, file-name-safe id for one PURL identity: pkg:npm/%40angular/core becomes npm-angular-core. */
export function productId(purl: string): string {
  return idFor(parsePurl(purl));
}

function idFor(purl: PackageUrl): string {
  const parts = [purl.type, ...(purl.namespace ? purl.namespace.split("/") : []), purl.name];
  return parts.join("-").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

/** The v2 registries in `directory`, in ecosystem order. Other JSON files there are not rule registries. */
export async function loadRegistries(directory = "registry"): Promise<RegistryV2[]> {
  const registries: RegistryV2[] = [];
  for (const name of (await readdir(directory)).filter((file) => file.endsWith(".json")).sort()) {
    const value = JSON.parse(await readFile(join(directory, name), "utf8")) as { schemaVersion?: string };
    if (value.schemaVersion === REGISTRY_V2_SCHEMA_VERSION) registries.push(validateRegistryV2(value));
  }
  return registries.sort((left, right) => compare(left.ecosystem, right.ecosystem));
}

const latest = (dates: readonly string[]): string => dates.reduce((newest, date) => (date > newest ? date : newest));
const earliest = (dates: readonly string[]): string | undefined =>
  dates.length === 0 ? undefined : dates.reduce((oldest, date) => (date < oldest ? date : oldest));

interface ProductGroup {
  id: string;
  purl: string;
  parsed: PackageUrl;
  rules: RegistryV2Rule[];
}

export function buildDocuments(registries: readonly RegistryV2[]): ApiDocumentFile[] {
  const groups = new Map<string, ProductGroup>();
  const purlById = new Map<string, string>();
  const ruleIds = new Set<string>();

  for (const registry of registries) {
    for (const rule of registry.rules) {
      if (ruleIds.has(rule.id)) throw new Error(`Rule id "${rule.id}" appears in more than one registry.`);
      ruleIds.add(rule.id);
      const purl = purlIdentity(rule.purl);
      const parsed = parsePurl(purl);
      const id = idFor(parsed);
      const existing = purlById.get(id);
      if (existing !== undefined && existing !== purl) {
        throw new Error(`Products "${existing}" and "${purl}" both map to id "${id}".`);
      }
      purlById.set(id, purl);
      const group = groups.get(purl) ?? { id, purl, parsed, rules: [] };
      group.rules.push(rule);
      groups.set(purl, group);
    }
  }

  if (groups.size === 0) throw new Error("The registry has no rules, so the API would be empty.");

  const documents: ApiDocumentFile[] = [];
  const indexEntries: ApiIndexEntry[] = [];
  const changes: ApiChange[] = [];

  for (const product of [...groups.values()].sort((left, right) => compare(left.id, right.id))) {
    const rules = [...product.rules].sort((left, right) => compare(left.id, right.id));
    const ecosystems = [...new Set(rules.map((rule) => rule.ecosystem))].sort(compare);
    const events = lifecycleEvents.filter((event) => rules.some((rule) => rule.event === event));
    const deadline = earliest(rules.flatMap((rule) => (rule.deadline === undefined ? [] : [rule.deadline])));
    const latestReview = latest(rules.map((rule) => rule.provenance.reviewedAt));
    const path = `products/${product.id}.json`;

    documents.push({
      path: `${API_DIRECTORY}/${path}`,
      document: {
        schemaVersion: PRODUCT_SCHEMA_VERSION,
        id: product.id,
        purl: product.purl,
        type: product.parsed.type,
        ...(product.parsed.namespace === undefined ? {} : { namespace: product.parsed.namespace }),
        name: product.parsed.name,
        ecosystems,
        events,
        ...(deadline === undefined ? {} : { earliestDeadline: deadline }),
        latestReview,
        rules,
      },
    });
    indexEntries.push({
      id: product.id,
      purl: product.purl,
      type: product.parsed.type,
      ...(product.parsed.namespace === undefined ? {} : { namespace: product.parsed.namespace }),
      name: product.parsed.name,
      ecosystems,
      events,
      ...(deadline === undefined ? {} : { earliestDeadline: deadline }),
      latestReview,
      rules: rules.length,
      path,
    });
    for (const rule of rules) {
      changes.push({
        ruleId: rule.id,
        productId: product.id,
        path,
        purl: product.purl,
        ecosystem: rule.ecosystem,
        event: rule.event,
        severity: rule.severity,
        title: rule.title,
        ...(rule.deadline === undefined ? {} : { deadline: rule.deadline }),
        reviewedAt: rule.provenance.reviewedAt,
        observedAt: rule.provenance.observedAt,
      });
    }
  }

  const latestReview = latest(changes.map((change) => change.reviewedAt));
  documents.push({
    path: `${API_DIRECTORY}/index.json`,
    document: {
      schemaVersion: INDEX_SCHEMA_VERSION,
      products: indexEntries,
      recent: "recent.json",
      rules: ruleIds.size,
      latestReview,
    },
  });

  changes.sort(
    (left, right) =>
      compare(right.reviewedAt, left.reviewedAt) ||
      compare(right.observedAt, left.observedAt) ||
      compare(left.ruleId, right.ruleId),
  );
  documents.push({
    path: `${API_DIRECTORY}/recent.json`,
    document: { schemaVersion: RECENT_SCHEMA_VERSION, changes: changes.slice(0, RECENT_LIMIT) },
  });

  return documents.sort((left, right) => compare(left.path, right.path));
}

export const renderFiles = (documents: readonly ApiDocumentFile[]): GeneratedFile[] =>
  documents.map(({ path, document }) => ({ path, contents: renderDocument(document) }));

export function buildFiles(registries: readonly RegistryV2[]): GeneratedFile[] {
  return renderFiles(buildDocuments(registries));
}

/** Validates every document against the published schema and the registry rule definition it references. */
export async function validateDocuments(documents: readonly ApiDocumentFile[], root = "."): Promise<void> {
  const apiSchema = JSON.parse(await readFile(resolve(root, "schemas/api-product.v1.schema.json"), "utf8")) as object;
  const registrySchema = JSON.parse(await readFile(resolve(root, "schemas/registry.v2.schema.json"), "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true });
  ajv.addSchema(registrySchema);
  const validate = ajv.compile(apiSchema);
  for (const file of documents) {
    if (!validate(file.document)) {
      throw new Error(`${file.path} does not match schemas/api-product.v1.schema.json: ${ajv.errorsText(validate.errors, { separator: "; " })}`);
    }
  }
}

async function jsonFilesIn(directory: string): Promise<string[]> {
  return (await readdir(directory).catch(() => [] as string[])).filter((name) => name.endsWith(".json")).sort(compare);
}

/** Files that differ from `files`, and generated files that the registry no longer produces. */
export async function drift(files: readonly GeneratedFile[], root = "."): Promise<string[]> {
  const problems: string[] = [];
  for (const file of files) {
    const actual = await readFile(resolve(root, file.path), "utf8").catch(() => undefined);
    if (actual === undefined) problems.push(`missing: ${file.path}`);
    else if (actual !== file.contents) problems.push(`differs: ${file.path}`);
  }
  const expected = new Set(files.map((file) => file.path));
  for (const directory of [API_DIRECTORY, PRODUCTS_DIRECTORY]) {
    for (const name of await jsonFilesIn(resolve(root, directory))) {
      const path = `${directory}/${name}`;
      if (!expected.has(path)) problems.push(`stale: ${path}`);
    }
  }
  return problems.sort(compare);
}

export async function write(files: readonly GeneratedFile[], root = "."): Promise<void> {
  const expected = new Set(files.map((file) => file.path));
  for (const directory of [API_DIRECTORY, PRODUCTS_DIRECTORY]) {
    await mkdir(resolve(root, directory), { recursive: true });
    for (const name of await jsonFilesIn(resolve(root, directory))) {
      if (!expected.has(`${directory}/${name}`)) await rm(resolve(root, directory, name));
    }
  }
  for (const file of files) await writeFile(resolve(root, file.path), file.contents);
}

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv: readonly string[] = process.argv.slice(2), cwd = "."): Promise<number> {
  const root = resolve(option(argv, "--root") ?? cwd);
  const documents = buildDocuments(await loadRegistries(resolve(root, "registry")));
  await validateDocuments(documents, root);
  const files = renderFiles(documents);
  if (argv.includes("--check")) {
    const problems = await drift(files, root);
    if (problems.length === 0) return 0;
    console.error(`The static API is out of date with registry/ (${problems.length} files). Run \`npm run build:data-api\` and commit the result:`);
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`);
    if (problems.length > 20) console.error(`  … and ${problems.length - 20} more`);
    return 1;
  }
  await write(files, root);
  console.log(`Wrote ${files.length} files under ${API_DIRECTORY}/.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
