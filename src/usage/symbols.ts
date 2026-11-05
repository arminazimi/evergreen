import type { Node } from "./vendor/tree-sitter/tree-sitter.js";

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
  if (language === "python") return bound.module === module;
  return withoutNodePrefix(bound.module) === withoutNodePrefix(module);
}

/** The symbol path an occurrence denotes for one matcher, or undefined when it does not come from the matcher's module. */
function resolve(
  matcher: SymbolUsageMatcher,
  occurrence: SymbolOccurrence,
  bindings: readonly SymbolBinding[],
): string | undefined {
  const [head, ...rest] = occurrence.path as [string, ...string[]];
  if (matcher.module === undefined) {
    // A global or builtin: the name must not be one the file imported or aliased.
    return bindings.some((binding) => binding.local === head) ? undefined : occurrence.path.join(".");
  }
  for (const binding of bindings) {
    if (binding.local !== head) continue;
    if (matcher.language === "python") {
      const parts = matcher.module.split(".");
      // `import a.b` binds `a`, and `a.b.name` reads `name` from module a.b.
      if (binding.imported === "*" && binding.module === matcher.module && parts.length > 1 && head === parts[0]) {
        const tail = parts.slice(1);
        if (tail.every((part, index) => rest[index] === part)) return rest.slice(tail.length).join(".");
        continue;
      }
      // `from a import b` binds `b` to module a.b.
      if (binding.imported !== "*" && `${binding.module}.${binding.imported}` === matcher.module) return rest.join(".");
    }
    if (!sameModule(matcher.language, binding, matcher.module)) continue;
    if (rootNames.has(binding.imported)) return rest.join(".");
    return [binding.imported, ...rest].join(".");
  }
  return undefined;
}

/** The occurrence role each named shape reports. `option` and `method` are not listed: they are handled elsewhere. */
const roleForShape: Partial<Record<SymbolUsageMatcher["shape"], SymbolOccurrence["role"]>> = {
  reference: "reference",
  call: "call",
  construct: "construct",
};

/** The node an option check finds for one occurrence: the keyword in Python, the object property in JavaScript. */
function optionNode(matcher: SymbolUsageMatcher, option: string, occurrence: SymbolOccurrence): Node | undefined {
  const options = occurrence.options ?? [];
  if (matcher.language === "python") return pythonOption(options, option, matcher.argument);
  return options[matcher.argument ?? options.length - 1]?.get(option);
}

/** The node and symbol one occurrence reports for one matcher, or undefined when it is not reported. */
function reportedFor(
  matcher: SymbolUsageMatcher,
  occurrence: SymbolOccurrence,
  name: string,
): { node: Node; symbol: string } | undefined {
  if (matcher.shape === "option") {
    if (occurrence.role === "reference" || matcher.option === undefined) return undefined;
    const found = optionNode(matcher, matcher.option, occurrence);
    return found ? { node: found, symbol: `${name}(${matcher.option})` } : undefined;
  }
  return roleForShape[matcher.shape] === occurrence.role ? { node: occurrence.head, symbol: name } : undefined;
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
      const reported = reportedFor(matcher, occurrence, name);
      if (!reported) continue;
      const { location, excerpt } = describe(reported.node);
      const key = `${location.line}:${location.column}:${reported.symbol}`;
      if (seen.has(key)) continue;
      seen.add(key);
      usages.push({
        kind: "symbol",
        language: file.language,
        symbol: reported.symbol,
        location,
        excerpt,
      });
    }
  }
  return usages;
}

/** Keeps the first usage of each kind, line, column, and symbol, in the order given. */
export function distinctUsages(usages: readonly SourceUsage[]): SourceUsage[] {
  const seen = new Set<string>();
  return usages.filter((usage) => {
    const key = `${usage.kind}:${usage.location.line}:${usage.location.column}:${usage.symbol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Orders usages by line, then column. */
export function sortUsages(usages: SourceUsage[]): SourceUsage[] {
  return usages.sort(
    (left, right) =>
      (left.location.line ?? 0) - (right.location.line ?? 0) ||
      (left.location.column ?? 0) - (right.location.column ?? 0),
  );
}

/** A Python option is a keyword argument anywhere in the call, or a positional argument at the declared position. */
function pythonOption(
  options: readonly Map<string, Node>[],
  name: string,
  position: number | undefined,
): Node | undefined {
  for (const entries of options) {
    const found = entries.get(name);
    if (found) return found;
  }
  return position === undefined ? undefined : options[position]?.get(positionalKey);
}
