// Checks rule files before CI does: schema, date order, source URLs, duplicate ids, and replacement requirements,
// each with the file, the line, and a fix hint.
//
//   evergreen rules lint [file...]
//
// With no file arguments it checks every registry under `registry/`, so a contributor can run it after editing one.

import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { registryV2Issues } from "./registry.js";

export interface RuleLintIssue {
  /** The path as the caller gave it, or repository-relative for files found by {@link defaultRuleFiles}. */
  file: string;
  /** 1-based line of the rule or field the message is about. */
  line: number;
  ruleId?: string;
  message: string;
  hint: string;
}

export interface RuleLintResult {
  files: string[];
  rules: number;
  issues: RuleLintIssue[];
}

/** Files under `registry/` that are not lifecycle registries. */
const NOT_A_REGISTRY = new Set(["sources.lock.json"]);

function isRegistryFile(name: string): boolean {
  return name.endsWith(".json") && !NOT_A_REGISTRY.has(name) && !name.endsWith("-shas.json");
}

/** Every lifecycle registry under `root/registry`, in a stable order. */
export async function defaultRuleFiles(root = process.cwd()): Promise<string[]> {
  const directory = join(root, "registry");
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isRegistryFile(entry.name))
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function displayPath(file: string): string {
  const path = relative(process.cwd(), resolve(file));
  return path === "" ? file : path.replaceAll("\\", "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Starts of every line, so a byte offset becomes a 1-based line number without rescanning the text. */
function lineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) starts.push(index + 1);
  return starts;
}

function lineAt(starts: readonly number[], index: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (starts[middle]! <= index) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

const escapePattern = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface RuleSpan {
  start: number;
  end: number;
}

/** The text range of each rule, found by its id in document order, so issues point inside the right rule. */
function ruleSpans(text: string, rules: readonly unknown[]): RuleSpan[] {
  const spans: RuleSpan[] = [];
  let cursor = 0;
  for (const rule of rules) {
    const id = isRecord(rule) && typeof rule.id === "string" ? rule.id : undefined;
    let start = cursor;
    if (id !== undefined) {
      const pattern = new RegExp(`"id"\\s*:\\s*"${escapePattern(id)}"`, "g");
      pattern.lastIndex = cursor;
      const match = pattern.exec(text);
      if (match) start = match.index;
    }
    spans.push({ start, end: text.length });
    cursor = start + 1;
  }
  for (let index = 0; index < spans.length - 1; index += 1) spans[index]!.end = spans[index + 1]!.start;
  return spans;
}

const RULE_MESSAGE = /^rule "([^"]+)": (.*)$/s;
const INDEX_MESSAGE = /^rules\[(\d+)\]: (.*)$/s;

/** The field a schema message is about, so the hint can point at its line: `sources[0].url` is `sources`. */
function fieldOf(message: string): string | undefined {
  const unknown = /^unknown field "([^"]+)"/.exec(message);
  if (unknown) return unknown[1];
  return /^([a-zA-Z][a-zA-Z0-9]*)/.exec(message)?.[1];
}

function lineFor(text: string, starts: readonly number[], span: RuleSpan, field: string | undefined): number {
  if (field !== undefined) {
    const index = text.indexOf(`"${field}"`, span.start);
    if (index !== -1 && index < span.end) return lineAt(starts, index);
  }
  return lineAt(starts, span.start);
}

function hintFor(message: string): string {
  const hints: Array<[RegExp, string]> = [
    [/^id is duplicated/, "Rule ids are global; keep one definition and rename the other."],
    [/^id must use/, 'Use lowercase letters, numbers, dots, and hyphens, for example "npm.package.name.deprecated".'],
    [/^sources\[\d+\]\.url must be an https URL/, "Link the authoritative notice over https; http and relative URLs are not evidence."],
    [/^provenance\.reviewedAt must not be earlier/, "Set reviewedAt to the date you last checked the sources; it cannot precede observedAt."],
    [/must be a valid date/, "Write a real calendar date as YYYY-MM-DD."],
    [/^purl must be canonical/, "Write the version-less canonical PURL, for example pkg:npm/request."],
    [/^purl is invalid/, "See the Package URL specification; the name must be percent-encoded when it is scoped."],
    [/^vers is invalid/, "Write a canonical VERS range such as vers:npm/>=2.0.0|<3.0.0."],
    [/^vers scheme/, "Use a version scheme that fits the purl type named in the message."],
    [/^severity must be one of/, "Use info, low, medium, high, or critical."],
    [/^event must be one of/, "Use deprecated, end-of-support, end-of-life, removed, or scheduled-end-of-life."],
    [/^a scheduled-end-of-life rule/, "Give the announced date as deadline and set severity to low (decision 0010)."],
    [/^requires has unknown runtime/, "Only node and python are known runtimes; drop the entry or open an issue to add one."],
    [/^unknown field/, "Remove the field, or name it x-<ecosystem> when it is a matching hint for one detector."],
    [/ is required$/, "Add the field; every rule needs it. See docs/RULES.md for the field reference."],
    [/^ecosystem ".*" does not match/, "Set the rule ecosystem to the registry ecosystem."],
    [/^provenance\./i, 'Record who reviewed the rule and when. See docs/RULES.md, "Provenance".'],
    [/^migration is not valid/, "Check migration constraints, steps, and verification commands against docs/RULES.md."],
    [/^usage must be/, "Check each usage matcher: kind, language, and the fields that kind needs."],
  ];
  for (const [pattern, hint] of hints) if (pattern.test(message)) return hint;
  return "See the field reference in docs/RULES.md.";
}

