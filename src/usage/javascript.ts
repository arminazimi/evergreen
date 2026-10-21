import type { Node } from "@vscode/tree-sitter-wasm";

import type { SourceUsage, SourceUsageContract, SymbolUsageMatcher } from "../domain.js";
import { symbolUsages, type SymbolOccurrence } from "./symbols.js";
import { grammarFor, loadQuery, parseSource } from "./tree-sitter.js";

export interface JavaScriptSourceFile {
  /** Repository-relative POSIX path, reported in every usage location. */
  path: string;
  language: "javascript" | "typescript";
  source: string;
}

interface Binding {
  module: string;
  local: string;
  /** The exported name, or "*" / "default" when the local name stands for the module itself. */
  imported: string;
}

interface Chain {
  head: Node;
  path: string[];
}

const rootNames = new Set(["*", "default"]);

/** `a`, `a.b.c`, `a?.b`, `(a as T).b`, and `a!.b` as a head identifier plus property names. */
function chainOf(node: Node): Chain | undefined {
  switch (node.type) {
    case "identifier":
      return { head: node, path: [node.text] };
    case "member_expression": {
      const object = node.childForFieldName("object");
      const property = node.childForFieldName("property");
      if (!object || property?.type !== "property_identifier") return undefined;
      const inner = chainOf(object);
      return inner && { head: inner.head, path: [...inner.path, property.text] };
    }
    case "parenthesized_expression":
    case "non_null_expression":
    case "as_expression":
    case "satisfies_expression": {
      const inner = node.namedChild(0);
      return inner ? chainOf(inner) : undefined;
    }
    default:
      return undefined;
  }
}

/** Entries of `{ a, b: c, d = 1 }` as the property they read and the local name they bind. */
function patternEntries(pattern: Node): { key: string; local: string }[] {
  const entries: { key: string; local: string }[] = [];
  for (const child of pattern.namedChildren) {
    if (!child) continue;
    if (child.type === "shorthand_property_identifier_pattern") {
      entries.push({ key: child.text, local: child.text });
    } else if (child.type === "object_assignment_pattern") {
      const left = child.childForFieldName("left");
      if (left) entries.push({ key: left.text, local: left.text });
    } else if (child.type === "pair_pattern") {
      const key = child.childForFieldName("key");
      let value = child.childForFieldName("value");
      if (value?.type === "assignment_pattern") value = value.childForFieldName("left");
      if (key?.type === "property_identifier" && value?.type === "identifier") {
        entries.push({ key: key.text, local: value.text });
      }
    }
  }
  return entries;
}

/** The symbol a binding denotes once `rest` has been read from it, such as `get` for `request.get`. */
function symbolPath(binding: Binding, rest: readonly string[]): string {
  if (rootNames.has(binding.imported)) return rest.length === 0 ? binding.imported : rest.join(".");
  return [binding.imported, ...rest].join(".");
}

