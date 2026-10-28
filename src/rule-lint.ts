import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import { REGISTRY_V2_SCHEMA_VERSION, registryV2Issues } from "./registry.js";

export const RULE_LINT_SCHEMA_VERSION = "evergreen.rules-lint.v1" as const;

export type RuleLintKind = "schema" | "dates" | "source-url" | "duplicate-id" | "replacement-reference";

/** One problem in a registry file, located for an editor or a reviewer. */
export interface RuleLintProblem {
  file: string;
  line: number;
  kind: RuleLintKind;
  ruleId?: string;
  message: string;
  hint: string;
}

export interface RuleLintResult {
  schemaVersion: typeof RULE_LINT_SCHEMA_VERSION;
  files: string[];
  problems: RuleLintProblem[];
}

export interface RuleLintFile {
  /** Path used in the report, relative to the working directory where possible. */
  path: string;
  text: string;
}

export class RuleLintError extends Error {}

type UnknownRecord = Record<string, unknown>;

const HINTS: Record<RuleLintKind, string> = {
  schema: "Match the field to schemas/registry.v2.schema.json; docs/RULES.md lists every allowed field and value.",
  dates: "Use real YYYY-MM-DD dates, and set reviewedAt to observedAt or later.",
  "source-url": "Cite an https:// URL; http and other schemes are rejected by validation and CI.",
  "duplicate-id": "Rule ids are stable and globally unique; rename one rule instead of reusing an id.",
  "replacement-reference": "Point replacement at an existing rule id, or write the guidance as prose.",
};

const RULE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const FIELD = /\b(?:schemaVersion|ecosystem|freshness(?:\.[A-Za-z][A-Za-z0-9]*)?|id|purl|vers|event|title|summary|severity|replacement|requires(?:\.[A-Za-z]+)?|deadline|sources(?:\[\d+\](?:\.[A-Za-z]+)?)?|provenance(?:\.[A-Za-z]+)?|migration|usage)\b/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Lines of every JSON path in `text`, for example `rules.2.provenance.reviewedAt`.
 * The scan only tracks structure: parsing and validation still belong to the registry code.
 */
export function jsonLocations(text: string): Map<string, number> {
  const locations = new Map<string, number>();
  let index = 0;
  let line = 1;

  const skipWhitespace = (): void => {
    while (index < text.length) {
      const character = text[index]!;
      if (character === "\n") {
        line += 1;
        index += 1;
      } else if (character === " " || character === "\t" || character === "\r") {
        index += 1;
      } else {
        return;
      }
    }
  };

  const readString = (): string => {
    index += 1;
    let value = "";
    while (index < text.length) {
      const character = text[index]!;
      if (character === '"') {
        index += 1;
        return value;
      }
      if (character !== "\\") {
        value += character;
        index += 1;
        continue;
      }
      const escaped = text[index + 1];
      index += 2;
      if (escaped === "u") {
        value += String.fromCharCode(Number.parseInt(text.slice(index, index + 4), 16));
        index += 4;
      } else {
        value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped === "r" ? "\r" : escaped === "b" ? "\b" : escaped === "f" ? "\f" : (escaped ?? "");
      }
    }
    return value;
  };

  const record = (path: string, atLine: number): void => {
    if (!locations.has(path)) locations.set(path, atLine);
  };

  const parseValue = (path: string): void => {
    skipWhitespace();
    record(path, line);
    const character = text[index];
    if (character === "{") {
      index += 1;
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return;
      }
      while (index < text.length) {
        skipWhitespace();
        if (text[index] !== '"') throw new SyntaxError(`Expected a property name at line ${line}`);
        const key = readString();
        skipWhitespace();
        if (text[index] !== ":") throw new SyntaxError(`Expected ":" at line ${line}`);
        index += 1;
        parseValue(path === "" ? key : `${path}.${key}`);
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === "}") {
          index += 1;
          return;
        }
        throw new SyntaxError(`Expected "," or "}" at line ${line}`);
      }
      return;
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return;
      }
      let item = 0;
      while (index < text.length) {
        parseValue(`${path}.${item}`);
        item += 1;
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        if (text[index] === "]") {
          index += 1;
          return;
        }
        throw new SyntaxError(`Expected "," or "]" at line ${line}`);
      }
      return;
    }
    if (character === '"') {
      readString();
      return;
    }
    while (index < text.length && !",]}".includes(text[index]!)) {
      if (text[index] === "\n") line += 1;
      index += 1;
    }
  };

  try {
    parseValue("");
  } catch {
    // A malformed file is reported by the JSON parse; a partial map still locates earlier fields.
  }
  return locations;
}

function lineFor(locations: Map<string, number>, path: string, fallback: number): number {
  let current = path;
  while (current !== "") {
    const line = locations.get(current);
    if (line !== undefined) return line;
    const separator = current.lastIndexOf(".");
    if (separator === -1) break;
    current = current.slice(0, separator);
  }
  return locations.get("") ?? fallback;
}

