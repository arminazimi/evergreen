import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import { matchesSpecifier } from "./pep440.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

type UnknownRecord = Record<string, unknown>;

const LOCKFILE = "poetry.lock";
const MANIFEST = "pyproject.toml";
const PYTHON_SUBJECT = "python";

function asRecord(value: unknown): UnknownRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * The line of each top-level field in every `[[package]]` block. A block's nested tables
 * (`[package.dependencies]`, `[package.extras]`) are skipped so their keys are never mistaken for the package's.
 */
function packageFieldLines(contents: string): Array<Map<string, number>> {
  const blocks: Array<Map<string, number>> = [];
  let current: Map<string, number> | undefined;
  let nested = false;
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const trimmed = raw.trim();
    if (trimmed === "[[package]]") {
      current = new Map([["__block", index + 1]]);
      blocks.push(current);
      nested = false;
      continue;
    }
    if (!current) continue;
    if (trimmed.startsWith("[")) {
      nested = true;
      continue;
    }
    if (nested) continue;
    const field = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed);
    if (field?.[1] && !current.has(field[1])) current.set(field[1], index + 1);
  }
  return blocks;
}

/** Poetry 1.1 wrote `category`; later versions write `groups`. Both mean the same thing. */
function groupNames(metadata: UnknownRecord): string[] {
  if (Array.isArray(metadata.groups)) {
    return metadata.groups
      .filter((group): group is string => typeof group === "string")
      .map((group) => group.toLowerCase());
  }
  if (typeof metadata.category === "string") return [metadata.category.toLowerCase()];
  return [];
}

function makeIssue(
  level: UpgradeIssue["level"],
  subject: string,
  path: string,
  line: number | undefined,
  reason: string,
  evidence: UpgradeIssue["evidence"],
): UpgradeIssue {
  return {
    analyzer: "poetry-lock",
    level,
    subject,
    path,
    ...(line === undefined ? {} : { line }),
    reason,
    evidence,
  };
}

/** The project's own Poetry Python constraint: `[tool.poetry.dependencies] python`. */
function poetryPythonSpecifier(document: UnknownRecord): string | undefined {
  const dependencies = asRecord(asRecord(asRecord(document.tool)?.poetry)?.dependencies);
  const value = dependencies?.python;
  if (typeof value === "string") return value;
  const table = asRecord(value);
  return typeof table?.version === "string" ? table.version : undefined;
}

function pyprojectPythonLine(contents: string): number {
  let section = "";
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const trimmed = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) {
      section = (header[1] ?? "").trim();
      continue;
    }
    if (section === "tool.poetry.dependencies" && /^python\s*=/.test(trimmed)) return index + 1;
  }
  return 1;
}

/** The `python-versions` verdict for one `[[package]]` block, or nothing when the block cannot exclude a target. */
function packageIssue(
  value: unknown,
  block: Map<string, number> | undefined,
  version: string,
): UpgradeIssue | undefined {
  const metadata = asRecord(value);
  if (metadata === undefined) return undefined;
  const name = typeof metadata.name === "string" ? metadata.name : undefined;
  const specifier = typeof metadata["python-versions"] === "string" ? metadata["python-versions"] : undefined;
  if (!name || specifier === undefined) return undefined;

  const packageVersion = typeof metadata.version === "string" ? metadata.version : undefined;
  const subject = packageVersion ? `${name}@${packageVersion}` : name;
  const line = block?.get("python-versions") ?? block?.get("__block");
  const matches = matchesSpecifier(specifier, version);
  if (matches === undefined)
    return makeIssue(
      "unknown",
      subject,
      LOCKFILE,
      line,
      `Cannot parse the python-versions constraint "${specifier}" for ${subject}.`,
      { kind: "lockfile", value: `python-versions: ${specifier}` },
    );
  if (matches) return undefined;
  return groupIssue(metadata, subject, specifier, line, version);
}

