import type { Node } from "@vscode/tree-sitter-wasm";

import type { SourceUsage, SourceUsageContract, SymbolUsageMatcher } from "../domain.js";
import { positionalKey, symbolUsages, type SymbolOccurrence } from "./symbols.js";
import { lineLocator, loadQuery, parseSource } from "./tree-sitter.js";

export interface PythonSourceFile {
  /** Repository-relative POSIX path, reported in every usage location. */
  path: string;
  language: "python";
  source: string;
}

interface Binding {
  module: string;
  local: string;
  /** The imported name, or "*" when the local name stands for the module itself. */
  imported: string;
}

interface Chain {
  head: Node;
  path: string[];
}

/** `a`, `a.b.c`, and `(a).b` as a head identifier plus attribute names. */
function chainOf(node: Node): Chain | undefined {
  switch (node.type) {
    case "identifier":
      return { head: node, path: [node.text] };
    case "attribute": {
      const object = node.childForFieldName("object");
      const attribute = node.childForFieldName("attribute");
      if (!object || attribute?.type !== "identifier") return undefined;
      const inner = chainOf(object);
      return inner && { head: inner.head, path: [...inner.path, attribute.text] };
    }
    case "parenthesized_expression": {
      const inner = node.namedChild(0);
      return inner ? chainOf(inner) : undefined;
    }
    default:
      return undefined;
  }
}

/** The symbol a binding denotes once `rest` has been read from it, such as `get` for `requests.get`. */
function symbolPath(binding: Binding, rest: readonly string[]): string {
  if (binding.imported === "*") return rest.length === 0 ? "*" : rest.join(".");
  return [binding.imported, ...rest].join(".");
}

/** What each argument of a call offers an option check: keyword names with their nodes, or the positional marker. */
function argumentOptions(args: Node | null): Map<string, Node>[] {
  if (!args) return [];
  return args.namedChildren.flatMap((argument) => {
    if (!argument) return [];
    if (argument.type === "keyword_argument") {
      const name = argument.childForFieldName("name");
      return [new Map(name ? [[name.text, name] as [string, Node]] : [])];
    }
    return [new Map([[positionalKey, argument]])];
  });
}

/** Positions where an identifier or attribute names something rather than uses it. */
function namesADeclaration(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (["function_definition", "class_definition", "keyword_argument", "default_parameter", "typed_parameter", "typed_default_parameter"].includes(parent.type)) {
    if (parent.childForFieldName("name")?.id === node.id) return true;
  }
  if (parent.type === "attribute" && parent.childForFieldName("attribute")?.id === node.id) return true;
  if (["assignment", "augmented_assignment", "for_statement", "for_in_clause"].includes(parent.type) && parent.childForFieldName("left")?.id === node.id) return true;
  return [
    "dotted_name", "aliased_import", "import_statement", "import_from_statement", "parameters", "lambda_parameters", "as_pattern", "list_splat_pattern",
    "dictionary_splat_pattern", "global_statement", "nonlocal_statement",
  ].includes(parent.type);
}

/** A module matches itself and its submodules, as in the regex scanner. */
function moduleMatches(actual: string, expected: string): boolean {
  return actual === expected || actual.startsWith(`${expected}.`);
}

/**
 * Finds import and call usages in one Python file with the tree-sitter queries in `queries/python.scm`.
 * Returns undefined when the file cannot be parsed (too large or over budget), so the caller can fall
 * back to the regex scanner.
 *
 * Bindings are tracked by name for the whole file; shadowing by a nested scope is not modelled.
 */
