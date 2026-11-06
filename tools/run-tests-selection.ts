// Pull-request test selection: the tests a change can break, from the import graph.
//
// `.github/workflows/ci.yml` writes the files a pull request changes to a list and points
// `EVERGREEN_AFFECTED_FILES` at it. `tools/run-tests.mjs` asks this module which test files reach
// those files through `import` / `export ... from` edges and runs only those on the pull-request
// lane. The merge queue, `main`, and every other run have no list, so they run the whole suite: a
// miss here costs a review round-trip, never a landing proof.
//
// The map is built from the checkout instead of being committed, so it cannot go stale. Anything
// the map cannot place - configuration, fixtures, the registry, the tools that build it - runs the
// whole suite. Sources are parsed, never evaluated; no repository code runs here.

import { readFile, readdir } from "node:fs/promises";
import { join, posix, relative, resolve } from "node:path";

import ts from "typescript";

/** Directories whose TypeScript files make up the import graph, as `tsconfig.json` compiles them. */
export const GRAPH_DIRECTORIES: readonly string[] = ["src", "tests", "tools", "benchmarks"];

/**
 * Changed paths that always run the whole suite: configuration, shared data, and the map's own
 * code. A subset cannot prove them, so they are the honest full-run answer.
 */
export const FULL_RUN_PREFIXES: readonly string[] = [
  ".github/",
  "benchmarks/",
  "data/",
  "examples/",
  "integrations/",
  "planning/",
  "plugins/",
  "registry/",
  "schemas/",
  "scripts/",
  "skills/",
  "templates/",
  "tests/fixtures/",
  "tools/",
];

/** Root files that change how the suite is built, discovered, or run. */
export const FULL_RUN_FILES: readonly string[] = [
  ".evergreen-baseline.json",
  "Dockerfile",
  "action.yml",
  "biome.json",
  "eslint-suppressions.json",
  "eslint.config.js",
  "knip.jsonc",
  "lighthouserc.json",
  "package-lock.json",
  "package.json",
  "server.json",
  "stryker.config.json",
  "tsconfig.json",
];

/** Docs and Markdown never reach a unit test; the docs-only lane already skips the suite for them. */
export function isIgnoredPath(path: string): boolean {
  return path.endsWith(".md") || path.startsWith("docs/");
}

/** A test file the runner can execute: a `tests/` path ending in `.test.ts`. */
export function isTestFile(path: string): boolean {
  return path.startsWith("tests/") && path.endsWith(".test.ts");
}

/** Repository-relative TypeScript files under `directories`, with forward slashes, sorted. */
export async function listTypeScriptFiles(
  root: string,
  directories: readonly string[] = GRAPH_DIRECTORIES,
): Promise<string[]> {
  const paths: string[] = [];
  for (const directory of directories) {
    try {
      const entries = await readdir(resolve(root, directory), { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
        paths.push(relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
      }
    } catch {
      // A directory this checkout does not have contributes nothing to the map.
    }
  }
  return paths.sort();
}

/**
 * The module specifiers a TypeScript source names, without duplicates: `import`, `export ... from`,
 * `import x = require(...)`, `import(...)`, and `require(...)`. Parsed, never evaluated.
 */
export function importSpecifiers(text: string, fileName = "module.ts"): string[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    const specifier = moduleSpecifierOf(node);
    if (specifier !== undefined) specifiers.add(specifier);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...specifiers];
}

function moduleSpecifierOf(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
    return node.moduleSpecifier.text;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression.text;
  }
  if (ts.isCallExpression(node)) {
    const [first] = node.arguments;
    const loadsModule =
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require");
    if (loadsModule && first !== undefined && ts.isStringLiteral(first)) return first.text;
  }
  return undefined;
}

const COMPILED_EXTENSION = /\.(?:js|mjs|cjs)$/;

/**
 * Resolve a relative specifier from one repository file to another, or `undefined` when it leaves
 * the repository, names a package, or points at a file this checkout does not have. Compiled
 * specifiers (`.js`) map back to their TypeScript source, and a directory resolves to its index.
 */
export function resolveModuleSpecifier(
  importer: string,
  specifier: string,
  exists: (path: string) => boolean,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (base === ".." || base.startsWith("../")) return undefined;
  const candidates = [base];
  if (COMPILED_EXTENSION.test(base)) candidates.push(base.replace(COMPILED_EXTENSION, ".ts"));
  else if (!base.endsWith(".ts")) candidates.push(`${base}.ts`, `${base}/index.ts`);
  return candidates.find((candidate) => exists(candidate));
}

export interface ImportGraph {
  readonly files: readonly string[];
  readonly edges: ReadonlyMap<string, readonly string[]>;
  /** The test files every other map is keyed against. */
  readonly tests: readonly string[];
}

