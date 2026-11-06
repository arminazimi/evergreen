import { basename } from "node:path";

import type { Finding } from "../../domain.js";
import { required } from "../../required.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { diffFor } from "./shared/edits.js";
import { readRepositoryFile } from "./shared/source.js";

const DOCKERFILE = /^(?:Dockerfile|Containerfile)(?:\.[A-Za-z0-9_.-]+)?$|\.(?:Dockerfile|Containerfile)$/;
const MAINTAINER_RULE = "container.dockerfile.maintainer";
const LEGACY_ENV_RULE = "container.dockerfile.legacy-env-format";
const ONBUILD = /^\s*ONBUILD\b/i;
const CONTINUATION = /\\\s*$/;
const HEREDOC = /<<-?\s*["']?[A-Za-z_]/;

const ONBUILD_REASON = "The instruction is inside an ONBUILD trigger, which this codemod does not rewrite.";
const CONTINUATION_REASON = "The instruction continues on another line, which this codemod does not rewrite.";
const HEREDOC_REASON = "The value contains a heredoc, which this codemod does not rewrite.";
const QUOTE_REASON = "The value contains a quote, which this codemod does not rewrite safely.";
const BACKSLASH_REASON = "The value contains a backslash, which this codemod does not rewrite safely.";

interface Target {
  ruleId: string;
  findings: Finding[];
}

type Rewrite = { text: string } | { reason: string };

function lineEnding(line: string): string {
  return line.endsWith("\r") ? "\r" : "";
}

function parseMaintainer(line: string): { indent: string; value: string } | { reason: string } {
  const match = /^(\s*)MAINTAINER\s+([\s\S]*)$/i.exec(line);
  if (!match) return { reason: "The line is not a MAINTAINER instruction." };
  const value = required(match[2], "MAINTAINER author text").trim();
  return value.length === 0
    ? { reason: "The MAINTAINER instruction has no author text to rewrite." }
    : { indent: required(match[1], "MAINTAINER indent"), value };
}

function parseLegacyEnv(line: string): { indent: string; key: string; value: string } | { reason: string } {
  const match = /^(\s*)ENV\s+(\S+)(?:\s+([\s\S]*))?$/i.exec(line);
  if (!match) return { reason: "The line is not an ENV instruction." };
  const key = required(match[2], "ENV key");
  if (key.includes("=")) return { reason: "The ENV instruction already uses the key=value form." };
  const value = (match[3] ?? "").trim().replace(/\s+/g, " ");
  return value.length === 0
    ? { reason: "The ENV instruction has no value to rewrite." }
    : { indent: required(match[1], "ENV indent"), key, value };
}

/** Rewrites one deprecated instruction, or says why quoting it would change its value. */
function rewrite(line: string, ruleId: string): Rewrite {
  if (ONBUILD.test(line)) return { reason: ONBUILD_REASON };
  if (CONTINUATION.test(line)) return { reason: CONTINUATION_REASON };
  if (ruleId === MAINTAINER_RULE) {
    const parsed = parseMaintainer(line);
    if ("reason" in parsed) return parsed;
    if (HEREDOC.test(parsed.value)) return { reason: HEREDOC_REASON };
    if (parsed.value.includes('"')) return { reason: QUOTE_REASON };
    if (parsed.value.includes("\\")) return { reason: BACKSLASH_REASON };
    return {
      text: `${parsed.indent}LABEL org.opencontainers.image.authors="${parsed.value}"${lineEnding(line)}`,
    };
  }
  const parsed = parseLegacyEnv(line);
  if ("reason" in parsed) return parsed;
  if (HEREDOC.test(parsed.value)) return { reason: HEREDOC_REASON };
  if (parsed.value.includes('"')) return { reason: QUOTE_REASON };
  if (parsed.value.includes("\\")) return { reason: BACKSLASH_REASON };
  return {
    text: `${parsed.indent}ENV ${parsed.key}="${parsed.value}"${lineEnding(line)}`,
  };
}

/**
 * Rewrites a Dockerfile `MAINTAINER` instruction to a `LABEL org.opencontainers.image.authors` and the legacy
 * space-separated `ENV key value` form to `ENV key="value"`. A value that contains a quote, a backslash, a line
 * continuation, or a heredoc is left alone and reported through `refuse`, as is any instruction inside an `ONBUILD`
 * trigger.
 */
export const dockerfileLegacyFixer: Fixer = {
  id: "dockerfile-legacy",
  async plan(result, refuse) {
    const targets = legacyTargets(result.findings, refuse);
    const patches: FilePatch[] = [];
    for (const [path, lines] of [...targets].sort(([left], [right]) => left.localeCompare(right))) {
      const patch = await planFile(result.root, path, lines, refuse);
      if (patch !== undefined) patches.push(patch);
    }
    return patches;
  },
};

/** The Dockerfiles that carry a legacy instruction finding, each with its findings by line; a finding without a line is refused. */
function legacyTargets(findings: readonly Finding[], refuse: Refuse | undefined): Map<string, Map<number, Target>> {
  const targets = new Map<string, Map<number, Target>>();
  for (const finding of findings) {
    if (finding.detector !== "container" || !DOCKERFILE.test(basename(finding.location.path))) continue;
    if (finding.ruleId !== MAINTAINER_RULE && finding.ruleId !== LEGACY_ENV_RULE) continue;
    const line = finding.location.line;
    if (line === undefined) {
      refuse?.(finding, "The finding names no line to rewrite.");
      continue;
    }
    const lines = targets.get(finding.location.path) ?? new Map<number, Target>();
    const target = lines.get(line) ?? { ruleId: finding.ruleId, findings: [] };
    target.findings.push(finding);
    lines.set(line, target);
    targets.set(finding.location.path, lines);
  }
  return targets;
}

/** The rewritten Dockerfile patch, or undefined when no instruction changes; declined and unchanged findings are reported. */
async function planFile(
  root: string,
  path: string,
  lines: ReadonlyMap<number, Target>,
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const decline = (reason: string): undefined => {
    for (const target of lines.values()) for (const finding of target.findings) refuse?.(finding, reason);
    return undefined;
  };
  const source = await readRepositoryFile(root, path, "Dockerfile");
  if ("reason" in source) return decline(source.reason);

  const before = source.text;
  const original = before.split("\n");
  const { text, refusals } = rewriteInstructions(original, lines);
  const patch = diffFor(path, before, text);
  const updated = text.split("\n");
  for (const [line, target] of lines) {
    if (updated[line - 1] !== original[line - 1]) continue;
    const reason = refusals.get(line) ?? "The line no longer carries the deprecated instruction.";
    for (const finding of target.findings) refuse?.(finding, reason);
  }
  return patch;
}

/** The file with each targeted instruction rewritten, and the reason each one it left alone was declined. */
function rewriteInstructions(
  original: readonly string[],
  lines: ReadonlyMap<number, Target>,
): { text: string; refusals: Map<number, string> } {
  const refusals = new Map<number, string>();
  const text = original
    .map((line, index) => {
      const target = lines.get(index + 1);
      if (!target) return line;
      const rewritten = rewrite(line, target.ruleId);
      if ("reason" in rewritten) {
        refusals.set(index + 1, rewritten.reason);
        return line;
      }
      return rewritten.text;
    })
    .join("\n");
  return { text, refusals };
}
