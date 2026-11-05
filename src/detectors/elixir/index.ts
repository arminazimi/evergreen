import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { loadDataFile } from "../../data-source.js";
import { relativePosix } from "../../paths.js";
import { validateRegistryV2 } from "../../registry.js";
import type { RegistryV2Rule } from "../../registry.js";
import { DETECTOR_API_VERSION } from "../../sdk.js";
import type { Detector, DetectorAnalysis, DetectorContext, DetectorFinding, DetectorInputs } from "../../sdk.js";
import { parseVersLenient, versContains } from "../../vers/index.js";
import { parseToolVersions } from "./parse-elixir-runtime.js";
import { parseMixExs } from "./parse-mix-exs.js";
import { parseMixLock } from "./parse-mix-lock.js";

/**
 * Finds Elixir and Erlang/OTP release lines that are end of life, and Hex packages covered by a lifecycle rule.
 *
 * It reads the runtime pins in `.tool-versions` (`elixir` and `erlang`, including an asdf `elixir …-otp-N`
 * suffix), the project `elixir:` constraint and direct Hex deps in `mix.exs`, and resolved Hex packages in
 * `mix.lock`. A package rule that covers every version matches a `mix.exs` constraint; a resolved lockfile
 * package matches any rule whose range contains that version. Elixir, Erlang, asdf, and Mix are never run and
 * nothing is fetched.
 */

const MAXIMUM_DEPTH = 8;
const MAXIMUM_FILES = 500;
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "target",
  ".venv",
  "venv",
  "deps",
  "_build",
  ".elixir_ls",
  "fixtures",
  "__fixtures__",
  "testdata",
]);
const ELIXIR_PURL = "pkg:generic/elixir";
const ERLANG_PURL = "pkg:generic/erlang";
const HEX_PURL_PREFIX = "pkg:hex/";
const ELIXIR_FILES = new Set([".tool-versions", "mix.exs", "mix.lock"]);
/** An exact Mix or asdf pin: major.minor or major.minor.patch, with no operator. */
const EXACT_VERSION = /^[1-9][0-9]*(?:\.[0-9]+)?(?:\.[0-9]+)?$/;

async function elixirFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_DEPTH || files.length >= MAXIMUM_FILES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) await walk(join(directory, entry.name), depth + 1);
      } else if (entry.isFile() && ELIXIR_FILES.has(entry.name)) {
        files.push(join(directory, entry.name));
      }
    }
  }
  await walk(root, 0);
  return files;
}

