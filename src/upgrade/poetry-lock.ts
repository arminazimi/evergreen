import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import { matchesSpecifier } from "./pep440.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeTarget } from "./types.js";

type UnknownRecord = Record<string, unknown>;

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

export class PoetryLockAnalyzer implements UpgradeAnalyzer {
  readonly id = "poetry-lock";
  readonly runtimes = ["python"] as const;

  async applies(root: string): Promise<boolean> {
    return (await readOptional(resolve(root, "poetry.lock"))) !== undefined;
  }

  async analyze(root: string, target: UpgradeTarget): Promise<UpgradeIssue[]> {
    const lockContents = await readOptional(resolve(root, "poetry.lock"));
    if (lockContents === undefined) return [];
    let document: UnknownRecord | undefined;
    try {
      document = asRecord(parseToml(lockContents));
    } catch {
      return [
        makeIssue(
          "unknown",
          "poetry.lock",
          "poetry.lock",
          1,
          "poetry.lock is not valid TOML, so python-versions cannot be read.",
          { kind: "lockfile", value: "poetry.lock: invalid TOML" },
        ),
      ];
    }

    const issues: UpgradeIssue[] = [];
    const packages = Array.isArray(document?.package) ? document.package : [];
    const lines = packageFieldLines(lockContents);
    for (const [index, value] of packages.entries()) {
      const metadata = asRecord(value);
      if (!metadata) continue;
      const name = typeof metadata.name === "string" ? metadata.name : undefined;
      const packageVersion = typeof metadata.version === "string" ? metadata.version : undefined;
      const specifier = typeof metadata["python-versions"] === "string" ? metadata["python-versions"] : undefined;
      if (!name || specifier === undefined) continue;

      const block = lines[index];
      const line = block?.get("python-versions") ?? block?.get("__block");
      const subject = packageVersion ? `${name}@${packageVersion}` : name;
      const matches = matchesSpecifier(specifier, target.version);
      if (matches === undefined) {
        issues.push(
          makeIssue(
            "unknown",
            subject,
            "poetry.lock",
            line,
            `Cannot parse the python-versions constraint "${specifier}" for ${subject}.`,
            { kind: "lockfile", value: `python-versions: ${specifier}` },
          ),
        );
        continue;
      }
      if (matches) continue;

      const groups = groupNames(metadata);
      const main = groups.length === 0 || groups.includes("main");
      const groupText = groups.length > 0 ? groups.join(", ") : "unspecified";
      issues.push(
        makeIssue(
          main ? "blocker" : "warning",
          subject,
          "poetry.lock",
          line,
          main
            ? `${subject} declares python-versions "${specifier}", which excludes Python ${target.version}.`
            : `${subject} is in the ${groupText} group and its python-versions "${specifier}" excludes Python ${target.version}.`,
          { kind: "lockfile", value: `python-versions: ${specifier}` },
        ),
      );
    }

    const pyprojectContents = await readOptional(resolve(root, "pyproject.toml"));
    if (pyprojectContents !== undefined) {
      let pyproject: UnknownRecord | undefined;
      try {
        pyproject = asRecord(parseToml(pyprojectContents));
      } catch {
        pyproject = undefined;
      }
      if (pyproject === undefined) {
        issues.push(
          makeIssue(
            "unknown",
            "python",
            "pyproject.toml",
            1,
            "pyproject.toml is not valid TOML, so the project's Python constraint cannot be read.",
            { kind: "manifest", value: "pyproject.toml: invalid TOML" },
          ),
        );
      } else {
        const specifier = poetryPythonSpecifier(pyproject);
        if (specifier !== undefined) {
          const line = pyprojectPythonLine(pyprojectContents);
          const matches = matchesSpecifier(specifier, target.version);
          if (matches === undefined) {
            issues.push(
              makeIssue(
                "unknown",
                "python",
                "pyproject.toml",
                line,
                `Cannot parse the project's [tool.poetry.dependencies] python constraint "${specifier}".`,
                { kind: "manifest", value: `python: ${specifier}` },
              ),
            );
          } else if (!matches) {
            issues.push(
              makeIssue(
                "blocker",
                "python",
                "pyproject.toml",
                line,
                `The project's [tool.poetry.dependencies] python constraint "${specifier}" excludes Python ${target.version}.`,
                { kind: "manifest", value: `python: ${specifier}` },
              ),
            );
          }
        }
      }
    }

    return issues;
  }
}

export const poetryLockAnalyzer = new PoetryLockAnalyzer();