function lineForParseError(text: string, message: string): number {
  const position = /position (\d+)/.exec(message);
  if (position) {
    const offset = Number(position[1]);
    return text.slice(0, offset).split("\n").length;
  }
  const line = /line (\d+)/.exec(message);
  if (line) return Number(line[1]);
  // "Unexpected end of JSON input" carries no offset; the truncation is at the last line.
  return text.split("\n").length;
}

function kindFor(message: string): RuleLintKind {
  if (/reviewedAt must not be earlier|must be a valid date|needs the announced date/.test(message)) return "dates";
  if (/sources\[\d+\]\.url must be an https URL/.test(message)) return "source-url";
  if (/id is duplicated/.test(message)) return "duplicate-id";
  return "schema";
}

function normalizeField(field: string): string {
  return field.replace(/\[(\d+)\]/g, ".$1");
}

/** The `rules.<index>` prefix and rule id an issue from the registry validator points at. */
function ruleTarget(issue: string, rules: readonly unknown[]): { index: number; id?: string } | undefined {
  const indexed = /^rules\[(\d+)\]/.exec(issue);
  if (indexed) return { index: Number(indexed[1]) };
  const named = /^rule "([^"]+)"/.exec(issue);
  if (!named) return undefined;
  const id = named[1]!;
  const index = rules.findIndex((rule) => isRecord(rule) && rule.id === id);
  return index === -1 ? { index: -1, id } : { index, id };
}

function pathForIssue(issue: string, target: { index: number; id?: string } | undefined): string | undefined {
  if (target === undefined) {
    const field = FIELD.exec(issue);
    return field ? normalizeField(field[0]) : undefined;
  }
  if (target.index === -1) return undefined;
  const withoutPrefix = issue.replace(/^rule "[^"]+": /, "").replace(/^rules\[\d+\]: /, "");
  const field = FIELD.exec(withoutPrefix);
  return field ? `rules.${target.index}.${normalizeField(field[0])}` : `rules.${target.index}`;
}

function asRuleReference(value: unknown): string | undefined {
  if (typeof value !== "string" || !RULE_ID.test(value)) return undefined;
  return (value.match(/\./g)?.length ?? 0) >= 2 ? value : undefined;
}

function replacementProblems(
  rule: UnknownRecord,
  index: number,
  knownIds: ReadonlySet<string>,
  locations: Map<string, number>,
  file: string,
): RuleLintProblem[] {
  const problems: RuleLintProblem[] = [];
  const id = typeof rule.id === "string" ? rule.id : undefined;
  const check = (value: unknown, path: string): void => {
    const reference = asRuleReference(value);
    if (reference === undefined || knownIds.has(reference)) return;
    problems.push({
      file,
      line: lineFor(locations, path, 1),
      kind: "replacement-reference",
      ...(id === undefined ? {} : { ruleId: id }),
      message: `${id === undefined ? "rule" : `rule "${id}"`}: replacement references rule "${reference}", which is not defined in registry/`,
      hint: HINTS["replacement-reference"],
    });
  };
  check(rule.replacement, `rules.${index}.replacement`);
  if (Array.isArray(rule.usage)) {
    rule.usage.forEach((entry, usageIndex) => {
      if (isRecord(entry)) check(entry.replacement, `rules.${index}.usage.${usageIndex}.replacement`);
    });
  }
  return problems;
}

/** Problems in one registry file. `knownIds` widens replacement references to the other files in the run. */
export function lintRegistryText(file: RuleLintFile, knownIds?: ReadonlySet<string>): RuleLintProblem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{
      file: file.path,
      line: lineForParseError(file.text, message),
      kind: "schema",
      message: `not valid JSON: ${message}`,
      hint: "Fix the JSON syntax before linting; scans and CI parse the same file.",
    }];
  }

  const locations = jsonLocations(file.text);
  const rules = isRecord(parsed) && Array.isArray(parsed.rules) ? parsed.rules : [];
  const idsInFile = new Set(rules.flatMap((rule) => (isRecord(rule) && typeof rule.id === "string" ? [rule.id] : [])));
  const allIds = knownIds ?? idsInFile;
  const problems: RuleLintProblem[] = [];

  for (const issue of registryV2Issues(parsed)) {
    const kind = kindFor(issue);
    // Duplicates are reported below with the line of every repeated id, not only of the first.
    if (kind === "duplicate-id") continue;
    const target = ruleTarget(issue, rules);
    const path = pathForIssue(issue, target);
    // A missing field has no line of its own, so point at the rule's id; top-level problems point at line 1.
    const anchor = target && target.index !== -1 ? lineFor(locations, `rules.${target.index}.id`, 1) : 1;
    const line = path === undefined ? anchor : (locations.get(path) ?? anchor);
    problems.push({
      file: file.path,
      line,
      kind,
      ...(target?.id === undefined ? {} : { ruleId: target.id }),
      message: issue,
      hint: HINTS[kind],
    });
  }

  const seen = new Map<string, number>();
  rules.forEach((rule, index) => {
    if (!isRecord(rule) || typeof rule.id !== "string") return;
    const first = seen.get(rule.id);
    if (first === undefined) {
      seen.set(rule.id, index);
      return;
    }
    problems.push({
      file: file.path,
      line: lineFor(locations, `rules.${index}.id`, 1),
      kind: "duplicate-id",
      ruleId: rule.id,
      message: `rule "${rule.id}": id is duplicated (first defined at line ${lineFor(locations, `rules.${first}.id`, 1)})`,
      hint: HINTS["duplicate-id"],
    });
  });

  rules.forEach((rule, index) => {
    if (isRecord(rule)) problems.push(...replacementProblems(rule, index, allIds, locations, file.path));
  });

  return problems;
}

