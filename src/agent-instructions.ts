/** The section `evergreen init --agents` keeps in a repository's AGENTS.md or CLAUDE.md. */

export const SECTION_BEGIN = "<!-- evergreen:begin -->";
export const SECTION_END = "<!-- evergreen:end -->";

/** The instructions themselves; `examples/agents/dependency-check.md` carries the same text for hosts configured by hand. */
export const DEPENDENCY_CHECK_INSTRUCTIONS = `Before you add a new package, runtime, or GitHub Action to this project, or pick one to replace another, check it with Evergreen.

- Call the \`check_dependency\` tool with a Package URL, for example \`pkg:npm/request@2.88.2\`, \`pkg:pypi/nose\`, or \`pkg:github/actions/checkout@v4\`. Without MCP, run \`npx evergreen-deprecation check <purl>\`.
- If the status is \`affected\`, prefer the replacement it names and tell the user why, citing the evidence links it returns.
- \`version-dependent\` means rules exist only for some versions: call again with the version you intend to use. \`no-data\` means Evergreen has no rule for that package; it is not a claim that the package is safe.
- Do not use Evergreen for security vulnerability audits or for routine upgrades of dependencies the project already uses.
`;

export const AGENT_SECTION = `${SECTION_BEGIN}
<!-- This section is maintained by \`evergreen init --agents\`. Edit around it, not inside it. -->
## Evergreen dependency check

${DEPENDENCY_CHECK_INSTRUCTIONS}${SECTION_END}`;

export class AgentFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentFileError";
  }
}

export interface SectionUpdate {
  text: string;
  change: "created" | "added" | "updated" | "unchanged";
}

/**
 * Returns `existing` with the Evergreen section added or refreshed. Everything outside the markers is preserved
 * byte for byte, including the file's line endings; a file with damaged markers is refused rather than guessed at.
 */
export function withAgentSection(existing: string | undefined): SectionUpdate {
  if (existing === undefined || existing.length === 0) return { text: `${AGENT_SECTION}\n`, change: "created" };

  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const section = AGENT_SECTION.replaceAll("\n", newline);
  const begins = existing.split(SECTION_BEGIN).length - 1;
  const ends = existing.split(SECTION_END).length - 1;
  if (begins === 0 && ends === 0) {
    const separator = existing.endsWith(newline) ? newline : `${newline}${newline}`;
    return { text: `${existing}${separator}${section}${newline}`, change: "added" };
  }
  if (begins !== 1 || ends !== 1) {
    throw new AgentFileError(`The file has ${begins} "${SECTION_BEGIN}" and ${ends} "${SECTION_END}" markers; there must be exactly one of each. Fix them by hand and run the command again. Nothing was changed.`);
  }
  const start = existing.indexOf(SECTION_BEGIN);
  const end = existing.indexOf(SECTION_END);
  if (end < start) throw new AgentFileError(`The "${SECTION_END}" marker comes before "${SECTION_BEGIN}". Fix them by hand and run the command again. Nothing was changed.`);
  const text = `${existing.slice(0, start)}${section}${existing.slice(end + SECTION_END.length)}`;
  return { text, change: text === existing ? "unchanged" : "updated" };
}

/** A small unified diff of the one region that changes, with two lines of context. */
export function renderDiff(file: string, before: string, after: string): string {
  const old = before.split("\n");
  const next = after.split("\n");
  let prefix = 0;
  while (prefix < old.length && prefix < next.length && old[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < old.length - prefix && suffix < next.length - prefix && old[old.length - 1 - suffix] === next[next.length - 1 - suffix]) suffix++;
  const contextStart = Math.max(0, prefix - 2);
  const contextEnd = Math.min(suffix, 2);
  const removed = old.slice(prefix, old.length - suffix);
  const added = next.slice(prefix, next.length - suffix);
  const head = old.slice(contextStart, prefix);
  const tail = old.slice(old.length - suffix, old.length - suffix + contextEnd);
  const oldCount = head.length + removed.length + tail.length;
  const newCount = head.length + added.length + tail.length;
  return [
    `--- a/${file}`,
    `+++ b/${file}`,
    `@@ -${contextStart + 1},${oldCount} +${contextStart + 1},${newCount} @@`,
    ...head.map((line) => ` ${line}`),
    ...removed.map((line) => `-${line}`),
    ...added.map((line) => `+${line}`),
    ...tail.map((line) => ` ${line}`),
  ].join("\n");
}
