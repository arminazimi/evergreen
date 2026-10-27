#!/usr/bin/env node
// Evergreen Claude Code PreToolUse hook for package installs.
//
// Reads a Bash tool payload on stdin. When the command is an npm, pnpm, yarn, pip, or uv
// install that names packages, each one is checked with `evergreen check`. An affected
// package is denied with the reason and replacement. Non-install commands, packages with
// no rule, and check failures never block. Set EVERGREEN_SKIP=1 to skip the hook.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const PACKAGE_SPEC = "evergreen-deprecation";

const NPM_INSTALL = new Set(["install", "i", "add", "in", "ins"]);
const PNPM_INSTALL = new Set(["add", "install", "i"]);
const VALUE_FLAGS = new Set([
  "-w",
  "--workspace",
  "--prefix",
  "--tag",
  "--cache",
  "--loglevel",
  "--registry",
  "--omit",
  "--include",
  "--scope",
  "-r",
  "--requirement",
  "--requirements",
  "-c",
  "--constraint",
  "-i",
  "--index-url",
  "--extra-index-url",
  "-f",
  "--find-links",
  "-t",
  "--target",
  "--python",
  "--python-version",
  "--platform",
  "--implementation",
  "--abi",
  "--root",
  "-C",
  "--config-settings",
  "--with",
  "--directory",
]);

/** Splits a Bash command into top-level segments on `&&`, `||`, and `;` (quotes kept intact). */
export function shellSegments(command) {
  const segments = [];
  let current = "";
  let quote;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote !== undefined) {
      current += char;
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if ((char === "&" || char === "|") && command[index + 1] === char) {
      if (current.trim()) segments.push(current.trim());
      current = "";
      index += 1;
      continue;
    }
    if (char === ";") {
      if (current.trim()) segments.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) segments.push(current.trim());
  return segments;
}

function tokenize(segment) {
  const tokens = [];
  let current = "";
  let quote;
  for (const char of segment) {
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

function lowerBound(spec) {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(spec ?? "");
  if (!match) return undefined;
  return `${match[1]}.${match[2] ?? "0"}.${match[3] ?? "0"}`;
}

function npmPackage(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("~")) return undefined;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(spec)) return undefined;
  let name;
  let version;
  if (spec.startsWith("@")) {
    const slash = spec.indexOf("/");
    if (slash <= 1) return undefined;
    const at = spec.indexOf("@", slash + 1);
    name = at === -1 ? spec : spec.slice(0, at);
    version = at === -1 ? undefined : spec.slice(at + 1);
  } else {
    const at = spec.indexOf("@");
    name = at === -1 ? spec : spec.slice(0, at);
    version = at === -1 ? undefined : spec.slice(at + 1);
  }
  if (!/^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/.test(name)) return undefined;
  const encoded = name.startsWith("@") ? `%40${name.slice(1)}` : name;
  return { purl: `pkg:npm/${encoded.toLowerCase()}`, version: lowerBound(version), spec };
}

function pypiPackage(spec) {
  const match = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:(===|==|~=|>=|<=|!=|>|<)\s*([0-9][^\s;#,]*))?/.exec(spec);
  if (!match) return undefined;
  const exact = match[2] === "==" || match[2] === "===" || match[2] === "~=" || match[2] === ">=";
  return {
    purl: `pkg:pypi/${match[1].toLowerCase().replace(/_/g, "-")}`,
    version: exact ? lowerBound(match[3]) : undefined,
    spec,
  };
}

function skipLeading(tokens) {
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][\w]*=/.test(tokens[index])) index += 1;
  if (tokens[index] === "sudo") index += 1;
  return index;
}

function collectArgs(tokens, start) {
  const packages = [];
  let afterTerminator = false;
  for (let index = start; index < tokens.length; index += 1) {
    const argument = tokens[index];
    if (afterTerminator) continue;
    if (argument === "--") {
      afterTerminator = true;
      continue;
    }
    if (argument.startsWith("-")) {
      if (VALUE_FLAGS.has(argument)) index += 1;
      continue;
    }
    packages.push(argument);
  }
  return packages;
}

/**
 * Registry packages named by one shell segment that is an install command.
 * Returns an empty list for non-install commands and for installs with no package arguments.
 */
