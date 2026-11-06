import {
  commandsOnLine,
  isWorkflowCommandPath,
  workflowCommandFiles,
  workflowCommandPrefix,
  workflowRunLines,
} from "../../detectors/github-actions-workflow-commands.js";
import type { WorkflowCommand, WorkflowRunLine } from "../../detectors/github-actions-workflow-commands.js";
import type { Finding } from "../../domain.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { diffFor } from "./shared/edits.js";
import { insideRepository, readRepositoryFile } from "./shared/source.js";

type Rewrite = { text: string } | { reason: string };

function echoArgument(script: string): { body: string; quote: string } | { reason: string } {
  const match = /^echo[ \t]+(.*)$/.exec(script.trim());
  if (!match?.[1]) return { reason: "Only a standalone single-line echo without options or redirection is rewritten." };
  const argument = match[1];
  const quote = argument.startsWith('"') || argument.startsWith("'") ? argument[0] : "";
  if (quote && !argument.endsWith(quote))
    return { reason: "The echo argument has ambiguous quoting or trailing shell syntax." };
  const body = quote ? argument.slice(1, -1) : argument;
  if (/["'\\\r\n`]/.test(body) || body.includes("$("))
    return {
      reason: "The value contains quotes, escapes, a newline, or command substitution that needs manual migration.",
    };
  if (/%(?:0a|0d|25)/i.test(body))
    return {
      reason: "Percent-encoded newlines or percent signs require decoding and delimiter syntax; migrate manually.",
    };
  if (!quote && /[\s;&|<>$*?()[\]{}]/.test(body.replace(/^::[a-z-]+ name=/, "")))
    return { reason: "The unquoted echo value contains shell syntax or whitespace." };
  return { body, quote: quote ?? "" };
}

function rewrite(entry: WorkflowRunLine, command: WorkflowCommand): Rewrite {
  if (!/^(bash|sh)$/.test(entry.shell))
    return { reason: "The effective shell is not known to be bash or sh; set shell explicitly for an unknown runner." };
  if (!entry.editable)
    return {
      reason: "Folded or multiline scalars, continuations, heredocs, and GitHub expressions need manual migration.",
    };
  const parsedEcho = echoArgument(entry.script);
  if ("reason" in parsedEcho) return parsedEcho;
  const { body, quote } = parsedEcho;
  const pattern =
    command === "add-path" ? /^::add-path::(.*)$/ : new RegExp(`^::${command} name=([A-Za-z_][A-Za-z0-9_-]*)::(.*)$`);
  const parsed = pattern.exec(body);
  if (!parsed) return { reason: "The command is not a simple literal workflow command with one name and value." };
  const value = command === "add-path" ? (parsed[1] ?? "") : `${parsed[1]}=${parsed[2]}`;
  if (command === "add-path" && echoOptionRisk(value, quote))
    return { reason: "The path could be interpreted as an echo option; migrate dynamic paths manually." };
  const outputQuote = quote || '"';
  return { text: `echo ${outputQuote}${value}${outputQuote} >> "$${workflowCommandFiles[command]}"` };
}

function targets(findings: readonly Finding[]): Map<string, Finding[]> {
  const files = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (finding.detector !== "github-actions" || !finding.ruleId.startsWith(workflowCommandPrefix)) continue;
    const list = files.get(finding.location.path) ?? [];
    list.push(finding);
    files.set(finding.location.path, list);
  }
  return files;
}

function editFinding(
  finding: Finding,
  entries: WorkflowRunLine[],
  refuse?: Refuse,
): { start: number; end: number; text: string } | undefined {
  const entry = entries.find((entry) => entry.line === finding.location.line);
  const command =
    entry && commandsOnLine(entry.script).find((command) => finding.ruleId === `${workflowCommandPrefix}${command}`);
  if (!entry || !command) {
    refuse?.(finding, "The finding no longer names a workflow command on a run line.");
    return undefined;
  }
  if (finding.replacement !== `$${workflowCommandFiles[command]}`) {
    refuse?.(finding, "The rule's replacement no longer names the expected environment file.");
    return undefined;
  }
  const result = rewrite(entry, command);
  if ("reason" in result) {
    refuse?.(finding, result.reason);
    return undefined;
  }
  return { start: entry.start, end: entry.end, text: entry.inline ? JSON.stringify(result.text) : result.text };
}

async function planFile(
  root: string,
  path: string,
  findings: Finding[],
  refuse?: Refuse,
): Promise<FilePatch | undefined> {
  const safe = isWorkflowCommandPath(path) && insideRepository(root, path) !== undefined;
  const source = safe ? await readRepositoryFile(root, path) : undefined;
  if (source === undefined || "reason" in source) {
    for (const finding of findings)
      refuse?.(finding, "The workflow path is invalid, unreadable, or lacks a trailing newline.");
    return undefined;
  }
  const before = source.text;
  const entries = workflowRunLines(before, !path.startsWith(".github/workflows/"));
  const edits = findings
    .flatMap((finding) => {
      const edit = editFinding(finding, entries, refuse);
      return edit ? [edit] : [];
    })
    .sort((a, b) => b.start - a.start);
  let text = before;
  let previous = before.length;
  for (const edit of edits) {
    if (edit.end > previous) continue;
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    previous = edit.start;
  }
  return diffFor(path, before, text);
}

/** Plans literal echo migrations only; repository scripts are never executed. */
export const workflowCommandsFixer: Fixer = {
  id: "workflow-commands",
  async plan(result, refuse) {
    const patches: FilePatch[] = [];
    for (const [path, findings] of [...targets(result.findings)].sort(([a], [b]) => a.localeCompare(b))) {
      const patch = await planFile(result.root, path, findings, refuse);
      if (patch) patches.push(patch);
    }
    return patches;
  },
};

function echoOptionRisk(value: string, quote: string): boolean {
  return /^-[eEn]+$/.test(value) || (quote === '"' && value.startsWith("$"));
}
