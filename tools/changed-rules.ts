// Pull-request helper: finds the registry rules a diff touches, lints the changed registry files, and runs the
// fixture harness for every changed rule. `.github/workflows/rules.yml` runs it with --summary, so the pull request
// shows what was checked and a rule that breaks fails the job with that rule named.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { REGISTRY_V2_SCHEMA_VERSION } from "../src/registry.js";
import { lintRuleFiles, renderRuleLintText } from "../src/rule-lint.js";
import type { RuleLintResult } from "../src/rule-lint.js";
import { renderRuleTestText, RuleTestError, testRule } from "../src/rule-test.js";
import type { RuleTestOptions, RuleTestResult } from "../src/rule-test.js";

const RULE_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
/** Generated files that live beside the rule registries but are not rule registries. */
const GENERATED_REGISTRY_FILES = new Set(["registry/sources.lock.json", "registry/github-actions-shas.json"]);

export interface ChangedPaths {
  /** Changed files under `registry/`; the runner skips files whose schema is not a rule registry. */
  files: string[];
  /** Rule ids whose fixtures changed, whether or not the rule itself did. */
  fixtureRules: string[];
}

export interface ChangedRulesResult {
  base: string;
  /** Registry files that were linted, relative to the repository root. */
  files: string[];
  /** Rule ids that were tested, sorted. */
  rules: string[];
  lint: RuleLintResult;
  tests: RuleTestResult[];
  passed: boolean;
}

export interface ChangedRulesOptions {
  /** Ref the diff is taken against, usually `origin/main`. */
  base: string;
  root?: string;
  /** Directory holding the rule fixtures; defaults to `<root>/tests/fixtures`. */
  fixturesRoot?: string;
  /** When set, the Markdown job summary is appended to this file. */
  summaryPath?: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Sorts object keys so a rule that only reorders its JSON is not reported as changed. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

interface RegistryText {
  schemaVersion: unknown;
  rules: unknown[] | undefined;
}

/** A parsed registry, or undefined when the text is not JSON at all. */
function parseRegistry(text: string): RegistryText | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return { schemaVersion: undefined, rules: undefined };
  return { schemaVersion: parsed.schemaVersion, rules: Array.isArray(parsed.rules) ? parsed.rules : undefined };
}

function isRuleRegistry(parsed: RegistryText | undefined): parsed is RegistryText & { rules: unknown[] } {
  return parsed !== undefined && parsed.schemaVersion === REGISTRY_V2_SCHEMA_VERSION && parsed.rules !== undefined;
}

function ruleFingerprints(text: string): Map<string, string> {
  const fingerprints = new Map<string, string>();
  const parsed = parseRegistry(text);
  if (!isRuleRegistry(parsed)) return fingerprints;
  for (const rule of parsed.rules) {
    if (isRecord(rule) && typeof rule.id === "string") fingerprints.set(rule.id, stable(rule));
  }
  return fingerprints;
}

/** Paths in a diff that can affect rules: registry files and `tests/fixtures/<rule-id>/`. */
export function classifyChangedPaths(paths: readonly string[]): ChangedPaths {
  const files = new Set<string>();
  const fixtureRules = new Set<string>();
  for (const path of paths) {
    const normalized = path.replaceAll("\\", "/");
    if (/^registry\/[^/]+\.json$/.test(normalized) && !GENERATED_REGISTRY_FILES.has(normalized)) files.add(normalized);
    const fixture = /^tests\/fixtures\/([^/]+)\//.exec(normalized);
    if (fixture?.[1] !== undefined && RULE_ID.test(fixture[1])) fixtureRules.add(fixture[1]);
  }
  return { files: [...files].sort(), fixtureRules: [...fixtureRules].sort() };
}

/**
 * Rule ids added or changed between two versions of one registry file, sorted. A deleted rule is not
 * returned: there is nothing left to lint or test. An unreadable new file yields no ids; lint reports it.
 */
export function changedRuleIds(beforeText: string | undefined, afterText: string): string[] {
  const before = beforeText === undefined ? new Map<string, string>() : ruleFingerprints(beforeText);
  const after = ruleFingerprints(afterText);
  if (after.size === 0) return [];
  const changed: string[] = [];
  for (const [id, fingerprint] of after) if (before.get(id) !== fingerprint) changed.push(id);
  return changed.sort((left, right) => left.localeCompare(right));
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
  return output.split("\0").filter((path) => path !== "").map((path) => path.replaceAll("\\", "/"));
}

