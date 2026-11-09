// Pull-request helper: runs the fixture harness for the rules a diff can affect. The rules themselves live in
// @velella/ebb, which lints them and checks its own purl cases; this repository owns the detectors, so it checks that
// each rule's match fixture is reported and its clean fixture is not. `.github/workflows/rules.yml` runs it with
// --summary, so the pull request shows what was checked and a rule that breaks fails the job with that rule named.
//
// A diff affects a rule when it changes `tests/fixtures/<rule-id>/`, or when it moves @velella/ebb to another version
// (rules may have changed, so every rule with fixtures runs). `--all` runs every rule with fixtures.

import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { renderRuleTestText, RuleTestError, testRule } from "../src/rule-test.js";
import type { RuleTestOptions, RuleTestResult } from "../src/rule-test.js";

const RULE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LOCKFILE = "package-lock.json";
const EBB_ENTRY = "node_modules/@velella/ebb";
/** Shown as the base when every rule with fixtures runs without a diff. */
const ALL = "(all)";

export interface ChangedPaths {
  /** Rule ids whose fixtures changed. */
  fixtureRules: string[];
  /** True when the lockfile changed, so the installed @velella/ebb may have moved. */
  lockfile: boolean;
}

export interface ChangedRulesResult {
  base: string;
  /** The @velella/ebb version change, when the diff has one. */
  ebb?: { before: string | undefined; after: string | undefined };
  /** Rule ids that were tested, sorted. */
  rules: string[];
  tests: RuleTestResult[];
  passed: boolean;
}

export interface ChangedRulesOptions {
  /** Ref the diff is taken against, usually `origin/main`. Omitted, every rule with fixtures runs. */
  base?: string;
  root?: string;
  /** Directory holding the rule fixtures; defaults to `<root>/tests/fixtures`. */
  fixturesRoot?: string;
  /** When set, the Markdown job summary is appended to this file. */
  summaryPath?: string;
}