/** Property names of an object literal argument, each with the node of its name. */
function objectOptions(argument: Node): Map<string, Node> {
  const options = new Map<string, Node>();
  if (argument.type !== "object") return options;
  for (const child of argument.namedChildren) {
    if (!child) continue;
    if (child.type === "shorthand_property_identifier") options.set(child.text, child);
    else if (child.type === "pair") {
      const key = child.childForFieldName("key");
      if (key) options.set(key.text.replace(/^["']|["']$/g, ""), key);
    }
  }
  return options;
}

/** Positions where an identifier or member expression names something rather than uses it. */
function namesADeclaration(node: Node): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (["variable_declarator", "function_declaration", "class_declaration", "method_definition", "assignment_pattern", "pair_pattern"].includes(parent.type)) {
    const named = parent.childForFieldName("name") ?? parent.childForFieldName("left");
    if (named?.id === node.id) return true;
  }
  return [
    "formal_parameters", "required_parameter", "optional_parameter", "rest_pattern", "import_specifier", "import_clause", "namespace_import",
    "export_specifier", "object_pattern", "array_pattern", "labeled_statement", "type_annotation",
  ].includes(parent.type);
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (const match of source.matchAll(/\r?\n/g)) starts.push(match.index + match[0].length);
  return starts;
}

/**
 * Finds import and call usages in one JavaScript or TypeScript file with the tree-sitter queries in
 * `queries/javascript.scm`. Returns undefined when the file cannot be parsed (too large or over budget),
 * so the caller can fall back to the regex scanner.
 *
 * Bindings are tracked by name for the whole file; shadowing by a nested scope is not modelled.
 */
export async function analyzeJavaScriptFile(
  file: JavaScriptSourceFile,
  contracts: readonly SourceUsageContract[],
): Promise<Map<string, SourceUsage[]> | undefined> {
  const grammar = grammarFor(file.language, file.path);
  if (!grammar) return undefined;
  const tree = await parseSource(grammar, file.source);
  if (!tree) return undefined;
  try {
    const query = await (grammar === "javascript" ? loadQuery(grammar, "javascript") : loadQuery(grammar, "javascript", "typescript"));
    const starts = lineStarts(file.source);
    const lines = file.source.split(/\r?\n/);

    const locate = (node: Node): { line: number; column: number } => {
      let low = 0;
      let high = starts.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (starts[middle]! <= node.startIndex) low = middle;
        else high = middle - 1;
      }
      return { line: low + 1, column: node.startIndex - starts[low]! + 1 };
    };

    const references = new Map<number, { module: string; node: Node }>();
    const bindings: Binding[] = [];
    const aliases: { local: string | undefined; pattern: Node | undefined; value: Node }[] = [];
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
      const module = moduleNode?.text;
      if (moduleNode && module !== undefined) {
        references.set(moduleNode.startIndex, { module, node: moduleNode });
        const defaultBinding = captured.get("binding.default");
        const namespace = captured.get("binding.namespace");
        const name = captured.get("binding.name");
        const pattern = captured.get("binding.pattern");
        const member = captured.get("binding.member");
        if (defaultBinding) addBinding({ module, local: defaultBinding.text, imported: "default" });
        if (namespace) addBinding({ module, local: namespace.text, imported: "*" });
        if (name) {
          const imported = name.text.replace(/^["']|["']$/g, "");
          addBinding({ module, local: captured.get("binding.alias")?.text ?? imported, imported });
        }
        if (pattern) {
          for (const entry of patternEntries(pattern)) addBinding({ module, local: entry.local, imported: entry.key });
        }
        if (member) addBinding({ module, local: member.text, imported: captured.get("binding.property")!.text });
        continue;
      }
      const aliasValue = captured.get("alias.value");
      if (aliasValue) {
        aliases.push({ local: captured.get("alias.local")?.text, pattern: captured.get("alias.pattern"), value: aliasValue });
        continue;
      }
      const callee = captured.get("callee");
      if (callee) callees.push(callee);
    }

    // `const get = request.get` and `const { post } = request` rebind an imported symbol under a new name.
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      for (const alias of aliases) {
        const chain = chainOf(alias.value);
        if (!chain) continue;
        const rest = chain.path.slice(1);
        for (const binding of bindings.filter((candidate) => candidate.local === chain.path[0])) {
          if (alias.local !== undefined) {
            changed = addBinding({ module: binding.module, local: alias.local, imported: symbolPath(binding, rest) }) || changed;
          } else if (alias.pattern) {
            for (const entry of patternEntries(alias.pattern)) {
              const imported = symbolPath(binding, [...rest, entry.key]);
              changed = addBinding({ module: binding.module, local: entry.local, imported }) || changed;
            }
          }
        }
      }
      if (!changed) break;
    }

    const symbolMatchers = (contract: SourceUsageContract): SymbolUsageMatcher[] =>
      contract.matchers.filter((matcher): matcher is SymbolUsageMatcher => matcher.kind === "symbol" && matcher.language === file.language);
    let occurrences: SymbolOccurrence[] | undefined;
    const wantsReferences = contracts.some((contract) => symbolMatchers(contract).some((matcher) => matcher.shape === "reference"));
    const occurrencesOf = (): SymbolOccurrence[] => {
      if (occurrences) return occurrences;
      occurrences = [];
      const used = new Set<number>();
      for (const callee of callees) {
        const chain = chainOf(callee);
        const call = callee.parent;
        if (!chain || !call) continue;
        used.add(callee.id);
        const args = call.childForFieldName("arguments");
        occurrences.push({
          head: chain.head,
          path: chain.path,
          role: call.type === "new_expression" ? "construct" : "call",
          options: args ? args.namedChildren.flatMap((argument) => (argument ? [objectOptions(argument)] : [])) : [],
        });
      }
      if (wantsReferences) {
        for (const node of tree.rootNode.descendantsOfType(["identifier", "member_expression"])) {
          if (!node || used.has(node.id) || namesADeclaration(node)) continue;
          const parent = node.parent;
          if (parent?.type === "member_expression" && parent.childForFieldName("object")?.id === node.id) continue;
          if (parent?.type === "call_expression" && parent.childForFieldName("function")?.id === node.id) continue;
          if (parent?.type === "new_expression" && parent.childForFieldName("constructor")?.id === node.id) continue;
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
        if (matcher.language !== file.language) continue;
        if (matcher.kind === "import") {
          for (const reference of references.values()) {
            if (reference.module !== matcher.module) continue;
            const { line, column } = locate(reference.node);
            push({
              kind: "import",
              language: file.language,
              symbol: matcher.module,
              location: { path: file.path, line, column },
              excerpt: lines[line - 1]!.trim(),
            });
          }
        } else if (matcher.kind === "call") {
          const matching = bindings.filter((binding) => binding.module === matcher.module);
          for (const callee of callees) {
            const chain = chainOf(callee);
            if (!chain) continue;
            const rest = chain.path.slice(1);
            for (const binding of matching) {
              if (binding.local !== chain.path[0]) continue;
              const symbol = symbolPath(binding, rest);
              for (const target of matcher.targets) {
                const hit = target === "default" ? rootNames.has(binding.imported) && rest.length === 0 : symbol === target;
                if (!hit) continue;
                const { line, column } = locate(chain.head);
                push({
                  kind: "call",
                  language: file.language,
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
          const { line, column } = locate(node);
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
