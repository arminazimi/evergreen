#!/usr/bin/env node
// Evergreen dependency guard for coding-agent hooks.
//
// Reads a hook payload on stdin (an edit or write of a file), finds the dependencies that edit ADDED to a
// manifest or workflow, asks `evergreen check` about each one, and prints a warning that cites the
// evidence. It never blocks and never edits anything: a hook that fails or finds nothing exits 0 quietly.
// The check runs locally against the lifecycle rules bundled with the pinned Evergreen release.

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Replaced with the exact release when the plugin package is generated.
const PACKAGE_SPEC = "evergreen-deprecation@0.1.0";

const NON_DEPENDENCY_KEYS = new Set(["name", "version", "description", "main", "module", "types", "type", "license", "author", "homepage", "repository", "bugs", "packageManager", "node", "npm", "engines"]);

function manifestKind(path) {
  const name = basename(path);
  if (name === "package.json") return "npm";
  if (/^(requirements|constraints)[\w.-]*\.txt$/i.test(name) || name === "pyproject.toml") return name === "pyproject.toml" ? "pyproject" : "requirements";
  if (/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(path.replaceAll("\\", "/")) || /^action\.ya?ml$/i.test(name)) return "workflow";
  return undefined;
}

/** "^2.88.2" -> "2.88.2", ">=1.4" -> "1.4.0", "latest" -> undefined: the lower bound a range names. */
function lowerBound(spec) {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(spec ?? "");
  if (!match) return undefined;
  return `${match[1]}.${match[2] ?? "0"}.${match[3] ?? "0"}`;
}

function npmDependencies(text) {
  const found = new Map();
  for (const match of text.matchAll(/"((?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*)"\s*:\s*"([^"]*)"/gi)) {
    const [, name, spec] = match;
    if (NON_DEPENDENCY_KEYS.has(name)) continue;
    if (!/^[~^<>=*vV]*\s*\d|^latest$|^\*$|^npm:|^workspace:|^x$/.test(spec)) continue;
    const scoped = name.startsWith("@") ? `%40${name.slice(1)}` : name;
    found.set(`pkg:npm/${scoped.toLowerCase()}`, lowerBound(spec));
  }
  return found;
}