/** The first rule whose VERS range contains the version. A rule whose VERS is malformed is skipped. */
function firstMatchingRule(rules: readonly RegistryV2Rule[], version: string): RegistryV2Rule | undefined {
  for (const rule of rules) {
    try {
      if (versContains(rule.vers, version)) return rule;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** True for a rule that names every version of a package; false for one that lists specific versions. */
function coversEveryVersion(rule: RegistryV2Rule): boolean {
  try {
    return parseVersLenient(rule.vers).all;
  } catch {
    return false;
  }
}

/** An exact pin matches by range; any other constraint matches only a rule that covers every version. */
function ruleForDeclared(rules: readonly RegistryV2Rule[], value: string): RegistryV2Rule | undefined {
  return EXACT_VERSION.test(value) ? firstMatchingRule(rules, value) : rules.find(coversEveryVersion);
}

/** Rules and the findings collected so far in one `analyze` run. */
interface Run {
  readonly root: string;
  readonly elixirRules: RegistryV2Rule[];
  readonly erlangRules: RegistryV2Rule[];
  readonly packageRules: Map<string, RegistryV2Rule[]>;
  readonly findings: DetectorFinding[];
}

function newRun(root: string, rules: RegistryV2Rule[]): Run {
  const packageRules = new Map<string, RegistryV2Rule[]>();
  for (const rule of rules) {
    if (!rule.purl.startsWith(HEX_PURL_PREFIX)) continue;
    const name = decodeURIComponent(rule.purl.slice(HEX_PURL_PREFIX.length));
    const existing = packageRules.get(name);
    if (existing) existing.push(rule);
    else packageRules.set(name, [rule]);
  }
  return {
    root,
    elixirRules: rules.filter((rule) => rule.purl === ELIXIR_PURL),
    erlangRules: rules.filter((rule) => rule.purl === ERLANG_PURL),
    packageRules,
    findings: [],
  };
}

function report(run: Run, rule: RegistryV2Rule, path: string, line: number, summary: string): void {
  run.findings.push({
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  });
}

function judgeToolVersions(run: Run, contents: string, path: string): void {
  for (const declaration of parseToolVersions(contents)) {
    if (declaration.kind === "elixir") {
      const rule = firstMatchingRule(run.elixirRules, declaration.value);
      if (rule) report(run, rule, path, declaration.line, `${path} pins Elixir ${declaration.value}. ${rule.summary}`);
    } else {
      const rule = firstMatchingRule(run.erlangRules, declaration.value);
      if (rule)
        report(run, rule, path, declaration.line, `${path} pins Erlang/OTP ${declaration.value}. ${rule.summary}`);
    }
  }
}

function judgeMixExs(run: Run, contents: string, path: string): void {
  for (const declaration of parseMixExs(contents)) {
    if (declaration.kind === "elixir") {
      const rule = ruleForDeclared(run.elixirRules, declaration.value);
      if (rule)
        report(run, rule, path, declaration.line, `${path} declares Elixir ${declaration.value}. ${rule.summary}`);
      continue;
    }
    for (const rule of run.packageRules.get(declaration.name) ?? []) {
      if (coversEveryVersion(rule))
        report(
          run,
          rule,
          path,
          declaration.line,
          `${path} depends on ${declaration.name} ${declaration.value}. ${rule.summary}`,
        );
    }
  }
}

function judgeMixLock(run: Run, contents: string, path: string): void {
  for (const declaration of parseMixLock(contents)) {
    const rule = firstMatchingRule(run.packageRules.get(declaration.name) ?? [], declaration.value);
    if (rule)
      report(
        run,
        rule,
        path,
        declaration.line,
        `${path} resolves ${declaration.name} ${declaration.value}. ${rule.summary}`,
      );
  }
}

const JUDGES: Record<string, (run: Run, contents: string, path: string) => void> = {
  ".tool-versions": judgeToolVersions,
  "mix.exs": judgeMixExs,
  "mix.lock": judgeMixLock,
};

function sortedFindings(findings: DetectorFinding[]): DetectorFinding[] {
  return findings.sort((left, right) => {
    if (left.location.path !== right.location.path) return left.location.path < right.location.path ? -1 : 1;
    return (left.location.line ?? 0) - (right.location.line ?? 0) || left.id.localeCompare(right.id);
  });
}

export class ElixirDetector implements Detector {
  readonly apiVersion = DETECTOR_API_VERSION;
  readonly id = "elixir";
  /** The files `scan` may read; conformance fails a scan that reads another. */
  readonly inputs: DetectorInputs = { fileNames: [".tool-versions", "mix.exs", "mix.lock"] };

  /** `loadRules` lets tests supply rules; by default they come from the packaged `registry/elixir.json`. */
  constructor(
    private readonly loadRules: () => Promise<RegistryV2Rule[]> = async () =>
      validateRegistryV2(await loadDataFile("registry/elixir.json")).rules,
  ) {}

  async scan(context: DetectorContext): Promise<DetectorFinding[]> {
    return [...(await this.analyze(context)).findings];
  }

  async analyze(context: DetectorContext): Promise<DetectorAnalysis> {
    const files = await elixirFiles(context.root);
    if (files.length === 0) return { findings: [], unclassified: [] };

    const run = newRun(context.root, await this.loadRules());
    for (const file of files) {
      let contents: string;
      try {
        contents = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const judge = JUDGES[basename(file)];
      judge?.(run, contents, relativePosix(context.root, file));
    }
    return { findings: sortedFindings(run.findings), unclassified: [] };
  }
}

export const elixirDetector = new ElixirDetector();
