import type { Finding } from "./domain.js";

/**
 * Logins that open pull requests for a coding agent, each seen authoring a public pull request.
 * GitHub's Copilot coding agent authors as `Copilot`; the other apps carry their `[bot]` suffix.
 */
export const DEFAULT_AGENT_AUTHORS = [
  "Copilot",
  "google-labs-jules[bot]",
  "devin-ai-integration[bot]",
  "chatgpt-codex-connector[bot]",
  "claude[bot]",
] as const;

/** The introduced findings a pull request author is responsible for, and the login that matched. */
export interface AgentIntroducedFindings {
  author: string;
  findings: Finding[];
}

const AGENT_SECTION_LIMIT = 10;

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();

function normalizeLogin(login: string): string {
  return login.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Parses the `agent-authors` input: a comma-separated list of logins, `none` to turn the section off,
 * or the known agent bots when the input is empty. Logins compare case-insensitively.
 */
export function parseAgentAuthors(value: string | undefined): ReadonlySet<string> {
  const input = (value ?? "").trim();
  if (input.length === 0) return new Set(DEFAULT_AGENT_AUTHORS.map(normalizeLogin));
  if (input.toLowerCase() === "none") return new Set();
  return new Set(
    input
      .split(",")
      .map(normalizeLogin)
      .filter((login) => login.length > 0),
  );
}

/** True when the pull request author is one of the agent logins. */
export function matchesAgentAuthor(login: string | undefined, authors: ReadonlySet<string>): boolean {
  return login !== undefined && authors.has(normalizeLogin(login));
}

/**
 * The comment section for an agent-authored pull request: each introduced finding with its exact
 * location, rule title, replacement, and evidence, then the line the agent can act on.
 */
export function renderAgentSection(findings: readonly Finding[]): string[] {
  if (findings.length === 0) return [];
  const lines = [
    "## Stale choices this agent introduced",
    "",
    "| Location | Rule | Replacement | Evidence |",
    "|---|---|---|---|",
  ];
  for (const finding of findings.slice(0, AGENT_SECTION_LIMIT)) {
    const source = finding.sources[0];
    const location = `${finding.location.path}${finding.location.line === undefined ? "" : `:${finding.location.line}`}`;
    const replacement = finding.replacement === undefined ? "—" : cell(finding.replacement);
    lines.push(
      `| \`${cell(location)}\` | ${cell(finding.title)} | ${replacement} | ${source ? `[${cell(source.title)}](${source.url})` : "—"} |`,
    );
  }
  if (findings.length > AGENT_SECTION_LIMIT)
    lines.push("", `…and ${findings.length - AGENT_SECTION_LIMIT} more; the JSON report artifact lists every finding.`);
  lines.push("", "Replace these and push again; Evergreen will re-check.", "");
  return lines;
}
