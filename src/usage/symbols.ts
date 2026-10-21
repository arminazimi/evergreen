import type { Node } from "@vscode/tree-sitter-wasm";

import type { SourceUsage, SymbolUsageMatcher } from "../domain.js";

/** A name an import binds in a file: the module, the local name, and what of the module the name stands for. */
export interface SymbolBinding {
  module: string;
  local: string;
  /** The imported name, or "*" / "default" when the local name stands for the module itself. */
  imported: string;
}

/** One use of a dotted name in a file, as the analyzers read it from the syntax tree. */
export interface SymbolOccurrence {
  /** First identifier of the name, where the usage is reported. */
  head: Node;
  path: string[];
  role: "call" | "construct" | "reference";
  /** For calls and constructions: the option names passed at each argument position, with the node of each name. */
  options?: Map<string, Node>[];
}

/** Key under which an analyzer records a Python positional argument in {@link SymbolOccurrence.options}. */
export const positionalKey = "#positional";

const rootNames = new Set(["*", "default"]);

const withoutNodePrefix = (module: string): string => (module.startsWith("node:") ? module.slice(5) : module);

/** True when a binding's module is the matcher's module, treating `node:fs` and `fs` as the same module. */
function sameModule(language: SymbolUsageMatcher["language"], bound: SymbolBinding, module: string): boolean {
  if (language === "python") return bound.module === module || (bound.imported === "*" && bound.module.startsWith(`${module}.`));
  return withoutNodePrefix(bound.module) === withoutNodePrefix(module);
}

/** The symbol path an occurrence denotes for one matcher, or undefined when it does not come from the matcher's module. */
function resolve(matcher: SymbolUsageMatcher, occurrence: SymbolOccurrence, bindings: readonly SymbolBinding[]): string | undefined {
  const [head, ...rest] = occurrence.path as [string, ...string[]];
  if (matcher.module === undefined) {
    // A global or builtin: the name must not be one the file imported or aliased.
    return bindings.some((binding) => binding.local === head) ? undefined : occurrence.path.join(".");
  }
  for (const binding of bindings) {
    if (binding.local !== head || !sameModule(matcher.language, binding, matcher.module)) continue;
    if (rootNames.has(binding.imported)) return rest.join(".");
    return [binding.imported, ...rest].join(".");
  }
  return undefined;
}

/**
 * Evaluates symbol matchers over the occurrences of one file. A `call` or `construct` entry reports the callee, a
 * `reference` entry reports a name that is used but not called, and an `option` entry reports the deprecated property
 * inside the call's options object (or keyword argument, in Python).
 */
export function symbolUsages(
  matchers: readonly SymbolUsageMatcher[],
  occurrences: readonly SymbolOccurrence[],
  bindings: readonly SymbolBinding[],
  describe: (node: Node) => Pick<SourceUsage, "location" | "excerpt">,
  file: { language: SourceUsage["language"] },
): SourceUsage[] {
  const usages: SourceUsage[] = [];
  const seen = new Set<string>();
  for (const matcher of matchers) {
    const name = `${matcher.module === undefined ? "" : `${matcher.module}.`}${matcher.symbol}`;
    for (const occurrence of occurrences) {
      if (resolve(matcher, occurrence, bindings) !== matcher.symbol) continue;
      let reported: { node: Node; symbol: string } | undefined;
      if (matcher.shape === "reference" && occurrence.role === "reference") reported = { node: occurrence.head, symbol: name };
      else if (matcher.shape === "call" && occurrence.role === "call") reported = { node: occurrence.head, symbol: name };
      else if (matcher.shape === "construct" && occurrence.role === "construct") reported = { node: occurrence.head, symbol: name };
      else if (matcher.shape === "option" && occurrence.role === "call" && matcher.option !== undefined) {
        const options = occurrence.options ?? [];
        const position = matcher.argument ?? options.length - 1;
        const found = matcher.language === "python" ? pythonOption(options, matcher.option, matcher.argument) : options[position]?.get(matcher.option);
        if (found) reported = { node: found, symbol: `${name}(${matcher.option})` };
      }
      if (!reported) continue;
      const { location, excerpt } = describe(reported.node);
      const key = `${location.line}:${location.column}:${reported.symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usages.push({ kind: "symbol", language: file.language, symbol: reported.symbol, location, excerpt });
    }
  }
  return usages;
}

/** A Python option is a keyword argument anywhere in the call, or a positional argument at the declared position. */
function pythonOption(options: readonly Map<string, Node>[], name: string, position: number | undefined): Node | undefined {
  for (const entries of options) {
    const found = entries.get(name);
    if (found) return found;
  }
  return position === undefined ? undefined : options[position]?.get(positionalKey);
}
