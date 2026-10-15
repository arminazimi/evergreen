// Writes the pull-request description for imported drafts: what changes, with the evidence beside it.
//
//   node dist/tools/importers/pr-body.js drafts.json registry/nodejs.json [--out body.md]

import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { validateRegistryV2 } from "../../src/registry.js";
import type { RegistryV2Rule } from "../../src/registry.js";
import { diffDrafts } from "./diff.js";
import type { ChangedRule, DraftDiff } from "./diff.js";
import type { DraftRegistry } from "./types.js";

/** GitHub rejects descriptions over 65,536 characters; stay well under. */
export const MAX_BODY_CHARS = 60_000;

const EM_DASH = "—";

// Pipes would split a table row, even inside a code span, so every table cell goes through `cell`.
const cell = (text: string) => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || EM_DASH;
const code = (text: string) => `\`${text.replace(/`/g, "'")}\``;
const show = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));
const IDENTITY_FIELDS = ["vers", "purl"];

function links(rule: RegistryV2Rule): string {
  return rule.sources.map((source) => `[${cell(source.title).replace(/[[\]]/g, "")}](${source.url})`).join("<br>");
}

function describe(change: ChangedRule): string {
  const parts: string[] = [];
  for (const date of change.dates) parts.push(`${date.field}: ${show(date.before)} → ${show(date.after)}`);
  if (change.sources) {
    for (const source of change.sources.added) parts.push(`source added: ${new URL(source.url).host}`);
    for (const source of change.sources.removed) parts.push(`source removed: ${new URL(source.url).host}`);
    for (const source of change.sources.retitled) parts.push(`source retitled: ${new URL(source.url).host}`);
  }
  for (const field of change.fields) {
    if (IDENTITY_FIELDS.includes(field.field)) parts.push(`${field.field}: ${code(show(field.before))} → ${code(show(field.after))}`);
    else if (["severity", "event"].includes(field.field)) parts.push(`${field.field}: ${show(field.before)} → ${show(field.after)}`);
    else parts.push(`${field.field} changed`);
  }
  return parts.map(cell).join("<br>");
}

interface Row {
  rule: string;
  change: string;
  date: string;
  sources: string;
  observed: string;
}

function rows(diff: DraftDiff, drafts: DraftRegistry): Row[] {
  const draftById = new Map(drafts.rules.map((rule) => [rule.id, rule]));
  const table: Row[] = [];
  for (const rule of diff.added) {
    table.push({
      rule: code(rule.id),
      change: cell(`added: ${rule.event}, ${code(rule.purl)} ${code(rule.vers)}`),
      date: rule.deadline ?? EM_DASH,
      sources: links(rule),
      observed: rule.provenance.observedAt,
    });
  }
  for (const change of diff.changed) {
    const draft = draftById.get(change.id)!;
    table.push({ rule: code(change.id), change: describe(change), date: draft.deadline ?? EM_DASH, sources: links(draft), observed: draft.provenance.observedAt });
  }
  for (const rule of diff.removed) {
    table.push({ rule: code(rule.id), change: "no longer drafted by this importer", date: rule.deadline ?? EM_DASH, sources: links(rule), observed: rule.provenance.observedAt });
  }
  return table;
}

export function renderPullRequestBody(diff: DraftDiff, drafts: DraftRegistry): string {
  const registry = `registry/${diff.ecosystem}.json`;
  const head = [
    `Drafts from the \`${diff.importer}\` importer for \`${registry}\`, observed ${drafts.observedAt}.`,
    "",
    "These are **drafts**. Each rule below comes from the source linked beside it and has not been reviewed. Nothing is merged until a maintainer has checked it.",
    "",
    "## Summary",
    "",
    `${diff.added.length} added, ${diff.changed.length} changed, ${diff.removed.length} removed, ${diff.unchanged.length} unchanged.`,
    "",
    "## Evidence",
    "",
  ];

  const table = rows(diff, drafts);
  const tail = [
    ...(drafts.notes.length > 0 ? ["## Skipped or undecided", "", ...drafts.notes.map((note) => `- ${note}`), ""] : []),
    "## Review checklist",
    "",
    "- [ ] Each source says what its rule says: the event, the affected versions, and the date.",
    "- [ ] Severity, title, and summary are right for users, and the replacement is real.",
    "- [ ] Removed rules really are gone upstream, not just missing from this run.",
    `- [ ] On approval, set \`provenance.reviewer\` and \`provenance.reviewedAt\` on each rule you accept; \`pending-review\` must not be merged.`,
    "",
    "## Reproduce",
    "",
    "```bash",
    "npm ci && npm run build",
    `node dist/tools/importers/run.js ${diff.importer} --out drafts.json`,
    `node dist/tools/importers/diff.js drafts.json ${registry}`,
    "```",
    "",
  ];

  if (table.length === 0) return `${[...head, "No rules were added, changed, or removed.", "", ...tail].join("\n")}`;

  const header = ["| Rule | Change | Date | Source | Observed |", "|---|---|---|---|---|"];
  const budget = MAX_BODY_CHARS - [...head, ...header, ...tail].join("\n").length - 200;
  const lines: string[] = [];
  let used = 0;
  for (const row of table) {
    const line = `| ${row.rule} | ${row.change} | ${row.date} | ${row.sources} | ${row.observed} |`;
    if (used + line.length + 1 > budget) break;
    lines.push(line);
    used += line.length + 1;
  }
  const omitted = table.length - lines.length;
  return [...head, ...header, ...lines, ...(omitted > 0 ? ["", `… and ${omitted} more row${omitted === 1 ? "" : "s"}; run the commands below for the full diff.`] : []), "", ...tail].join("\n");
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
  if (files.length !== 2) throw new Error("Usage: pr-body <drafts.json> <registry.json> [--out FILE]");
  const drafts = JSON.parse(await readFile(files[0]!, "utf8")) as DraftRegistry;
  const registry = validateRegistryV2(JSON.parse(await readFile(files[1]!, "utf8")) as unknown);
  const body = renderPullRequestBody(diffDrafts(drafts, registry), drafts);
  if (out) await writeFile(out, body);
  else process.stdout.write(body);
  return 0;
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