const REQUIREMENT = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:(===|==|~=|>=|<=|!=|>|<)\s*([0-9][^\s;#,]*))?/;

function requirementDependencies(text) {
  const found = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-") || /^[a-z]+:\/\//i.test(trimmed)) continue;
    const match = REQUIREMENT.exec(trimmed);
    if (!match) continue;
    const exact = match[2] === "==" || match[2] === "===" || match[2] === "~=" || match[2] === ">=";
    found.set(`pkg:pypi/${match[1].toLowerCase().replace(/_/g, "-")}`, exact ? lowerBound(match[3]) : undefined);
  }
  return found;
}

function pyprojectDependencies(text) {
  const found = new Map();
  for (const match of text.matchAll(/["']([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(?:(===|==|~=|>=|<=|!=|>|<)\s*([0-9][^"',;\s]*))?[^"']*["']/g)) {
    const exact = match[2] === "==" || match[2] === "===" || match[2] === "~=" || match[2] === ">=";
    found.set(`pkg:pypi/${match[1].toLowerCase().replace(/_/g, "-")}`, exact ? lowerBound(match[3]) : undefined);
  }
  return found;
}

function workflowDependencies(text) {
  const found = new Map();
  for (const match of text.matchAll(/uses:\s*["']?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/[^@\s"']*)?@(v?\d+(?:\.\d+){0,2})\b/g)) {
    found.set(`pkg:github/${match[1].toLowerCase()}/${match[2].toLowerCase()}`, match[3]);
  }
  return found;
}

/** The dependencies named in a piece of manifest text, as a map of PURL -> version (or undefined). */
export function dependenciesIn(path, text) {
  switch (manifestKind(path)) {
    case "npm": return npmDependencies(text);
    case "requirements": return requirementDependencies(text);
    case "pyproject": return pyprojectDependencies(text);
    case "workflow": return workflowDependencies(text);
    default: return new Map();
  }
}

/** Dependencies present after an edit that were not present before it, so unchanged ones are never re-checked. */
export function addedDependencies(path, before, after) {
  const previous = dependenciesIn(path, before ?? "");
  const added = [];
  for (const [purl, version] of dependenciesIn(path, after ?? "")) {
    if (!previous.has(purl) || previous.get(purl) !== version) added.push({ purl, version });
  }
  return added;
}

/** What a hook payload added: the file, and the dependencies its edit introduced. */
export function changesFrom(payload, readPrevious = () => "") {
  const input = payload?.tool_input ?? {};
  const path = input.file_path;
  if (typeof path !== "string" || !manifestKind(path)) return { path, added: [] };
  switch (payload.tool_name) {
    case "Edit":
      return { path, added: addedDependencies(path, input.old_string, input.new_string) };
    case "MultiEdit":
      return { path, added: (input.edits ?? []).flatMap((edit) => addedDependencies(path, edit.old_string, edit.new_string)) };
    case "Write":
      return { path, added: addedDependencies(path, readPrevious(path), input.content) };
    default:
      return { path, added: [] };
  }
}

function checkCommand() {
  const override = process.env.EVERGREEN_CHECK_COMMAND;
  if (override) return override.split(/\s+/).filter(Boolean);
  return ["npx", "--yes", "--package", PACKAGE_SPEC, "evergreen"];
}

function runCheck(purl, version) {
  const [command, ...args] = checkCommand();
  const target = version ? `${purl}@${version}` : purl;
  const result = spawnSync(command, [...args, "check", target, "--json", "--fail-on", "none"], { encoding: "utf8", timeout: 45_000, shell: process.platform === "win32" });
  if (result.status !== 0) return { error: (result.stderr || result.error?.message || "evergreen check failed").trim().split("\n")[0] };
  try {
    return { check: JSON.parse(result.stdout) };
  } catch {
    return { error: "evergreen check returned unreadable output" };
  }
}

export function warningFor(check) {
  const top = check.findings[0];
  const subject = check.version ? `${check.purl}@${check.version}` : check.purl;
  const lines = [`Evergreen: ${subject} — ${top.title} (${top.severity}, ${top.event}).`, top.summary];
  if (top.replacement) lines.push(`Replacement: ${top.replacement}.`);
  if (top.deadline) lines.push(`Deadline: ${top.deadline}.`);
  for (const source of top.sources.slice(0, 2)) lines.push(`Evidence: ${source.url}`);
  return lines.join("\n");
}

function gitPrevious(cwd) {
  return (path) => {
    try {
      const relativePath = isAbsolute(path) ? relative(cwd, path) : path;
      return execFileSync("git", ["show", `HEAD:${relativePath.replaceAll("\\", "/")}`], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return "";
    }
  };
}

export function run(payload, runner = runCheck) {
  const cwd = resolve(payload?.cwd ?? process.cwd());
  const { added } = changesFrom(payload, gitPrevious(cwd));
  const warnings = [];
  const problems = [];
  for (const { purl, version } of added) {
    const { check, error } = runner(purl, version);
    if (error) problems.push(`${purl}: ${error}`);
    else if (check.status === "affected") warnings.push(warningFor(check));
  }
  if (warnings.length === 0 && problems.length === 0) return undefined;
  const note = problems.length > 0 ? [`Evergreen could not check: ${problems.join("; ")}.`] : [];
  const body = [...warnings, ...note].join("\n\n");
  return {
    systemMessage: warnings.length > 0 ? `Evergreen found ${warnings.length} deprecated dependenc${warnings.length === 1 ? "y" : "ies"} in this edit.` : "Evergreen could not check this edit.",
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `${body}\n\nTell the user about this and prefer the replacement unless they have a reason to keep the dependency.`,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const output = run(JSON.parse(readFileSync(0, "utf8")));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // A guardrail must never break the edit it observes.
  }
}
