// Opens good first issues for unreviewed rule candidates from importer drafts.
//
//   node dist/tools/importers/candidate-issues.js drafts.json [registry/nodejs.json] [--max-open 10] [--dry-run]
//
// When an importer drafts new rules that are not yet in the registry (and not acknowledged),
// each candidate is formatted as a contributor-sized "good first issue" with its evidence,
// agent brief, and fixture checklist.
//
// To prevent flooding the tracker, the number of open candidate issues is capped (default: 10).
// Each candidate issue includes a deduplication marker (<!-- evergreen-rule-candidate: <id> -->);
// candidate rules whose ID already appears in an open or closed issue are never duplicated.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { validateRegistryV2 } from "../../src/registry.js";
import type { RegistryV2, RegistryV2Rule } from "../../src/registry.js";
import { diffDrafts, loadAcknowledged } from "./diff.js";
import type { DraftRegistry } from "./types.js";

const execFileAsync = promisify(execFile);

export const CANDIDATE_MARKER_PREFIX = "<!-- evergreen-rule-candidate:";
export const CANDIDATE_MARKER_SUFFIX = " -->";
export const DEFAULT_MAX_OPEN = 10;
export const GOOD_FIRST_ISSUE_LABEL = "good first issue";

export function formatCandidateMarker(ruleId: string): string {
  return `${CANDIDATE_MARKER_PREFIX} ${ruleId}${CANDIDATE_MARKER_SUFFIX}`;
}

export function extractCandidateRuleId(body: string): string | null {
  const match = body.match(/<!--\s*evergreen-rule-candidate:\s*([^\s]+)\s*-->/);
  return match ? match[1]! : null;
}

export function candidateIssueLabels(ecosystem: string): string[] {
  const labels = [GOOD_FIRST_ISSUE_LABEL, "help wanted", "type: rule", "area: data", "lane: free-agent"];
  if (ecosystem) {
    labels.push(`eco: ${ecosystem}`);
  }
  return labels;
}

export interface CandidateIssueRenderInput {
  rule: RegistryV2Rule;
  importer: string;
  ecosystem: string;
}

export interface RenderedCandidateIssue {
  ruleId: string;
  title: string;
  body: string;
  labels: string[];
}

export function renderCandidateIssue(input: CandidateIssueRenderInput): RenderedCandidateIssue {
  const { rule, importer, ecosystem } = input;
  const title = `rule (${ecosystem}): ${rule.id}`;

  const sourcesList = rule.sources.length > 0
    ? rule.sources.map((s) => `- [${s.title}](${s.url})`).join("\n")
    : "- None specified";

  const optionalDetails: string[] = [];
  if (rule.deadline) {
    optionalDetails.push(`- **Deadline**: \`${rule.deadline}\``);
  }
  if (rule.replacement) {
    optionalDetails.push(`- **Replacement**: ${rule.replacement}`);
  }
  const optionalSection = optionalDetails.length > 0 ? `${optionalDetails.join("\n")}\n` : "";

  const body = `${formatCandidateMarker(rule.id)}

## Goal

Add the reviewed lifecycle rule \`${rule.id}\` to \`registry/${ecosystem}.json\` with supporting test fixtures.

## Candidate details

- **Rule ID**: \`${rule.id}\`
- **Ecosystem**: \`${ecosystem}\`
- **Package URL (PURL)**: \`${rule.purl}\`
- **Affected versions**: \`${rule.vers}\`
- **Lifecycle event**: \`${rule.event}\`
- **Severity**: \`${rule.severity}\`
${optionalSection}- **Summary**: ${rule.summary}

## Evidence

The candidate rule was drafted by the \`${importer}\` importer from the following authoritative source(s):

${sourcesList}

Please review the source to confirm the event, affected version range, and effective date.

## Agent brief

### Files

• \`registry/${ecosystem}.json\`
• \`tests/fixtures/${ecosystem}/\`

### Steps

1. Verify the evidence source above to confirm the lifecycle claim, affected versions, and effective date.
2. Add the rule to \`registry/${ecosystem}.json\` with your GitHub username in \`provenance.reviewer\` and today's date (\`YYYY-MM-DD\`) in \`provenance.reviewedAt\`. Ensure \`provenance.reviewer\` is not left as \`pending-review\`.
3. Add a test fixture under \`tests/fixtures/${ecosystem}/\` and update detector tests to verify the rule flags affected versions and produces zero false positives for unaffected versions.
4. Run \`npm run check\` and ensure all checks and schema validations pass.

### Do not

• Do not expand scope beyond this issue; open a follow-up instead.
• Do not add network access to scans.
• Do not merge \`provenance.reviewer: "pending-review"\`.

### Run

\`\`\`bash
npm ci
npm run check
\`\`\`

## Fixture checklist

- [ ] Add a positive fixture exercising the affected version/declaration for \`${rule.purl}\`.
- [ ] Verify that detector tests assert the expected finding for this fixture.
- [ ] Add or verify a negative fixture (zero findings) ensuring unaffected versions are not flagged.

## Done when

- [ ] Rule \`${rule.id}\` is added to \`registry/${ecosystem}.json\` with valid reviewer provenance.
- [ ] Fixture checklist items are completed and detector tests pass.
- [ ] \`npm run check\` passes.

---

Part of Evergreen contributor onboarding. New here? Read \`CONTRIBUTING.md\` and \`AGENTS.md\`, then comment to claim this issue. One issue = one pull request.
`;

  return {
    ruleId: rule.id,
    title,
    body,
    labels: candidateIssueLabels(ecosystem),
  };
}