/**
 * The offset of the first unbalanced bracket or unterminated string. Node's JSON error no longer carries a position,
 * and this finds most syntax mistakes so the message can still name a line.
 */
function structuralProblemOffset(text: string): number {
  const stack: Array<{ char: string; offset: number }> = [];
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      stringStart = index;
      continue;
    }
    if (char === "{" || char === "[") stack.push({ char, offset: index });
    else if (char === "}" || char === "]") {
      const open = stack.pop();
      if (open === undefined || (open.char === "{" ? "}" : "]") !== char) return index;
    }
  }
  if (inString) return stringStart;
  return stack.at(-1)?.offset ?? 0;
}

function syntaxErrorLine(text: string, starts: readonly number[], message: string): number {
  const position = /position (\d+)/.exec(message);
  if (position) return lineAt(starts, Number(position[1]));
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  return lineAt(starts, structuralProblemOffset(text));
}

interface FileResult {
  rules: number;
  issues: RuleLintIssue[];
  /** Rule ids with their line, for the cross-file duplicate check. */
  ids: Array<{ id: string; line: number }>;
}

async function lintFile(file: string): Promise<FileResult> {
  const shown = displayPath(file);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return {
      rules: 0,
      ids: [],
      issues: [{ file: shown, line: 1, message: `cannot read the file: ${(error as Error).message}`, hint: "Check the path and file permissions." }],
    };
  }
  const starts = lineStarts(text);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = (error as Error).message;
    return {
      rules: 0,
      ids: [],
      issues: [{ file: shown, line: syntaxErrorLine(text, starts, message), message: `invalid JSON: ${message}`, hint: "Fix the JSON syntax; the linter needs a valid document before it can check rules." }],
    };
  }

  const issues: RuleLintIssue[] = [];
  const rules = isRecord(value) && Array.isArray(value.rules) ? value.rules : [];
  const spans = ruleSpans(text, rules);

  for (const message of registryV2Issues(value)) {
    const rule = RULE_MESSAGE.exec(message);
    if (rule) {
      const index = rules.findIndex((candidate) => isRecord(candidate) && candidate.id === rule[1]);
      const span = spans[index] ?? { start: 0, end: text.length };
      issues.push({
        file: shown,
        line: lineFor(text, starts, span, fieldOf(rule[2]!)),
        ruleId: rule[1]!,
        message,
        hint: hintFor(rule[2]!),
      });
      continue;
    }
    const indexed = INDEX_MESSAGE.exec(message);
    const span = indexed ? spans[Number(indexed[1])] : undefined;
    issues.push({
      file: shown,
      line: span ? lineAt(starts, span.start) : 1,
      message,
      hint: hintFor(indexed?.[2] ?? message),
    });
  }

  const ids: FileResult["ids"] = [];
  rules.forEach((candidate, index) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string") return;
    ids.push({ id: candidate.id, line: lineAt(starts, spans[index]!.start) });
  });
  return { rules: rules.length, issues, ids };
}

/**
 * Lints the given registry files. Every problem is an error; there are no warnings, so an empty list means the
 * files are safe to commit.
 */
export async function lintRuleFiles(files: readonly string[]): Promise<RuleLintResult> {
  const results = await Promise.all(files.map((file) => lintFile(file)));
  const issues = results.flatMap((result) => result.issues);

  const firstUse = new Map<string, { file: string; line: number }>();
  results.forEach((result, index) => {
    const file = files[index]!;
    for (const { id, line } of result.ids) {
      const first = firstUse.get(id);
      if (first === undefined) {
        firstUse.set(id, { file, line });
        continue;
      }
      if (resolve(first.file) === resolve(file)) continue;
      issues.push({
        file: displayPath(file),
        line,
        ruleId: id,
        message: `duplicate rule id "${id}": first defined in ${displayPath(first.file)}:${first.line}`,
        hint: "Rule ids are global; keep one definition and rename the other.",
      });
    }
  });

  return {
    files: files.map((file) => displayPath(file)),
    rules: results.reduce((total, result) => total + result.rules, 0),
    issues: issues.sort(
      (left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.message.localeCompare(right.message),
    ),
  };
}

export function renderRuleLintText(result: RuleLintResult): string {
  if (result.issues.length === 0) {
    return `Checked ${result.rules} rule${result.rules === 1 ? "" : "s"} in ${result.files.length} file${result.files.length === 1 ? "" : "s"}: no problems.`;
  }
  const lines = result.issues.map((issue) => `${issue.file}:${issue.line}: ${issue.message}\n  hint: ${issue.hint}`);
  const filesWithProblems = new Set(result.issues.map((issue) => issue.file)).size;
  return [
    ...lines,
    "",
    `${result.issues.length} problem${result.issues.length === 1 ? "" : "s"} in ${filesWithProblems} of ${result.files.length} file${result.files.length === 1 ? "" : "s"}.`,
  ].join("\n");
}
