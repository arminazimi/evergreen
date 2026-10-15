// Shows a reviewer exactly what an importer's drafts would change in a registry.
//
//   node dist/tools/importers/diff.js drafts.json registry/nodejs.json [--out diff.json]
//
// Applying a draft means overlaying the fields the importer sets onto the existing rule. Fields an
// importer never sets (migration steps, usage matchers, hand-written text) are left alone, so they are
// never reported as changes. A rule is reported as removed only when this same importer drafted it
// earlier and no longer does; hand-written rules and other importers' rules are never "removed".
// Provenance always differs between a draft and a reviewed rule, so it is not compared.

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

import type { EvidenceSource } from "../../src/domain.js";
import { validateRegistryV2 } from "../../src/registry.js";
import type { RegistryV2, RegistryV2Rule } from "../../src/registry.js";
import { canonicalRule } from "./canonical.js";
import type { DraftRegistry } from "./types.js";

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface SourceChange {
  added: EvidenceSource[];
  removed: EvidenceSource[];
  /** Same URL, different title. */
  retitled: { url: string; before: string; after: string }[];
}

export interface ChangedRule {
  id: string;
  /** Changes to the rule's own dates (`deadline`). */
  dates: FieldChange[];
  /** Changes to the evidence the rule cites; null when the sources are the same. */
  sources: SourceChange | null;
  /** Every other changed field, in registry field order. */
  fields: FieldChange[];
}

export interface DraftDiff {
  importer: string;
  ecosystem: string;
  added: RegistryV2Rule[];
  changed: ChangedRule[];
  /** Rules this importer drafted before that it no longer drafts. */
  removed: RegistryV2Rule[];
  unchanged: string[];
  /**
   * Added drafts that describe the same component and versions as an existing rule with a different id.
   * Accepting both would give one package two rules, so a reviewer should pick one id.
   */
  duplicates: { draft: string; existing: string }[];
}

const DATE_FIELDS = ["deadline"];
const NOT_COMPARED = new Set(["id", "provenance", "sources", ...DATE_FIELDS]);

function sourceChange(before: EvidenceSource[], after: EvidenceSource[]): SourceChange | null {
  const urlsBefore = new Map(before.map((source) => [source.url, source]));
  const urlsAfter = new Map(after.map((source) => [source.url, source]));
  const change: SourceChange = {
    added: after.filter((source) => !urlsBefore.has(source.url)).sort((a, b) => a.url.localeCompare(b.url)),
    removed: before.filter((source) => !urlsAfter.has(source.url)).sort((a, b) => a.url.localeCompare(b.url)),
    retitled: [],
  };
  for (const [url, source] of [...urlsAfter].sort(([a], [b]) => a.localeCompare(b))) {
    const previous = urlsBefore.get(url);
    if (previous && previous.title !== source.title) change.retitled.push({ url, before: previous.title, after: source.title });
  }
  return change.added.length + change.removed.length + change.retitled.length === 0 ? null : change;
}

function ruleChange(existing: RegistryV2Rule, draft: RegistryV2Rule): ChangedRule | null {
  const before = existing as unknown as Record<string, unknown>;
  const after = draft as unknown as Record<string, unknown>;
  const change: ChangedRule = { id: draft.id, dates: [], sources: null, fields: [] };

  for (const field of DATE_FIELDS) {
    if (field in after && !isDeepStrictEqual(before[field], after[field])) change.dates.push({ field, before: before[field] ?? null, after: after[field] });
  }
  change.sources = sourceChange(existing.sources, draft.sources);
  for (const key of Object.keys(canonicalRule(after))) {
    if (NOT_COMPARED.has(key)) continue;
    if (!isDeepStrictEqual(before[key], after[key])) change.fields.push({ field: key, before: before[key] ?? null, after: after[key] });
  }
  return change.dates.length + change.fields.length === 0 && change.sources === null ? null : change;
}

