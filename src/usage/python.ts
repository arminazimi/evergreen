import type { Node } from "@vscode/tree-sitter-wasm";

import type { SourceUsage, SourceUsageContract } from "../domain.js";
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