/**
 * Lints every file and reports ids repeated across files too. The registry is global: the same id in two
 * ecosystems would make baselines and reports ambiguous even though each file validates on its own.
 */
export function lintRegistryTexts(files: readonly RuleLintFile[]): RuleLintResult {
  const parsedIds = files.flatMap((file) => {
    try {
      const parsed = JSON.parse(file.text) as unknown;
      return isRecord(parsed) && Array.isArray(parsed.rules)
        ? parsed.rules.flatMap((rule) => (isRecord(rule) && typeof rule.id === "string" ? [rule.id] : []))
        : [];
    } catch {
      return [];
    }
  });
  const knownIds = new Set(parsedIds);
  const problems = files.flatMap((file) => lintRegistryText(file, knownIds));

  const firstSeen = new Map<string, { file: string; line: number }>();
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.rules)) continue;
    const locations = jsonLocations(file.text);
    parsed.rules.forEach((rule, index) => {
      if (!isRecord(rule) || typeof rule.id !== "string") return;
      const line = lineFor(locations, `rules.${index}.id`, 1);
      const first = firstSeen.get(rule.id);
      if (first === undefined) {
        firstSeen.set(rule.id, { file: file.path, line });
      } else if (first.file !== file.path) {
        problems.push({
          file: file.path,
          line,
          kind: "duplicate-id",
          ruleId: rule.id,
          message: `rule "${rule.id}": id is already defined in ${first.file}:${first.line}`,
          hint: HINTS["duplicate-id"],
        });
      }
    });
  }

  const order = (left: RuleLintProblem, right: RuleLintProblem): number =>
    left.file.localeCompare(right.file) || left.line - right.line || left.kind.localeCompare(right.kind) || left.message.localeCompare(right.message);
  return {
    schemaVersion: RULE_LINT_SCHEMA_VERSION,
    files: files.map((file) => file.path).sort((left, right) => left.localeCompare(right)),
    problems: problems.sort(order),
  };
}

function displayPath(path: string): string {
  const relativePath = relative(process.cwd(), resolve(path));
  return (relativePath === "" ? path : relativePath).replaceAll("\\", "/");
}

async function collectFile(path: string, directoryEntry: boolean): Promise<RuleLintFile | undefined> {
  const text = await readFile(path, "utf8");
  if (!directoryEntry) return { path: displayPath(path), text };
  // A registry directory also holds generated locks and the SHA map; only rule files are linted.
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.schemaVersion !== REGISTRY_V2_SCHEMA_VERSION) return undefined;
  } catch {
    // A broken .json file in the directory is still a problem worth naming.
  }
  return { path: displayPath(path), text };
}

/** Reads paths (files or directories of `*.json` registries) and lints them in one pass. */
export async function lintRulePaths(paths: readonly string[]): Promise<RuleLintResult> {
  const files: RuleLintFile[] = [];
  for (const path of paths) {
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(path);
    } catch {
      throw new RuleLintError(`Cannot read ${path}: no such file or directory.`);
    }
    if (info.isDirectory()) {
      const entries = (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const file = await collectFile(join(path, entry.name), true);
        if (file) files.push(file);
      }
    } else {
      const file = await collectFile(path, false);
      if (file) files.push(file);
    }
  }
  if (files.length === 0) throw new RuleLintError(`No registry files found in ${paths.join(", ")}.`);
  return lintRegistryTexts(files);
}

export function renderRuleLintText(result: RuleLintResult): string {
  if (result.problems.length === 0) {
    return `No rule problems in ${result.files.length} file${result.files.length === 1 ? "" : "s"}.`;
  }
  const lines = result.problems.map((problem) => `${problem.file}:${problem.line}: [${problem.kind}] ${problem.message}\n  hint: ${problem.hint}`);
  const files = new Set(result.problems.map((problem) => problem.file)).size;
  lines.push(`${result.problems.length} problem${result.problems.length === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}.`);
  return lines.join("\n");
}

export function renderRuleLintJson(result: RuleLintResult): string {
  return JSON.stringify(result, null, 2);
}
