import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { Language, Parser, Query, Tree } from "@vscode/tree-sitter-wasm";

import type { SourceLanguage } from "../domain.js";

// Grammars ship inside @vscode/tree-sitter-wasm: prebuilt WebAssembly, no native build, no network.
const require = createRequire(import.meta.url);

type TreeSitter = typeof import("@vscode/tree-sitter-wasm");

export type TreeSitterGrammar = "javascript" | "typescript" | "tsx" | "python";

/** Same ceiling the regex scanner applies, so both engines skip the same files. */
export const maximumParseBytes = 1_000_000;

/** Wall-clock budget for one parse; a pathological file is skipped instead of stalling a scan. */
export const parseBudgetMilliseconds = 5_000;

let runtime: Promise<{ module: TreeSitter; directory: string }> | undefined;
const languages = new Map<TreeSitterGrammar, Promise<Language>>();
const parsers = new Map<TreeSitterGrammar, Parser>();

function loadRuntime(): Promise<{ module: TreeSitter; directory: string }> {
  runtime ??= (async () => {
    const entry = require.resolve("@vscode/tree-sitter-wasm");
    const directory = dirname(entry);
    const module = require("@vscode/tree-sitter-wasm") as TreeSitter;
    await module.Parser.init({ locateFile: (file) => join(directory, file) });
    return { module, directory };
  })();
  runtime.catch(() => {
    runtime = undefined;
  });
  return runtime;
}

function loadLanguage(grammar: TreeSitterGrammar): Promise<Language> {
  let language = languages.get(grammar);
  if (!language) {
    language = loadRuntime().then(({ module, directory }) =>
      module.Language.load(join(directory, `tree-sitter-${grammar}.wasm`)),
    );
    languages.set(grammar, language);
    language.catch(() => languages.delete(grammar));
  }
  return language;
}

const queries = new Map<string, Promise<Query>>();

/**
 * Compiles `queries/<name>.scm` files (shipped next to this module, concatenated in order) against a grammar, once. Queries are
 * checked into the repository as text so contributors can read and extend them without touching TypeScript.
 */
export function loadQuery(grammar: TreeSitterGrammar, ...names: string[]): Promise<Query> {
  const key = `${grammar}:${names.join("+")}`;
  let query = queries.get(key);
  if (!query) {
    query = Promise.all([loadRuntime(), loadLanguage(grammar), Promise.all(names.map((name) => readFile(new URL(`./queries/${name}.scm`, import.meta.url), "utf8")))]).then(
      ([{ module }, language, sources]) => new module.Query(language, sources.join("\n")),
    );
    queries.set(key, query);
    query.catch(() => queries.delete(key));
  }
  return query;
}

/** Picks the grammar for a source file, or undefined when no tree-sitter grammar covers it. */
export function grammarFor(language: SourceLanguage, path: string): TreeSitterGrammar | undefined {
  if (language === "python") return "python";
  if (language === "javascript") return "javascript";
  if (language === "typescript") return path.toLowerCase().endsWith(".tsx") ? "tsx" : "typescript";
  return undefined;
}

/**
 * Parses source text with a lazily loaded grammar. Returns undefined when the file exceeds
 * {@link maximumParseBytes} or the parse budget. The caller owns the tree and must call `delete()`.
 */
export async function parseSource(
  grammar: TreeSitterGrammar,
  source: string,
  budgetMilliseconds = parseBudgetMilliseconds,
): Promise<Tree | undefined> {
  if (Buffer.byteLength(source) > maximumParseBytes) return undefined;
  const language = await loadLanguage(grammar);
  let parser = parsers.get(grammar);
  if (!parser) {
    const { module } = await loadRuntime();
    parser = new module.Parser();
    parser.setLanguage(language);
    parsers.set(grammar, parser);
  }
  const deadline = Date.now() + budgetMilliseconds;
  const options = { progressCallback: () => Date.now() > deadline } as unknown as Parameters<Parser["parse"]>[2];
  try {
    return parser.parse(source, null, options) ?? undefined;
  } finally {
    parser.reset();
  }
}