export interface IssueRecord {
  number?: number | undefined;
  title: string;
  body?: string | undefined;
  state?: "OPEN" | "CLOSED" | string | undefined;
  labels?: (string | { name: string })[] | undefined;
}

export function isCandidateIssue(issue: IssueRecord): boolean {
  if (issue.body && extractCandidateRuleId(issue.body)) {
    return true;
  }
  const labels = (issue.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
  return labels.includes(GOOD_FIRST_ISSUE_LABEL) && (issue.title.startsWith("rule:") || issue.title.startsWith("rule ("));
}

export function extractRuleIdFromIssue(issue: IssueRecord): string | null {
  if (issue.body) {
    const fromBody = extractCandidateRuleId(issue.body);
    if (fromBody) return fromBody;
  }
  const match = issue.title.match(/rule\s*(?:\([^)]+\))?:\s*(?:add\s+)?([^\s]+)/i);
  return match ? match[1]! : null;
}

export interface CandidateSelectionOptions {
  candidates: RegistryV2Rule[];
  existingIssues: IssueRecord[];
  maxOpen?: number | undefined;
  limit?: number | undefined;
  duplicates?: { draft: string; existing: string }[] | undefined;
}

export interface CandidateSelectionResult {
  toOpen: RegistryV2Rule[];
  skippedTracked: string[];
  skippedDuplicates: string[];
  openCount: number;
  maxOpen: number;
  capped: boolean;
}

export function selectCandidatesToOpen(options: CandidateSelectionOptions): CandidateSelectionResult {
  const maxOpen = options.maxOpen ?? DEFAULT_MAX_OPEN;
  const tracked = new Set<string>();
  let openCount = 0;

  for (const issue of options.existingIssues) {
    const id = extractRuleIdFromIssue(issue);
    if (id) {
      tracked.add(id);
    }
    const isOpen = issue.state ? issue.state.toUpperCase() === "OPEN" : true;
    if (isOpen && isCandidateIssue(issue)) {
      openCount++;
    }
  }

  const duplicates = new Set((options.duplicates ?? []).map((d) => d.draft));
  const skippedTracked: string[] = [];
  const skippedDuplicates: string[] = [];
  const eligible: RegistryV2Rule[] = [];

  for (const candidate of options.candidates) {
    if (tracked.has(candidate.id)) {
      skippedTracked.push(candidate.id);
    } else if (duplicates.has(candidate.id)) {
      skippedDuplicates.push(candidate.id);
    } else {
      eligible.push(candidate);
    }
  }

  const available = Math.max(0, maxOpen - openCount);
  const limit = options.limit !== undefined ? Math.min(options.limit, available) : available;
  const toOpen = eligible.slice(0, limit);
  const capped = eligible.length > toOpen.length;

  return {
    toOpen,
    skippedTracked,
    skippedDuplicates,
    openCount,
    maxOpen,
    capped,
  };
}

export interface CandidateIssueRunner {
  listExistingIssues(repo?: string | undefined): Promise<IssueRecord[]>;
  createIssue(issue: RenderedCandidateIssue, repo?: string | undefined): Promise<{ number?: number | undefined; url?: string | undefined }>;
}

export const defaultGitHubRunner: CandidateIssueRunner = {
  async listExistingIssues(repo?: string | undefined): Promise<IssueRecord[]> {
    const args = ["issue", "list", "--state", "all", "--limit", "1000", "--json", "number,title,body,state,labels"];
    if (repo) {
      args.push("--repo", repo);
    }
    const { stdout } = await execFileAsync("gh", args);
    return JSON.parse(stdout) as IssueRecord[];
  },

  async createIssue(issue: RenderedCandidateIssue, repo?: string | undefined): Promise<{ number?: number | undefined; url?: string | undefined }> {
    const args = [
      "issue",
      "create",
      "--title",
      issue.title,
      "--body",
      issue.body,
      "--label",
      issue.labels.join(","),
    ];
    if (repo) {
      args.push("--repo", repo);
    }
    const { stdout } = await execFileAsync("gh", args);
    const url = stdout.trim();
    const match = url.match(/\/issues\/(\d+)$/);
    const number = match ? Number.parseInt(match[1]!, 10) : undefined;
    return number !== undefined ? { number, url } : { url };
  },
};

export interface ProcessCandidateIssuesOptions {
  drafts: DraftRegistry;
  registry?: RegistryV2 | undefined;
  acknowledged?: Record<string, string> | undefined;
  maxOpen?: number | undefined;
  limit?: number | undefined;
  dryRun?: boolean | undefined;
  outDir?: string | undefined;
  repo?: string | undefined;
  runner?: CandidateIssueRunner | undefined;
}