/** The base version of a changed file. A file added in the diff has none, so every head rule counts as new. */
function baseText(base: string, path: string, root: string): string | undefined {
  try {
    return execFileSync("git", ["show", `${base}:${path}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
  } catch {
    return undefined;
  }
}

export async function runChangedRules(options: ChangedRulesOptions): Promise<ChangedRulesResult> {
  const root = options.root ?? process.cwd();
  const { files: candidates, fixtureRules } = classifyChangedPaths(changedPaths(options.base, root));

  const files: string[] = [];
  const changed = new Set(fixtureRules);
  for (const path of candidates) {
    if (!existsSync(join(root, path))) continue; // A deleted registry file has no rules left to check.
    const head = await readFile(join(root, path), "utf8");
    const parsed = parseRegistry(head);
    if (parsed !== undefined && !isRuleRegistry(parsed)) continue; // Locks and other generated files.
    files.push(path);
    for (const id of changedRuleIds(baseText(options.base, path, root), head)) changed.add(id);
  }

  const testOptions: RuleTestOptions = { root };
  if (options.fixturesRoot !== undefined) testOptions.fixturesRoot = options.fixturesRoot;
  const rules: string[] = [];
  const tests: RuleTestResult[] = [];
  for (const id of [...changed].sort((left, right) => left.localeCompare(right))) {
    try {
      tests.push(await testRule(id, testOptions));
      rules.push(id);
    } catch (error) {
      // A rule deleted with its fixtures has nothing left to test; any other error is real.
      if (!(error instanceof RuleTestError) || !error.message.startsWith("No rule has the id")) throw error;
    }
  }

  const lint = await lintRuleFiles(files.map((path) => join(root, path)));
  const passed = lint.issues.length === 0 && tests.every((result) => result.passed);
  const result: ChangedRulesResult = { base: options.base, files, rules, lint, tests, passed };
  if (options.summaryPath !== undefined) await writeFile(options.summaryPath, renderChangedRulesSummary(result), { flag: "a" });
  return result;
}

/** One summary line per rule, then the failures that name what broke and where. */
export function renderChangedRulesSummary(result: ChangedRulesResult): string {
  const lines = ["### Changed rules", ""];
  if (result.files.length === 0 && result.rules.length === 0) {
    lines.push("No rule changed in this pull request.", "");
    return lines.join("\n");
  }

  if (result.rules.length === 0) {
    lines.push(`Linted ${result.files.length} registry file${result.files.length === 1 ? "" : "s"}; no rule was added or changed.`, "");
  } else {
    lines.push("| Rule | Lint | Fixtures |", "| --- | --- | --- |");
    for (const ruleId of result.rules) {
      const lintFailed = result.lint.issues.some((issue) => issue.ruleId === ruleId);
      const outcome = result.tests.find((item) => item.ruleId === ruleId);
      const fixtures = outcome === undefined ? "not run" : outcome.passed ? "pass" : "**fail**";
      lines.push(`| \`${ruleId}\` | ${lintFailed ? "**fail**" : "pass"} | ${fixtures} |`);
    }
    const failed = result.tests.filter((outcome) => !outcome.passed).length;
    lines.push("", result.passed ? `All ${result.rules.length} changed rule${result.rules.length === 1 ? "" : "s"} passed.` : `Failed ${failed} of ${result.rules.length} changed rule${result.rules.length === 1 ? "" : "s"}.`, "");
  }

  if (result.lint.issues.length > 0) {
    lines.push("#### Lint problems", "", "```text", renderRuleLintText(result.lint), "```", "");
  }
  const failing = result.tests.filter((outcome) => !outcome.passed);
  if (failing.length > 0) {
    lines.push("#### Fixture problems", "", "```text", failing.map((outcome) => renderRuleTestText(outcome)).join("\n"), "```", "");
  }
  return lines.join("\n");
}

export function renderChangedRulesText(result: ChangedRulesResult): string {
  if (result.files.length === 0 && result.rules.length === 0) return "No rule changed in this pull request.";
  const lines = [
    `Changed registry files: ${result.files.length === 0 ? "none" : result.files.join(", ")}`,
    `Changed rules: ${result.rules.length === 0 ? "none" : result.rules.join(", ")}`,
  ];
  if (result.files.length > 0) lines.push(renderRuleLintText(result.lint));
  for (const outcome of result.tests) lines.push(renderRuleTestText(outcome));
  return lines.join("\n");
}

/** Names the rules and files that broke, for the workflow log. */
export function failedNames(result: ChangedRulesResult): string[] {
  const names = new Set<string>();
  for (const outcome of result.tests) if (!outcome.passed) names.add(outcome.ruleId);
  for (const issue of result.lint.issues) names.add(issue.ruleId ?? issue.file);
  return [...names].sort((left, right) => left.localeCompare(right));
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!["--base", "--summary", "--fixtures"].includes(argument)) throw new Error(`Unknown argument "${argument}".`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${argument} needs a value.`);
    options.set(argument, value);
    index += 1;
  }
  const base = options.get("--base");
  if (base === undefined) throw new Error("Usage: changed-rules --base <ref> [--summary <file>] [--fixtures <dir>]");

  const summary = options.get("--summary");
  const fixtures = options.get("--fixtures");
  const changedOptions: ChangedRulesOptions = { base };
  if (summary !== undefined) changedOptions.summaryPath = summary;
  if (fixtures !== undefined) changedOptions.fixturesRoot = fixtures;
  const result = await runChangedRules(changedOptions);
  process.stdout.write(`${renderChangedRulesText(result)}\n`);
  if (!result.passed) process.stderr.write(`Rule changes failed: ${failedNames(result).join(", ")}\n`);
  return result.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(2);
    },
  );
}