export function packagesFromSegment(segment) {
  const tokens = tokenize(segment);
  let index = skipLeading(tokens);
  if (index >= tokens.length) return [];

  if ((tokens[index] === "python" || tokens[index] === "python3" || tokens[index] === "py") && tokens[index + 1] === "-m" && tokens[index + 2] === "pip") {
    index += 3;
    if (tokens[index] !== "install") return [];
    return collectArgs(tokens, index + 1).flatMap((spec) => {
      const entry = pypiPackage(spec);
      return entry ? [entry] : [];
    });
  }

  const manager = tokens[index];
  index += 1;
  if (manager === "npm") {
    if (!NPM_INSTALL.has(tokens[index])) return [];
    return collectArgs(tokens, index + 1).flatMap((spec) => {
      const entry = npmPackage(spec);
      return entry ? [entry] : [];
    });
  }
  if (manager === "pnpm") {
    if (!PNPM_INSTALL.has(tokens[index])) return [];
    return collectArgs(tokens, index + 1).flatMap((spec) => {
      const entry = npmPackage(spec);
      return entry ? [entry] : [];
    });
  }
  if (manager === "yarn") {
    if (tokens[index] === "global") index += 1;
    if (tokens[index] !== "add") return [];
    return collectArgs(tokens, index + 1).flatMap((spec) => {
      const entry = npmPackage(spec);
      return entry ? [entry] : [];
    });
  }
  if (manager === "pip" || manager === "pip3") {
    if (tokens[index] !== "install") return [];
    return collectArgs(tokens, index + 1).flatMap((spec) => {
      const entry = pypiPackage(spec);
      return entry ? [entry] : [];
    });
  }
  if (manager === "uv") {
    if (tokens[index] === "pip" && tokens[index + 1] === "install") {
      return collectArgs(tokens, index + 2).flatMap((spec) => {
        const entry = pypiPackage(spec);
        return entry ? [entry] : [];
      });
    }
    if (tokens[index] === "add") {
      return collectArgs(tokens, index + 1).flatMap((spec) => {
        const entry = pypiPackage(spec);
        return entry ? [entry] : [];
      });
    }
  }
  return [];
}

/** Every registry package an install command in this Bash line would add. */
export function installPackages(command) {
  const found = new Map();
  for (const segment of shellSegments(String(command ?? ""))) {
    for (const entry of packagesFromSegment(segment)) {
      const key = `${entry.purl}@${entry.version ?? ""}`;
      if (!found.has(key)) found.set(key, entry);
    }
  }
  return [...found.values()];
}

function parseCheckCommand(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      // Not JSON: split it as words below.
    }
  }
  const words = [];
  let word;
  let quoted = false;
  for (const char of trimmed) {
    if (char === '"') {
      quoted = !quoted;
      word ??= "";
    } else if (!quoted && /\s/.test(char)) {
      if (word !== undefined) words.push(word);
      word = undefined;
    } else {
      word = (word ?? "") + char;
    }
  }
  if (word !== undefined) words.push(word);
  return words;
}

function checkCommand() {
  const override = process.env.EVERGREEN_CHECK_COMMAND;
  const words = override ? parseCheckCommand(override) : [];
  if (words.length > 0) return words;
  return ["npx", "--yes", "--package", PACKAGE_SPEC, "evergreen"];
}

function shellWord(word) {
  return process.platform === "win32" && /\s/.test(word) ? `"${word}"` : word;
}

function runCheck(purl, version) {
  const [command, ...args] = checkCommand().map(shellWord);
  const target = version ? `${purl}@${version}` : purl;
  const result = spawnSync(command, [...args, "check", target, "--json", "--fail-on", "none"], {
    encoding: "utf8",
    timeout: 45_000,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return { error: (result.stderr || result.error?.message || "evergreen check failed").trim().split("\n")[0] };
  try {
    return { check: JSON.parse(result.stdout) };
  } catch {
    return { error: "evergreen check returned unreadable output" };
  }
}

export function denialFor(check) {
  const top = check.findings[0];
  const subject = check.version ? `${check.purl}@${check.version}` : check.purl;
  const lines = [`Evergreen blocked this install: ${subject} — ${top.title} (${top.severity}, ${top.event}).`, top.summary];
  if (top.replacement) lines.push(`Replacement: ${top.replacement}.`);
  if (top.deadline) lines.push(`Deadline: ${top.deadline}.`);
  for (const source of top.sources.slice(0, 2)) lines.push(`Evidence: ${source.url}`);
  return lines.join("\n");
}

/** Denies a Bash install when any named package is affected; otherwise returns undefined. */
export function run(payload, runner = runCheck) {
  if (process.env.EVERGREEN_SKIP) return undefined;
  const command = payload?.tool_input?.command;
  if (typeof command !== "string") return undefined;
  if (payload?.tool_name && payload.tool_name !== "Bash") return undefined;

  const blockers = [];
  for (const { purl, version } of installPackages(command)) {
    const { check, error } = runner(purl, version);
    if (error || check?.status !== "affected" || !check.findings?.[0]) continue;
    blockers.push(check);
  }
  if (blockers.length === 0) return undefined;

  const reason = blockers.map(denialFor).join("\n\n");
  return {
    systemMessage: `Evergreen blocked ${blockers.length} deprecated or end-of-life package${blockers.length === 1 ? "" : "s"} before install.`,
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = run(JSON.parse(readFileSync(0, "utf8")));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // A guardrail must never break the tool call it observes when the payload is unreadable.
  }
}