/** A main-group package blocks the upgrade; a package in any other group only warns. */
function groupIssue(
  metadata: UnknownRecord,
  subject: string,
  specifier: string,
  line: number | undefined,
  version: string,
): UpgradeIssue {
  const groups = groupNames(metadata);
  const main = groups.length === 0 || groups.includes("main");
  const detail = groups.length > 0 ? groups.join(", ") : "unspecified";
  return makeIssue(
    main ? "blocker" : "warning",
    subject,
    LOCKFILE,
    line,
    main
      ? `${subject} declares python-versions "${specifier}", which excludes Python ${version}.`
      : `${subject} is in the ${detail} group and its python-versions "${specifier}" excludes Python ${version}.`,
    { kind: "lockfile", value: `python-versions: ${specifier}` },
  );
}

function lockIssues(document: UnknownRecord | undefined, contents: string, version: string): UpgradeIssue[] {
  const packages = Array.isArray(document?.package) ? document.package : [];
  const blocks = packageFieldLines(contents);
  const issues: UpgradeIssue[] = [];
  for (const [index, value] of packages.entries()) {
    const issue = packageIssue(value, blocks[index], version);
    if (issue !== undefined) issues.push(issue);
  }
  return issues;
}

/** The project's own constraint from `pyproject.toml`, which the lockfile never contradicts. */
function manifestIssue(contents: string, version: string): UpgradeIssue | undefined {
  let pyproject: UnknownRecord | undefined;
  try {
    pyproject = asRecord(parseToml(contents));
  } catch {
    pyproject = undefined;
  }
  if (pyproject === undefined)
    return makeIssue(
      "unknown",
      PYTHON_SUBJECT,
      MANIFEST,
      1,
      "pyproject.toml is not valid TOML, so the project's Python constraint cannot be read.",
      { kind: "manifest", value: "pyproject.toml: invalid TOML" },
    );

  const specifier = poetryPythonSpecifier(pyproject);
  if (specifier === undefined) return undefined;
  const evidence = { kind: "manifest", value: `python: ${specifier}` } as const;
  const line = pyprojectPythonLine(contents);
  const matches = matchesSpecifier(specifier, version);
  if (matches === undefined)
    return makeIssue(
      "unknown",
      PYTHON_SUBJECT,
      MANIFEST,
      line,
      `Cannot parse the project's [tool.poetry.dependencies] python constraint "${specifier}".`,
      evidence,
    );
  if (matches) return undefined;
  return makeIssue(
    "blocker",
    PYTHON_SUBJECT,
    MANIFEST,
    line,
    `The project's [tool.poetry.dependencies] python constraint "${specifier}" excludes Python ${version}.`,
    evidence,
  );
}

export class PoetryLockAnalyzer implements UpgradeAnalyzer {
  readonly id = "poetry-lock";
  readonly runtimes = ["python"] as const;

  async applies(root: string): Promise<boolean> {
    return (await readOptional(resolve(root, LOCKFILE))) !== undefined;
  }

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    const lockContents = await readOptional(resolve(root, LOCKFILE));
    if (lockContents === undefined) return [];
    let document: UnknownRecord | undefined;
    try {
      document = asRecord(parseToml(lockContents));
    } catch {
      return [
        makeIssue(
          "unknown",
          LOCKFILE,
          LOCKFILE,
          1,
          "poetry.lock is not valid TOML, so python-versions cannot be read.",
          { kind: "lockfile", value: "poetry.lock: invalid TOML" },
        ),
      ];
    }

    const issues = lockIssues(document, lockContents, target.version);
    const manifestContents = await readOptional(resolve(root, MANIFEST));
    if (manifestContents !== undefined) {
      const issue = manifestIssue(manifestContents, target.version);
      if (issue !== undefined) issues.push(issue);
    }
    return issues;
  }
}

export const poetryLockAnalyzer = new PoetryLockAnalyzer();
