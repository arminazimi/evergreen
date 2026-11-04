import { readFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../../agent-instructions.js";
import type { Finding } from "../../domain.js";
import type { FilePatch, Fixer } from "../index.js";

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
  const value = match[2]!.trim();
  return value.length === 0
    ? { reason: "The MAINTAINER instruction has no author text to rewrite." }
    : { indent: match[1]!, value };
}

function parseLegacyEnv(line: string): { indent: string; key: string; value: string } | { reason: string } {
  const match = /^(\s*)ENV\s+(\S+)(?:\s+([\s\S]*))?$/i.exec(line);
  if (!match) return { reason: "The line is not an ENV instruction." };
  const key = match[2]!;
  if (key.includes("=")) return { reason: "The ENV instruction already uses the key=value form." };
  const value = (match[3] ?? "").trim().replace(/\s+/g, " ");
  return value.length === 0
    ? { reason: "The ENV instruction has no value to rewrite." }
    : { indent: match[1]!, key, value };
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
    return { text: `${parsed.indent}LABEL org.opencontainers.image.authors="${parsed.value}"${lineEnding(line)}` };
  }
  const parsed = parseLegacyEnv(line);
  if ("reason" in parsed) return parsed;
  if (HEREDOC.test(parsed.value)) return { reason: HEREDOC_REASON };
  if (parsed.value.includes('"')) return { reason: QUOTE_REASON };
  if (parsed.value.includes("\\")) return { reason: BACKSLASH_REASON };
  return { text: `${parsed.indent}ENV ${parsed.key}="${parsed.value}"${lineEnding(line)}` };
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
    const targets = new Map<string, Map<number, Target>>();
    for (const finding of result.findings) {
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

    const patches: FilePatch[] = [];
    for (const [path, lines] of [...targets].sort(([left], [right]) => left.localeCompare(right))) {
      const decline = (reason: string) => {
        for (const target of lines.values()) for (const finding of target.findings) refuse?.(finding, reason);
      };
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) {
        decline("The path resolves outside the repository.");
        continue;
      }
      const before = await readFile(absolute, "utf8").catch(() => undefined);
      if (before === undefined) {
        decline("The Dockerfile could not be read.");
        continue;
      }
      if (!before.endsWith("\n")) {
        decline("The Dockerfile does not end with a newline.");
        continue;
      }
      const refusals = new Map<number, string>();
      const original = before.split("\n");
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
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
      const updated = text.split("\n");
      for (const [line, target] of lines) {
        if (updated[line - 1] !== original[line - 1]) continue;
        const reason = refusals.get(line) ?? "The line no longer carries the deprecated instruction.";
        for (const finding of target.findings) refuse?.(finding, reason);
      }
    }
    return patches;
  },
};
