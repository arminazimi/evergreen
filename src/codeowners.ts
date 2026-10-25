import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Finding, ScanResult } from "./domain.js";

/** Where Git hosts look for a CODEOWNERS file, in precedence order. */
export const CODEOWNERS_LOCATIONS = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS"] as const;

export interface CodeownersRule {
  pattern: string;
  owners: string[];
  matches: RegExp;
}

/** Findings grouped by the owner of the file they point at. A finding with several owners appears under each. */
export interface OwnerGroups {
  schemaVersion: "evergreen.owners.v1";
  root: string;
  /** The CODEOWNERS file that was read, relative to the root; null when the repository has none. */
  codeowners: string | null;
  owners: { owner: string; findings: Finding[] }[];
  /** Findings in files no CODEOWNERS rule covers, or covered by a rule that names no owner. */
  unowned: Finding[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

/** Translates a gitignore-style CODEOWNERS pattern into a regular expression over repository-relative paths. */
function patternToRegExp(pattern: string): RegExp {
  const directory = pattern.endsWith("/");
  const body = directory ? pattern.slice(0, -1) : pattern;
  const anchored = body.startsWith("/") || body.includes("/");
  const segments = body.replace(/^\//, "").split("/");
  let source = "";
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === "**") {
      source += last ? ".*" : "(?:.*/)?";
      return;
    }
    source += [...segment].map((character) => (character === "*" ? "[^/]*" : character === "?" ? "[^/]" : escapeRegExp(character))).join("");
    if (!last) source += "/";
  });
  // A pattern without a slash matches at any depth. A named directory covers everything beneath it, but as on
  // GitHub a wildcard in the last segment (`docs/*`) matches only that level.
  const covers = directory ? "/.*" : /[*?]/.test(segments[segments.length - 1] ?? "") ? "" : "(?:/.*)?";
  return new RegExp(`^${anchored ? "" : "(?:.*/)?"}${source}${covers}$`);
}

/** Parses CODEOWNERS text. Blank lines and comments are skipped; a pattern with no owners clears ownership for it. */
export function parseCodeowners(text: string): CodeownersRule[] {
  const rules: CodeownersRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (line === "" || line.startsWith("[") || line.startsWith("^[")) continue;
    const [pattern, ...owners] = line.split(/\s+/);
    if (!pattern) continue;
    rules.push({ pattern, owners, matches: patternToRegExp(pattern) });
  }
  return rules;
}

/** The owners of a path: the last rule that matches wins. Empty when no rule matches or the winning rule has no owners. */
export function ownersOf(rules: readonly CodeownersRule[], path: string): string[] {
  const normalized = path.replace(/\\/g, "/").replace(/^\.?\//, "");
  for (let index = rules.length - 1; index >= 0; index -= 1) {
    const rule = rules[index]!;
    if (rule.matches.test(normalized)) return rule.owners;
  }
  return [];
}

export function groupByOwner(result: Pick<ScanResult, "root" | "findings">, rules: readonly CodeownersRule[], codeowners: string | null): OwnerGroups {
  const groups = new Map<string, Finding[]>();
  const unowned: Finding[] = [];
  for (const finding of result.findings) {
    const owners = ownersOf(rules, finding.location.path);
    if (owners.length === 0) unowned.push(finding);
    for (const owner of owners) groups.set(owner, [...(groups.get(owner) ?? []), finding]);
  }
  const owners = [...groups].map(([owner, findings]) => ({ owner, findings })).sort((left, right) => right.findings.length - left.findings.length || left.owner.localeCompare(right.owner));
  return { schemaVersion: "evergreen.owners.v1", root: result.root, codeowners, owners, unowned };
}

/** Reads the repository's CODEOWNERS file, if any, and groups the scan's findings by owner. Reads files only. */
export async function groupScanByOwner(result: Pick<ScanResult, "root" | "findings">): Promise<OwnerGroups> {
  for (const location of CODEOWNERS_LOCATIONS) {
    let text: string;
    try {
      text = await readFile(join(result.root, location), "utf8");
    } catch {
      continue;
    }
    return groupByOwner(result, parseCodeowners(text), location);
  }
  return groupByOwner(result, [], null);
}

export function renderOwnerGroupsText(groups: OwnerGroups): string {
  const total = new Set([...groups.owners.flatMap((group) => group.findings), ...groups.unowned]).size;
  const lines = ["Evergreen scan by owner", `Repository: ${groups.root}`, `Findings: ${total}`, groups.codeowners ? `CODEOWNERS: ${groups.codeowners}` : "CODEOWNERS: none found; every finding is unowned"];
  const section = (title: string, findings: Finding[]): void => {
    lines.push("", `${title} (${findings.length})`);
    for (const finding of findings) {
      const line = finding.location.line ? `:${finding.location.line}` : "";
      lines.push(`  ${finding.severity.toUpperCase()} ${finding.title}`, `    ${finding.location.path}${line}`);
    }
  };
  for (const group of groups.owners) section(group.owner, group.findings);
  if (groups.unowned.length > 0) section("Unowned", groups.unowned);
  return lines.join("\n");
}