/** Read every file once and resolve its relative imports to other files in `files`. */
export async function buildImportGraph(root: string, files: readonly string[]): Promise<ImportGraph> {
  const present = new Set(files);
  const edges = new Map<string, string[]>();
  for (const file of files) {
    const text = await readFile(resolve(root, file), "utf8");
    const targets = new Set<string>();
    for (const specifier of importSpecifiers(text, file)) {
      const target = resolveModuleSpecifier(file, specifier, (candidate) => present.has(candidate));
      if (target !== undefined && target !== file) targets.add(target);
    }
    edges.set(file, [...targets].sort());
  }
  return { files, edges, tests: files.filter(isTestFile) };
}

/**
 * For each module, the test files that reach it through imports. Every test starts from its own
 * edges, so a cycle terminates at the first file already seen.
 */
export function testsByModule(graph: ImportGraph): Map<string, Set<string>> {
  const byModule = new Map<string, Set<string>>();
  for (const testFile of graph.tests) {
    const seen = new Set<string>();
    const pending = [...(graph.edges.get(testFile) ?? [])];
    while (pending.length > 0) {
      const modulePath = pending.pop();
      if (modulePath === undefined || seen.has(modulePath)) continue;
      seen.add(modulePath);
      const owners = byModule.get(modulePath) ?? new Set<string>();
      owners.add(testFile);
      byModule.set(modulePath, owners);
      for (const next of graph.edges.get(modulePath) ?? []) pending.push(next);
    }
  }
  return byModule;
}

export interface ChangeClassification {
  /** Changed source modules the import map can place. */
  readonly modules: string[];
  /** Changed test files, which run themselves. */
  readonly tests: string[];
  /** Set when the whole suite must run, and why. */
  readonly fullRunReason?: string;
}

/** Sort a change list into tests, modules, and ignored paths, or the reason to run everything. */
export function classifyChanges(changedFiles: readonly string[]): ChangeClassification {
  const modules: string[] = [];
  const tests: string[] = [];
  for (const path of changedFiles) {
    if (isIgnoredPath(path)) continue;
    if (FULL_RUN_FILES.includes(path) || FULL_RUN_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return { modules: [], tests: [], fullRunReason: `${path} is a shared path` };
    }
    if (isTestFile(path)) {
      tests.push(path);
      continue;
    }
    if ((path.startsWith("src/") || path.startsWith("tests/")) && path.endsWith(".ts")) {
      modules.push(path);
      continue;
    }
    return { modules: [], tests: [], fullRunReason: `${path} is outside src/ and tests/` };
  }
  return { modules, tests };
}

export interface TestSelection {
  /** Repository-relative test files to run, sorted. */
  readonly tests: readonly string[];
  /** True when the whole suite must run; `tests` is then empty. */
  readonly full: boolean;
  /** One line for the CI log and the step summary. */
  readonly reason: string;
}

export interface SelectionOptions {
  /** Repository root; defaults to the working directory. */
  readonly root?: string;
  /** Every graph file; defaults to `listTypeScriptFiles(root)`. */
  readonly moduleFiles?: readonly string[];
  /** Test files the selection may return; defaults to the graph's own test files. */
  readonly testFiles?: readonly string[];
}

function normalizePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function fullSelection(reason: string): TestSelection {
  return { tests: [], full: true, reason: `full suite — ${reason}` };
}

/**
 * The tests `changedFiles` can reach. Every path outside `src/` and `tests/`, every shared path, and
 * every changed module no test imports runs the whole suite rather than guessing.
 */
export async function selectAffectedTests(
  changedFiles: readonly string[],
  options: SelectionOptions = {},
): Promise<TestSelection> {
  const root = options.root ?? ".";
  const files = [...new Set(changedFiles.map(normalizePath).filter((path) => path.length > 0))].sort();
  if (files.length === 0) return fullSelection("the change list is empty");

  const classification = classifyChanges(files);
  if (classification.fullRunReason !== undefined) return fullSelection(classification.fullRunReason);

  const moduleFiles = options.moduleFiles ?? (await listTypeScriptFiles(root));
  const testFiles = [...(options.testFiles ?? moduleFiles.filter(isTestFile))].sort();
  const selected = new Set(classification.tests.filter((file) => testFiles.includes(file)));

  if (classification.modules.length > 0) {
    const reachable = testsByModule(await buildImportGraph(root, moduleFiles));
    const unmapped: string[] = [];
    for (const modulePath of classification.modules) {
      const owners = reachable.get(modulePath);
      if (owners === undefined || owners.size === 0) {
        unmapped.push(modulePath);
        continue;
      }
      for (const testFile of owners) selected.add(testFile);
    }
    if (unmapped.length > 0) {
      const extra = unmapped.length > 1 ? ` and ${unmapped.length - 1} more` : "";
      return fullSelection(`no test imports ${unmapped[0]}${extra}`);
    }
  }

  const tests = [...selected].sort();
  if (tests.length === 0) {
    return { tests: [], full: false, reason: "no test imports the changed files; nothing to run" };
  }
  return {
    tests,
    full: false,
    reason: `only ${tests.length} of ${testFiles.length} test files reach the change`,
  };
}
