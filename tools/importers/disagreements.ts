// Flags disagreements between sources that describe the same product, instead of choosing silently.
//
//   node dist/tools/importers/disagreements.js drafts-a.json drafts-b.json ... [--dry-run] [--max-open 10] [--repo OWNER/REPO]
//
// Two importers that draft a rule for the same component and affected versions (same `purl` and `vers`)
// describe one fact. When they disagree about the lifecycle event or the deadline, neither draft is
// preferred: the tool opens one issue per component with both claims and their sources, so a maintainer
// decides. Each issue carries a marker (<!-- evergreen-source-disagreement: <key> -->); a component that
// already has an open or closed issue is never filed twice, and the number of open disagreement issues
// is capped. Exit code 10 means at least one disagreement was found.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import type { RegistryV2Rule } from "../../src/registry.js";
import { defaultGitHubRunner } from "./candidate-issues.js";
import type { CandidateIssueRunner, IssueRecord, RenderedCandidateIssue } from "./candidate-issues.js";
import type { DraftRegistry } from "./types.js";

export const DISAGREEMENT_MARKER_PREFIX = "<!-- evergreen-source-disagreement:";
export const DEFAULT_MAX_OPEN_DISAGREEMENTS = 10;
export const DISAGREEMENT_LABELS = ["type: task", "area: data", "area: validation", "lane: maintainer"];

/** What one importer claims about a component. */
export interface Claim {
  importer: string;
  ruleId: string;
  event: string;
  deadline: string | null;
  sources: { title: string; url: string }[];
}

export interface Disagreement {
  /** Stable key for the component: a digest of its `purl` and `vers`. */
  key: string;
  purl: string;
  vers: string;
  /** The fields on which the claims differ: `event`, `deadline`, or both. */
  fields: ("event" | "deadline")[];
  /** Claims from at least two importers, sorted by importer id. */
  claims: Claim[];
}

const keyOf = (purl: string, vers: string) => createHash("sha256").update(`${purl} ${vers}`).digest("hex").slice(0, 12);

function claimOf(importer: string, rule: RegistryV2Rule): Claim {
  return {
    importer,
    ruleId: rule.id,
    event: rule.event,
    deadline: rule.deadline ?? null,
    sources: rule.sources.map((source) => ({ title: source.title, url: source.url })),
  };
}

function differingFields(claims: readonly Claim[]): Disagreement["fields"] {
  const fields: Disagreement["fields"] = [];
  if (new Set(claims.map((claim) => claim.event)).size > 1) fields.push("event");
  if (new Set(claims.map((claim) => claim.deadline)).size > 1) fields.push("deadline");
  return fields;
}

/**
 * Groups rules from different importers by component and affected versions, and returns the groups
 * whose members disagree. Rules drafted by one importer are never compared with each other, and an
 * importer that drafts several rules for one component is compared by its first rule in id order.
 */
export function findDisagreements(drafts: readonly DraftRegistry[]): Disagreement[] {
  const groups = new Map<string, { purl: string; vers: string; claims: Map<string, Claim> }>();
  for (const draft of drafts) {
    for (const rule of [...draft.rules].sort((a, b) => a.id.localeCompare(b.id))) {
      const key = keyOf(rule.purl, rule.vers);
      const group = groups.get(key) ?? { purl: rule.purl, vers: rule.vers, claims: new Map() };
      if (!group.claims.has(draft.importer)) group.claims.set(draft.importer, claimOf(draft.importer, rule));
      groups.set(key, group);
    }
  }
  const found: Disagreement[] = [];
  for (const [key, group] of groups) {
    const claims = [...group.claims.values()].sort((a, b) => a.importer.localeCompare(b.importer));
    const fields = claims.length > 1 ? differingFields(claims) : [];
    if (fields.length > 0) found.push({ key, purl: group.purl, vers: group.vers, fields, claims });
  }
  return found.sort((a, b) => a.purl.localeCompare(b.purl) || a.vers.localeCompare(b.vers));
}

export function formatDisagreementMarker(key: string): string {
  return `${DISAGREEMENT_MARKER_PREFIX} ${key} -->`;
}

export function extractDisagreementKey(body: string | undefined): string | null {
  const match = body?.match(/<!--\s*evergreen-source-disagreement:\s*([^\s]+)\s*-->/);
  return match ? match[1]! : null;
}

