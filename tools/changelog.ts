// Drafts changelog entries and release notes from conventional commit subjects.
//
//   npm run build --silent
//   node dist/tools/changelog.js                          # notes for commits since the latest release tag (v*, never data-v*)
//   node dist/tools/changelog.js --from v0.1.0 --to HEAD  # an explicit range
//   node dist/tools/changelog.js --write 0.2.0 --date 2026-11-15
//
// Only feat, fix, and breaking commits are user-visible; docs, test, ci, chore, build, refactor, and
// style commits are left out. --write adds a "## X.Y.Z - date" section to CHANGELOG.md under
// "## Unreleased": the hand-written Unreleased bullets come first, then the changes/ fragments, then the
// generated ones. It deletes the fragments it used and leaves Unreleased empty. Review the result for
// duplicates before committing. Nothing here uses the network.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface ParsedCommit {
  type: string;
  scope?: string;
  breaking: boolean;
  description: string;
  pullRequest?: string;
}

const SUBJECT = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+?)(?:\s+\(#(\d+)\))?$/;
const VISIBLE = new Set(["feat", "fix"]);

/** Parses a conventional commit subject; anything else (merge commits, free-form subjects) is not a change entry. */
export function parseSubject(subject: string): ParsedCommit | undefined {
  const match = SUBJECT.exec(subject.trim());
  if (!match) return undefined;
  return {
    type: match[1]!,
    ...(match[2] ? { scope: match[2] } : {}),
    breaking: match[3] === "!",
    description: match[4]!,
    ...(match[5] ? { pullRequest: match[5] } : {}),
  };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Matches a mention GitHub would resolve: `@` at the start or after whitespace or an opening bracket. */
const MENTION = /(^|[\s([{])@([A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9][A-Za-z0-9-]*)?)/g;
const CODE_SPAN = /(`+[^`]*?`+)/g;

/** Quotes every bare @mention in backticks, leaving code spans, e-mail addresses, and pkg@version untouched. */
export function quoteMentions(text: string): string {
  return text
    .split(CODE_SPAN)
    .map((part, index) =>
      index % 2 === 1 ? part : part.replace(MENTION, (_match, before: string, name: string) => `${before}\`@${name}\``),
    )
    .join("");
}

/** One changelog bullet in the repository's format: an imperative sentence that ends with a period. */
export function bullet(commit: ParsedCommit): string {
  const sentence = capitalize(commit.description).replace(/[.\s]+$/, "");
  const prefix = commit.breaking ? "**Breaking:** " : "";
  const pull = commit.pullRequest ? ` (#${commit.pullRequest})` : "";
  return quoteMentions(`- ${prefix}${sentence}.${pull}`);
}

/** Bullets for the visible commits: breaking changes first, then features, then fixes, each in commit order. */
export function entries(subjects: string[]): { bullets: string[]; skipped: string[] } {
  const parsed: ParsedCommit[] = [];
  const skipped: string[] = [];
  for (const subject of subjects) {
    const commit = parseSubject(subject);
    if (!commit) {
      if (subject.trim()) skipped.push(subject);
    } else if (commit.breaking || VISIBLE.has(commit.type)) {
      parsed.push(commit);
    }
  }
  const rank = (commit: ParsedCommit) => (commit.breaking ? 0 : commit.type === "feat" ? 1 : 2);
  const ordered = parsed
    .map((commit, index) => ({ commit, index }))
    .sort((a, b) => rank(a.commit) - rank(b.commit) || a.index - b.index);
  return { bullets: ordered.map(({ commit }) => bullet(commit)), skipped };
}

export const FRAGMENT_DIR = "changes";

/**
 * Reads the changes/ fragments: one changelog bullet per file, in file-name order. README.md documents the
 * format and is not a fragment. Each fragment must be a single line that starts with "- ".
 */
export function fragments(files: Record<string, string>): { names: string[]; bullets: string[] } {
  const names = Object.keys(files)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
  const bullets = names.map((name) => {
    const text = files[name]!.trim();
    if (!/^- \S[^\n]*$/.test(text))
      throw new Error(`${FRAGMENT_DIR}/${name} must be one changelog bullet on one line, starting with "- ".`);
    return quoteMentions(text);
  });
  return { names, bullets };
}

/** Moves the Unreleased text into a new version section, followed by the fragment and generated bullets. */
export function releaseSection(
  changelog: string,
  version: string,
  date: string,
  generated: string[],
  fragmentBullets: string[] = [],
): string {
  const heading = "## Unreleased";
  const start = changelog.indexOf(heading);
  if (start < 0) throw new Error('CHANGELOG.md has no "## Unreleased" heading.');
  const bodyStart = start + heading.length;
  const next = changelog.indexOf("\n## ", bodyStart);
  const end = next < 0 ? changelog.length : next + 1;
  const written = changelog.slice(bodyStart, end).trim();
  const body = [written, ...fragmentBullets, ...generated].filter(Boolean).join("\n");
  return `${changelog.slice(0, start)}${heading}\n\n## ${version} - ${date}\n\n${body}\n\n${changelog.slice(end)}`.replace(
    /\n{3,}/g,
    "\n\n",
  );
}

function readFragments(): { names: string[]; bullets: string[] } {
  if (!existsSync(FRAGMENT_DIR)) return { names: [], bullets: [] };
  const files: Record<string, string> = {};
  for (const name of readdirSync(FRAGMENT_DIR)) files[name] = readFileSync(join(FRAGMENT_DIR, name), "utf8");
  return fragments(files);
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" });
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const to = option("--to") ?? "HEAD";
  const from = option("--from") ?? git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", to).trim();
  const subjects = git("log", "--no-merges", "--format=%s", `${from}..${to}`).split("\n");
  const { bullets, skipped } = entries(subjects);
  for (const subject of skipped) process.stderr.write(`Not a conventional commit, left out: ${subject}\n`);

  const version = option("--write");
  if (version) {
    const date = option("--date") ?? new Date().toISOString().slice(0, 10);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw new Error("Pass --write X.Y.Z and --date YYYY-MM-DD.");
    const pending = readFragments();
    writeFileSync(
      "CHANGELOG.md",
      releaseSection(readFileSync("CHANGELOG.md", "utf8"), version, date, bullets, pending.bullets),
    );
    for (const name of pending.names) rmSync(join(FRAGMENT_DIR, name));
    process.stdout.write(
      `Added ${pending.bullets.length} fragments and ${bullets.length} generated entries to CHANGELOG.md under ${version}.\n`,
    );
    return;
  }
  process.stdout.write(`${bullets.join("\n")}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