/** Paths in a diff that can affect rules: `tests/fixtures/<rule-id>/` and the lockfile. */
export function classifyChangedPaths(paths: readonly string[]): ChangedPaths {
  const fixtureRules = new Set<string>();
  let lockfile = false;
  for (const path of paths) {
    const normalized = path.replaceAll("\\", "/");
    if (normalized === LOCKFILE) lockfile = true;
    const fixture = /^tests\/fixtures\/([^/]+)\//.exec(normalized);
    if (fixture?.[1] !== undefined && RULE_ID.test(fixture[1])) fixtureRules.add(fixture[1]);
  }
  return { fixtureRules: [...fixtureRules].sort(), lockfile };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The @velella/ebb version a lockfile installs, or undefined when it has none or is not a lockfile. */
export function ebbVersion(lockfileText: string | undefined): string | undefined {
  if (lockfileText === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(lockfileText);
    if (!isRecord(parsed) || !isRecord(parsed.packages)) return undefined;
    const entry = parsed.packages[EBB_ENTRY];
    const version = isRecord(entry) ? entry.version : undefined;
    return typeof version === "string" ? version : undefined;
  } catch {
    return undefined;
  }
}

/** Paths changed between the merge base of `base` and `HEAD`, relative to the repository root and with `/`. */
export function changedPaths(base: string, root = process.cwd()): string[] {
  const output = execFileSync("git", ["diff", "--name-only", "-z", `${base}...HEAD`, "--"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return output
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => path.replaceAll("\\", "/"));
}

/** The base version of a file. A file added in the diff has none. */
function baseText(base: string, path: string, root: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${base}:${path}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
  } catch {
    return undefined;
  }
}

async function headText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

/** Every rule id that has a fixture directory. Rule ids always contain a dot; other fixture folders do not. */
export async function fixtureRuleIds(fixturesRoot: string): Promise<string[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && RULE_ID.test(entry.name) && entry.name.includes("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function runChangedRules(options: ChangedRulesOptions): Promise<ChangedRulesResult> {
  const root = options.root ?? process.cwd();
  const fixturesRoot = options.fixturesRoot ?? join(root, "tests", "fixtures");
  const base = options.base;

  let ids: string[];
  let ebb: ChangedRulesResult["ebb"];
  if (base === undefined) {
    ids = await fixtureRuleIds(fixturesRoot);
  } else {
    const { fixtureRules, lockfile } = classifyChangedPaths(changedPaths(base, root));
    const before = lockfile ? ebbVersion(baseText(base, LOCKFILE, root)) : undefined;
    const after = lockfile ? ebbVersion(await headText(join(root, LOCKFILE))) : undefined;
    if (before !== after) ebb = { before, after };
    ids = ebb === undefined ? fixtureRules : await fixtureRuleIds(fixturesRoot);
  }

  const testOptions: RuleTestOptions = { root };
  if (options.fixturesRoot !== undefined) testOptions.fixturesRoot = options.fixturesRoot;
  const rules: string[] = [];
  const tests: RuleTestResult[] = [];
  for (const id of ids) {
    try {
      tests.push(await testRule(id, testOptions));
      rules.push(id);
    } catch (error) {
      // A fixture folder for a rule Ebb does not have has nothing to test; any other error is real.
      if (!(error instanceof RuleTestError) || !error.message.startsWith("No rule has the id")) throw error;
    }
  }

  const passed = tests.every((result) => result.passed);
  const result: ChangedRulesResult = { base: base ?? ALL, rules, tests, passed };
  if (ebb !== undefined) result.ebb = ebb;
  if (options.summaryPath !== undefined)
    await writeFile(options.summaryPath, renderChangedRulesSummary(result), { flag: "a" });
  return result;
}

function ebbLine(result: ChangedRulesResult): string | undefined {
  if (result.ebb === undefined) return undefined;
  return `@velella/ebb moved from ${result.ebb.before ?? "none"} to ${result.ebb.after ?? "none"}, so every rule with fixtures ran.`;
}

/** One summary line per rule, then the failures that name what broke and where. */
export function renderChangedRulesSummary(result: ChangedRulesResult): string {
  const lines = ["### Rule fixtures", ""];
  const ebb = ebbLine(result);
  if (ebb !== undefined) lines.push(ebb, "");
  if (result.rules.length === 0) {
    lines.push("No rule fixture is affected by this change.", "");
    return lines.join("\n");
  }

  lines.push("| Rule | Fixtures |", "| --- | --- |");
  for (const outcome of result.tests) lines.push(`| \`${outcome.ruleId}\` | ${outcome.passed ? "pass" : "**fail**"} |`);
  const failing = result.tests.filter((outcome) => !outcome.passed);
  const count = `${result.rules.length} rule${result.rules.length === 1 ? "" : "s"}`;
  lines.push("", result.passed ? `All ${count} passed.` : `Failed ${failing.length} of ${count}.`, "");
  if (failing.length > 0) {
    lines.push(
      "#### Fixture problems",
      "",
      "```text",
      failing.map((outcome) => renderRuleTestText(outcome)).join("\n"),
      "```",
      "",
    );
  }
  return lines.join("\n");
}

export function renderChangedRulesText(result: ChangedRulesResult): string {
  const lines: string[] = [];
  const ebb = ebbLine(result);
  if (ebb !== undefined) lines.push(ebb);
  if (result.rules.length === 0) {
    lines.push("No rule fixture is affected by this change.");
    return lines.join("\n");
  }
  for (const outcome of result.tests) lines.push(renderRuleTestText(outcome));
  return lines.join("\n");
}

/** Names the rules that broke, for the workflow log. */
export function failedNames(result: ChangedRulesResult): string[] {
  return result.tests
    .filter((outcome) => !outcome.passed)
    .map((outcome) => outcome.ruleId)
    .sort((left, right) => left.localeCompare(right));
}

const USAGE = "Usage: changed-rules (--base <ref> | --all) [--summary <file>] [--fixtures <dir>]";

export async function main(argv: readonly string[]): Promise<number> {
  const options = new Map<string, string>();
  let all = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (!["--base", "--summary", "--fixtures"].includes(argument)) throw new Error(`Unknown argument "${argument}".`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
    options.set(argument, value);
    index += 1;
  }
  const base = options.get("--base");
  if ((base === undefined) === !all) throw new Error(USAGE);

  const summary = options.get("--summary");
  const fixtures = options.get("--fixtures");
  const changedOptions: ChangedRulesOptions = {};
  if (base !== undefined) changedOptions.base = base;
  if (summary !== undefined) changedOptions.summaryPath = summary;
  if (fixtures !== undefined) changedOptions.fixturesRoot = fixtures;
  const result = await runChangedRules(changedOptions);
  process.stdout.write(`${renderChangedRulesText(result)}\n`);
  if (!result.passed) process.stderr.write(`Rule fixtures failed: ${failedNames(result).join(", ")}\n`);
  return result.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(2);
    },
  );
}