export interface ProcessCandidateIssuesResult {
  opened: RenderedCandidateIssue[];
  selection: CandidateSelectionResult;
}

export async function processCandidateIssues(options: ProcessCandidateIssuesOptions): Promise<ProcessCandidateIssuesResult> {
  const runner = options.runner ?? defaultGitHubRunner;
  const acknowledged = options.acknowledged ?? await loadAcknowledged();
  const registry = options.registry ?? {
    schemaVersion: "evergreen.registry.v2",
    ecosystem: options.drafts.ecosystem,
    rules: [],
  };

  const diff = diffDrafts(options.drafts, registry, acknowledged);
  const candidates = diff.added;

  let existingIssues: IssueRecord[] = [];
  if (!options.dryRun || options.runner) {
    try {
      existingIssues = await runner.listExistingIssues(options.repo);
    } catch (error) {
      if (options.dryRun) {
        existingIssues = [];
      } else {
        throw error;
      }
    }
  }

  const selection = selectCandidatesToOpen({
    candidates,
    existingIssues,
    maxOpen: options.maxOpen ?? DEFAULT_MAX_OPEN,
    limit: options.limit,
    duplicates: diff.duplicates,
  });

  const opened: RenderedCandidateIssue[] = [];

  for (const candidate of selection.toOpen) {
    const rendered = renderCandidateIssue({
      rule: candidate,
      importer: options.drafts.importer,
      ecosystem: options.drafts.ecosystem,
    });

    if (options.outDir) {
      await mkdir(options.outDir, { recursive: true });
      await writeFile(join(options.outDir, `${candidate.id}.md`), rendered.body, "utf8");
    }

    if (options.dryRun) {
      opened.push(rendered);
    } else {
      await runner.createIssue(rendered, options.repo);
      opened.push(rendered);
    }
  }

  return { opened, selection };
}

export async function main(argv: string[], runner?: CandidateIssueRunner): Promise<number> {
  const files: string[] = [];
  let maxOpen = DEFAULT_MAX_OPEN;
  let limit: number | undefined;
  let dryRun = false;
  let outDir: string | undefined;
  let repo: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--max-open") {
      const value = argv[++index];
      if (!value) throw new Error("--max-open requires a number.");
      maxOpen = Number.parseInt(value, 10);
      if (Number.isNaN(maxOpen) || maxOpen < 0) throw new Error("--max-open must be a non-negative number.");
    } else if (argument === "--limit") {
      const value = argv[++index];
      if (!value) throw new Error("--limit requires a number.");
      limit = Number.parseInt(value, 10);
      if (Number.isNaN(limit) || limit < 0) throw new Error("--limit must be a non-negative number.");
    } else if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--out") {
      outDir = argv[++index] ?? (() => { throw new Error("--out requires a directory path."); })();
    } else if (argument === "--repo") {
      repo = argv[++index] ?? (() => { throw new Error("--repo requires an owner/repo value."); })();
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option ${argument}.`);
    } else {
      files.push(argument);
    }
  }

  if (files.length < 1 || files.length > 2) {
    throw new Error("Usage: candidate-issues <drafts.json> [registry.json] [--max-open N] [--limit N] [--dry-run] [--out DIR] [--repo OWNER/REPO]");
  }

  const draftsFile = files[0]!;
  const drafts = JSON.parse(await readFile(draftsFile, "utf8")) as DraftRegistry;

  let registry: RegistryV2;
  const registryFile = files[1] ?? `registry/${drafts.ecosystem}.json`;
  if (existsSync(registryFile)) {
    registry = validateRegistryV2(JSON.parse(await readFile(registryFile, "utf8")) as unknown);
  } else {
    registry = {
      schemaVersion: "evergreen.registry.v2",
      ecosystem: drafts.ecosystem,
      rules: [],
    };
  }

  const result = await processCandidateIssues({
    drafts,
    registry,
    maxOpen,
    ...(limit !== undefined ? { limit } : {}),
    dryRun,
    ...(outDir !== undefined ? { outDir } : {}),
    ...(repo !== undefined ? { repo } : {}),
    ...(runner !== undefined ? { runner } : {}),
  });

  const { selection, opened } = result;
  const prefix = dryRun ? "[dry-run] " : "";

  process.stdout.write(
    `${prefix}Evaluated ${selection.toOpen.length + selection.skippedTracked.length + selection.skippedDuplicates.length} candidate rule(s) from ${drafts.importer}.\n` +
    `  Already tracked: ${selection.skippedTracked.length}\n` +
    `  Duplicate components: ${selection.skippedDuplicates.length}\n` +
    `  Currently open candidate issues: ${selection.openCount} (cap: ${selection.maxOpen})\n` +
    `  Issues ${dryRun ? "to open" : "opened"}: ${opened.length}\n`,
  );

  for (const item of opened) {
    process.stdout.write(`  + ${item.title}\n`);
  }

  if (selection.capped) {
    process.stdout.write(`  Note: open candidate issues cap (${selection.maxOpen}) reached; remaining candidates deferred.\n`);
  }

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