export function diffDrafts(drafts: DraftRegistry, registry: RegistryV2): DraftDiff {
  if (drafts.ecosystem !== registry.ecosystem) {
    throw new Error(`Drafts are for "${drafts.ecosystem}" but the registry is "${registry.ecosystem}".`);
  }
  const existing = new Map(registry.rules.map((rule) => [rule.id, rule]));
  const drafted = new Set(drafts.rules.map((rule) => rule.id));
  const diff: DraftDiff = { importer: drafts.importer, ecosystem: drafts.ecosystem, added: [], changed: [], removed: [], unchanged: [], duplicates: [] };
  const byIdentity = new Map<string, RegistryV2Rule>();
  for (const rule of [...registry.rules].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${rule.purl} ${rule.vers}`;
    if (!byIdentity.has(key)) byIdentity.set(key, rule);
  }

  for (const draft of [...drafts.rules].sort((a, b) => a.id.localeCompare(b.id))) {
    const current = existing.get(draft.id);
    if (!current) {
      diff.added.push(draft);
      const same = byIdentity.get(`${draft.purl} ${draft.vers}`);
      if (same) diff.duplicates.push({ draft: draft.id, existing: same.id });
      continue;
    }
    const change = ruleChange(current, draft);
    if (change) diff.changed.push(change);
    else diff.unchanged.push(draft.id);
  }
  diff.removed = registry.rules
    .filter((rule) => rule.provenance.importer === drafts.importer && !drafted.has(rule.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  return diff;
}

export function hasChanges(diff: DraftDiff): boolean {
  return diff.added.length + diff.changed.length + diff.removed.length > 0;
}

const show = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/** A short terminal summary of a diff. */
export function renderDiffText(diff: DraftDiff): string {
  const lines = [`${diff.importer} → registry/${diff.ecosystem}.json`];
  for (const rule of diff.added) {
    lines.push(`+ ${rule.id}  (${rule.event}, ${rule.purl} ${rule.vers})`);
    const duplicate = diff.duplicates.find((entry) => entry.draft === rule.id);
    if (duplicate) lines.push(`    same component and versions as existing rule ${duplicate.existing}`);
  }
  for (const rule of diff.changed) {
    lines.push(`~ ${rule.id}`);
    for (const change of rule.dates) lines.push(`    ${change.field}: ${show(change.before)} → ${show(change.after)}`);
    if (rule.sources) {
      for (const source of rule.sources.added) lines.push(`    source added: ${source.url}`);
      for (const source of rule.sources.removed) lines.push(`    source removed: ${source.url}`);
      for (const source of rule.sources.retitled) lines.push(`    source retitled: ${source.url}: ${source.before} → ${source.after}`);
    }
    for (const change of rule.fields) lines.push(`    ${change.field}: ${show(change.before)} → ${show(change.after)}`);
  }
  for (const rule of diff.removed) lines.push(`- ${rule.id}`);
  lines.push(`${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged.length} unchanged`);
  return `${lines.join("\n")}\n`;
}

export async function main(argv: string[]): Promise<number> {
  const files: string[] = [];
  let out: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--out") out = argv[++index] ?? (() => { throw new Error("--out needs a value."); })();
    else if (argument.startsWith("--")) throw new Error(`Unknown option ${argument}.`);
    else files.push(argument);
  }
  if (files.length !== 2) throw new Error("Usage: diff <drafts.json> <registry.json> [--out FILE]");
  const drafts = JSON.parse(await readFile(files[0]!, "utf8")) as DraftRegistry;
  const registry = validateRegistryV2(JSON.parse(await readFile(files[1]!, "utf8")) as unknown);
  const diff = diffDrafts(drafts, registry);
  if (out) await writeFile(out, `${JSON.stringify(diff, null, 2)}\n`);
  process.stdout.write(renderDiffText(diff));
  return hasChanges(diff) ? 10 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(1);
    },
  );
}