export function renderDisagreementIssue(disagreement: Disagreement): RenderedCandidateIssue {
  const { purl, vers, claims, fields, key } = disagreement;
  const rows = claims
    .map(
      (claim) => `| \`${claim.importer}\` | \`${claim.event}\` | ${claim.deadline ?? "none"} | \`${claim.ruleId}\` |`,
    )
    .join("\n");
  const sources = claims
    .map(
      (claim) =>
        `- \`${claim.importer}\`:\n${claim.sources.map((source) => `  - [${source.title}](${source.url})`).join("\n")}`,
    )
    .join("\n");
  const body = `${formatDisagreementMarker(key)}

## Goal

Two sources describe \`${purl}\` (\`${vers}\`) and disagree about its ${fields.join(" and ")}. Decide which one is right instead of letting a draft pick silently.

## What each source says

| Importer | Event | Deadline | Draft rule |
|---|---|---|---|
${rows}

## Evidence

${sources}

## Agent brief

### Steps

1. Open each source above and find the statement that decides the ${fields.join(" and ")}.
2. If the sources describe different things (for example a vendor end of support versus a distribution end of life), record that in the rule's summary and keep both facts apart.
3. If one source is wrong or stale, correct the registry rule and note the evidence in the pull request. Do not change either importer to hide the difference.
4. Run \`npm run check\`.

### Do not

• Do not choose by popularity or by which source is newer.
• Do not add network access to scans.

## Done when

- [ ] The registry states one reviewed ${fields.join(" and ")} for this component, with its source.
- [ ] \`npm run check\` passes.
`;
  return { ruleId: key, title: `data: sources disagree about ${purl} (${vers})`, body, labels: DISAGREEMENT_LABELS };
}

export interface DisagreementSelection {
  toOpen: Disagreement[];
  skippedTracked: string[];
  openCount: number;
  capped: boolean;
}

export function selectDisagreementsToOpen(
  found: readonly Disagreement[],
  existing: readonly IssueRecord[],
  maxOpen = DEFAULT_MAX_OPEN_DISAGREEMENTS,
): DisagreementSelection {
  const tracked = new Set<string>();
  let openCount = 0;
  for (const issue of existing) {
    const key = extractDisagreementKey(issue.body);
    if (!key) continue;
    tracked.add(key);
    if (!issue.state || issue.state.toUpperCase() === "OPEN") openCount++;
  }
  const eligible = found.filter((item) => !tracked.has(item.key));
  const toOpen = eligible.slice(0, Math.max(0, maxOpen - openCount));
  return {
    toOpen,
    skippedTracked: found.filter((item) => tracked.has(item.key)).map((item) => item.key),
    openCount,
    capped: eligible.length > toOpen.length,
  };
}

export function renderDisagreementText(found: readonly Disagreement[]): string {
  if (found.length === 0) return "No source disagreements.\n";
  const lines = found.map(
    (item) =>
      `! ${item.purl} ${item.vers}: ${item.fields.join(" and ")}\n${item.claims
        .map((claim) => `    ${claim.importer}: ${claim.event} ${claim.deadline ?? "no deadline"}`)
        .join("\n")}`,
  );
  return `${lines.join("\n")}\n${found.length} disagreement(s)\n`;
}

export interface DisagreementOptions {
  dryRun?: boolean;
  maxOpen?: number;
  repo?: string;
  runner?: CandidateIssueRunner;
}

/** Reports disagreements and opens an issue for each component that has none yet. */
export async function reportDisagreements(
  drafts: readonly DraftRegistry[],
  options: DisagreementOptions = {},
): Promise<{ found: Disagreement[]; opened: RenderedCandidateIssue[]; selection: DisagreementSelection }> {
  const runner = options.runner ?? defaultGitHubRunner;
  const found = findDisagreements(drafts);
  let existing: IssueRecord[] = [];
  if (found.length > 0 && (!options.dryRun || options.runner)) {
    try {
      existing = await runner.listExistingIssues(options.repo);
    } catch (error) {
      if (!options.dryRun) throw error;
    }
  }
  const selection = selectDisagreementsToOpen(found, existing, options.maxOpen);
  const opened: RenderedCandidateIssue[] = [];
  for (const item of selection.toOpen) {
    const rendered = renderDisagreementIssue(item);
    if (!options.dryRun) await runner.createIssue(rendered, options.repo);
    opened.push(rendered);
  }
  return { found, opened, selection };
}

function numberOption(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 0) throw new Error(`${name} needs a non-negative number.`);
  return parsed;
}

export async function main(argv: string[], runner?: CandidateIssueRunner): Promise<number> {
  const files: string[] = [];
  const options: DisagreementOptions = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--max-open") options.maxOpen = numberOption(argv[++index], "--max-open");
    else if (argument === "--repo") {
      const value = argv[++index];
      if (!value) throw new Error("--repo needs an owner/repo value.");
      options.repo = value;
    } else if (argument.startsWith("--")) throw new Error(`Unknown option ${argument}.`);
    else files.push(argument);
  }
  if (files.length < 2)
    throw new Error(
      "Usage: disagreements <drafts.json> <drafts.json>... [--dry-run] [--max-open N] [--repo OWNER/REPO]",
    );
  if (runner) options.runner = runner;
  const drafts = await Promise.all(
    files.map(
      async (file) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- drafts.json is written by run.js
        JSON.parse(await readFile(file, "utf8")) as DraftRegistry,
    ),
  );
  const { found, opened, selection } = await reportDisagreements(drafts, options);
  process.stdout.write(renderDisagreementText(found));
  const verb = options.dryRun ? "to open" : "opened";
  process.stdout.write(`Issues ${verb}: ${opened.length}; already tracked: ${selection.skippedTracked.length}\n`);
  if (selection.capped) process.stdout.write("Open disagreement issue cap reached; the rest are deferred.\n");
  return found.length > 0 ? 10 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