export async function analyzePythonFile(
  file: PythonSourceFile,
  contracts: readonly SourceUsageContract[],
): Promise<Map<string, SourceUsage[]> | undefined> {
  const tree = await parseSource("python", file.source);
  if (!tree) return undefined;
  try {
    const query = await loadQuery("python", "python");
    const locate = lineLocator(file.source);
    const lines = file.source.split(/\r?\n/);

    const references = new Map<number, { module: string; node: Node }>();
    const bindings: Binding[] = [];
    const aliases: { local: string; value: Node }[] = [];
    const callees: Node[] = [];
    const seenBindings = new Set<string>();
    const addBinding = (binding: Binding): boolean => {
      const key = `${binding.module}\0${binding.local}\0${binding.imported}`;
      if (seenBindings.has(key)) return false;
      seenBindings.add(key);
      bindings.push(binding);
      return true;
    };

    for (const match of query.matches(tree.rootNode)) {
      const captured = new Map<string, Node>();
      for (const capture of match.captures) captured.set(capture.name, capture.node);
      const moduleNode = captured.get("module");
      if (moduleNode) {
        const module = moduleNode.text;
        references.set(moduleNode.startIndex, { module, node: moduleNode });
        const dotted = captured.get("binding.dotted");
        const name = captured.get("binding.name");
        const alias = captured.get("binding.alias")?.text;
        if (dotted) addBinding({ module, local: module.split(".")[0]!, imported: "*" });
        else if (name) addBinding({ module, local: alias ?? name.text, imported: name.text });
        else if (alias) addBinding({ module, local: alias, imported: "*" });
        continue;
      }
      const aliasValue = captured.get("alias.value");
      const aliasLocal = captured.get("alias.local");
      if (aliasValue && aliasLocal) {
        aliases.push({ local: aliasLocal.text, value: aliasValue });
        continue;
      }
      const callee = captured.get("callee");
      if (callee) callees.push(callee);
    }

    // `get = requests.get` and `session = requests` rebind an imported symbol under a new name.
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (const alias of aliases) {
        const chain = chainOf(alias.value);
        if (!chain) continue;
        const rest = chain.path.slice(1);
        for (const binding of bindings.filter((candidate) => candidate.local === chain.path[0])) {
          changed = addBinding({ module: binding.module, local: alias.local, imported: symbolPath(binding, rest) }) || changed;
        }
      }
      if (!changed) break;
    }

    const symbolMatchers = (contract: SourceUsageContract): SymbolUsageMatcher[] =>
      contract.matchers.filter((matcher): matcher is SymbolUsageMatcher => matcher.kind === "symbol" && matcher.language === "python");
    const wantsReferences = contracts.some((contract) => symbolMatchers(contract).some((matcher) => matcher.shape === "reference"));
    let occurrences: SymbolOccurrence[] | undefined;
    const occurrencesOf = (): SymbolOccurrence[] => {
      if (occurrences) return occurrences;
      occurrences = [];
      const used = new Set<number>();
      for (const callee of callees) {
        const chain = chainOf(callee);
        const call = callee.parent;
        if (!chain || !call) continue;
        used.add(callee.id);
        occurrences.push({ head: chain.head, path: chain.path, role: "call", options: argumentOptions(call.childForFieldName("arguments")) });
      }
      if (wantsReferences) {
        for (const node of tree.rootNode.descendantsOfType(["identifier", "attribute"])) {
          if (!node || used.has(node.id) || namesADeclaration(node)) continue;
          const parent = node.parent;
          if (parent?.type === "attribute" && parent.childForFieldName("object")?.id === node.id) continue;
          if (parent?.type === "call" && parent.childForFieldName("function")?.id === node.id) continue;
          const chain = chainOf(node);
          if (chain) occurrences.push({ head: chain.head, path: chain.path, role: "reference" });
        }
      }
      return occurrences;
    };

    const results = new Map<string, SourceUsage[]>();
    for (const contract of contracts) {
      const usages: SourceUsage[] = [];
      const seen = new Set<string>();
      const push = (usage: SourceUsage): void => {
        const key = `${usage.kind}:${usage.location.line}:${usage.location.column}:${usage.symbol}`;
        if (seen.has(key)) return;
        seen.add(key);
        usages.push(usage);
      };
      for (const matcher of contract.matchers) {
        if (matcher.language !== "python") continue;
        if (matcher.kind === "import") {
          for (const reference of references.values()) {
            if (!moduleMatches(reference.module, matcher.module)) continue;
            const { line, column } = locate(reference.node.startIndex);
            push({
              kind: "import",
              language: "python",
              symbol: matcher.module,
              location: { path: file.path, line, column },
              excerpt: lines[line - 1]!.trim(),
            });
          }
        } else if (matcher.kind === "call") {
          const matching = bindings.filter((binding) => moduleMatches(binding.module, matcher.module));
          for (const callee of callees) {
            const chain = chainOf(callee);
            if (!chain) continue;
            const rest = chain.path.slice(1);
            for (const binding of matching) {
              if (binding.local !== chain.path[0]) continue;
              const symbol = symbolPath(binding, rest);
              for (const target of matcher.targets) {
                const hit = target === "default" ? (binding.imported === "*" || binding.imported === "default") && rest.length === 0 : symbol === target;
                if (!hit) continue;
                const { line, column } = locate(chain.head.startIndex);
                push({
                  kind: "call",
                  language: "python",
                  symbol: target === "default" ? matcher.module : `${matcher.module}.${target}`,
                  location: { path: file.path, line, column },
                  excerpt: lines[line - 1]!.trim(),
                });
              }
            }
          }
        }
      }
      const symbols = symbolMatchers(contract);
      if (symbols.length > 0) {
        const describe = (node: Node): Pick<SourceUsage, "location" | "excerpt"> => {
          const { line, column } = locate(node.startIndex);
          return { location: { path: file.path, line, column }, excerpt: lines[line - 1]!.trim() };
        };
        for (const usage of symbolUsages(symbols, occurrencesOf(), bindings, describe, file)) push(usage);
      }
      results.set(
        contract.id,
        usages.sort((left, right) => (left.location.line ?? 0) - (right.location.line ?? 0) || (left.location.column ?? 0) - (right.location.column ?? 0)),
      );
    }
    return results;
  } finally {
    tree.delete();
  }
}
