import type { Node, Query } from "./vendor/tree-sitter/tree-sitter.js";

import type { CallUsageMatcher, SourceUsage, SourceUsageContract } from "../domain.js";
import { required } from "../required.js";
import { BindingBudget, maximumImportBindings, type ImportBinding } from "./binding-budget.js";
import { symbolMatchersFor, symbolUsages, wantsReferences, type SymbolOccurrence } from "./symbols.js";
import { grammarFor, lineLocator, loadQuery, parseSource } from "./tree-sitter.js";
import { describeAt, usageAt, UsageList, type UsageContext } from "./usage-results.js";

export { maximumImportBindings };

export interface JavaScriptSourceFile {
  /** Repository-relative POSIX path, reported in every usage location. */
  path: string;
  language: "javascript" | "typescript";
  source: string;
}

type Binding = ImportBinding;

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
  if (
    [
      "variable_declarator",
      "function_declaration",
      "class_declaration",
      "method_definition",
      "assignment_pattern",
      "pair_pattern",
    ].includes(parent.type)
  ) {
    const named = parent.childForFieldName("name") ?? parent.childForFieldName("left");
    if (named?.id === node.id) return true;
  }
  return [
    "formal_parameters",
    "required_parameter",
    "optional_parameter",
    "rest_pattern",
    "import_specifier",
    "import_clause",
    "namespace_import",
    "export_specifier",
    "object_pattern",
    "array_pattern",
    "labeled_statement",
    "type_annotation",
  ].includes(parent.type);
}

/** The property of `const a = require("m").a`; its query rule always captures `@binding.property` too. */
function boundPropertyName(captured: ReadonlyMap<string, Node>): string {
  return required(captured.get("binding.property"), "bound property").text;
}

/** Usage map from {@link analyzeJavaScriptFile}; `analysisCapped` is set when the binding ceiling refused further work. */
export type JavaScriptUsageMap = Map<string, SourceUsage[]> & {
  analysisCapped?: boolean;
};

/** Positions whose parent reads the node as a callee or receiver, so the call occurrence already covers it. */
const calleeFieldByParent = new Map([
  ["member_expression", "object"],
  ["call_expression", "function"],
  ["new_expression", "constructor"],
]);

/**
 * Every call, construction, and (when `wantsReferences`) bare name in the file, as the symbol matchers read them.
 * A callee is reported once as a call; a name is reported as a reference only where it is not a declaration and
 * not the receiver or callee of another expression.
 */
export function javaScriptOccurrences(
  root: Node,
  callees: readonly Node[],
  wantsReferences: boolean,
): SymbolOccurrence[] {
  const occurrences: SymbolOccurrence[] = [];
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
  if (!wantsReferences) return occurrences;
  for (const node of root.descendantsOfType(["identifier", "member_expression"])) {
    if (!node || used.has(node.id) || namesADeclaration(node) || isCalleeOrReceiver(node)) continue;
    const chain = chainOf(node);
    if (chain)
      occurrences.push({
        head: chain.head,
        path: chain.path,
        role: "reference",
      });
  }
  return occurrences;
}

function isCalleeOrReceiver(node: Node): boolean {
  const parent = node.parent;
  const field = parent ? calleeFieldByParent.get(parent.type) : undefined;
  return field !== undefined && parent?.childForFieldName(field)?.id === node.id;
}

/** `const get = request.get` and `const { post } = request` rebind an imported symbol under a new name. */
function rebindImportedAliases(budget: BindingBudget<Node>): void {
  const { bindings, aliases } = budget;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const alias of aliases) {
      if (budget.capped) break;
      const chain = chainOf(alias.value);
      if (!chain) continue;
      const rest = chain.path.slice(1);
      for (const binding of bindings.filter((candidate) => candidate.local === chain.path[0])) {
        if (alias.local !== undefined) {
          changed =
            budget.addBinding({
              module: binding.module,
              local: alias.local,
              imported: symbolPath(binding, rest),
            }) || changed;
        } else if (alias.pattern) {
          for (const entry of patternEntries(alias.pattern)) {
            changed =
              budget.addBinding({
                module: binding.module,
                local: entry.local,
                imported: symbolPath(binding, [...rest, entry.key]),
              }) || changed;
          }
        }
      }
    }
    if (!changed || budget.capped) break;
  }
}

/** The import bindings one matched import statement contributes, in the order the query captures them. */
function importBindings(captured: ReadonlyMap<string, Node>, module: string): Binding[] {
  const bindings: Binding[] = [];
  const defaultBinding = captured.get("binding.default");
  const namespace = captured.get("binding.namespace");
  const name = captured.get("binding.name");
  const pattern = captured.get("binding.pattern");
  const member = captured.get("binding.member");
  if (defaultBinding) bindings.push({ module, local: defaultBinding.text, imported: "default" });
  if (namespace) bindings.push({ module, local: namespace.text, imported: "*" });
  if (name) {
    const imported = name.text.replace(/^["']|["']$/g, "");
    bindings.push({
      module,
      local: captured.get("binding.alias")?.text ?? imported,
      imported,
    });
  }
  if (pattern) {
    for (const entry of patternEntries(pattern)) bindings.push({ module, local: entry.local, imported: entry.key });
  }
  if (member)
    bindings.push({
      module,
      local: member.text,
      imported: boundPropertyName(captured),
    });
  return bindings;
}

/**
 * Records what each query match contributes to the budget: an import's bindings, a destructuring alias, or a call.
 * Returns the module each import statement names, keyed by the offset of the module string.
 */
function indexMatches(query: Query, root: Node, budget: BindingBudget<Node>): Map<number, ModuleReference> {
  const references = new Map<number, ModuleReference>();
  for (const match of query.matches(root)) {
    const captured = new Map<string, Node>();
    for (const capture of match.captures) captured.set(capture.name, capture.node);
    const moduleNode = captured.get("module");
    const aliasValue = captured.get("alias.value");
    const callee = captured.get("callee");
    if (moduleNode) {
      references.set(moduleNode.startIndex, {
        module: moduleNode.text,
        node: moduleNode,
      });
      for (const binding of importBindings(captured, moduleNode.text)) budget.addBinding(binding);
    } else if (aliasValue) {
      budget.addAlias({
        local: captured.get("alias.local")?.text,
        pattern: captured.get("alias.pattern"),
        value: aliasValue,
      });
    } else if (callee) {
      budget.addCallee(callee);
    }
  }
  return references;
}

interface ModuleReference {
  module: string;
  node: Node;
}

/** What the usage matchers of one file read from: its usage context, bindings, references, and occurrences. */
interface JavaScriptScope {
  language: JavaScriptSourceFile["language"];
  context: UsageContext;
  references: ReadonlyMap<number, ModuleReference>;
  bindings: readonly Binding[];
  callees: readonly Node[];
  occurrencesOf: () => SymbolOccurrence[];
}

/** Reports each import statement that names the matcher's module. */
function importUsages(module: string, scope: JavaScriptScope, usages: UsageList): void {
  for (const reference of scope.references.values()) {
    if (reference.module !== module) continue;
    usages.add(usageAt(scope.context, "import", module, reference.node.startIndex));
  }
}

/** Whether a call's target path (`default`, or the dotted symbol after the module) is one the matcher asks for. */
function isCallTarget(target: string, binding: Binding, symbol: string, rest: readonly string[]): boolean {
  return target === "default" ? rootNames.has(binding.imported) && rest.length === 0 : symbol === target;
}

/** Reports each call whose callee reads from a binding of the matcher's module and names one of its targets. */
function callUsages(matcher: CallUsageMatcher, scope: JavaScriptScope, usages: UsageList): void {
  const matching = scope.bindings.filter((binding) => binding.module === matcher.module);
  for (const callee of scope.callees) {
    const chain = chainOf(callee);
    if (!chain) continue;
    const rest = chain.path.slice(1);
    for (const binding of matching) {
      if (binding.local !== chain.path[0]) continue;
      const symbol = symbolPath(binding, rest);
      for (const target of matcher.targets) {
        if (!isCallTarget(target, binding, symbol, rest)) continue;
        const reported = target === "default" ? matcher.module : `${matcher.module}.${target}`;
        usages.add(usageAt(scope.context, "call", reported, chain.head.startIndex));
      }
    }
  }
}

/** The usages one contract's matchers find in the file, in source order. */
function contractUsages(contract: SourceUsageContract, scope: JavaScriptScope): SourceUsage[] {
  const usages = new UsageList();
  const language = scope.language;
  for (const matcher of contract.matchers) {
    if (matcher.language !== language) continue;
    if (matcher.kind === "import") importUsages(matcher.module, scope, usages);
    else if (matcher.kind === "call") callUsages(matcher, scope, usages);
  }
  const symbols = symbolMatchersFor(contract, language);
  if (symbols.length > 0) {
    const describe = (node: Node): Pick<SourceUsage, "location" | "excerpt"> =>
      describeAt(scope.context, node.startIndex);
    for (const usage of symbolUsages(symbols, scope.occurrencesOf(), scope.bindings, describe, scope.context)) {
      usages.add(usage);
    }
  }
  return usages.sorted();
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
): Promise<JavaScriptUsageMap | undefined> {
  const grammar = grammarFor(file.language, file.path);
  if (!grammar) return undefined;
  const tree = await parseSource(grammar, file.source);
  if (!tree) return undefined;
  try {
    const query = await (grammar === "javascript"
      ? loadQuery(grammar, "javascript")
      : loadQuery(grammar, "javascript", "typescript"));
    const budget = new BindingBudget<Node>();
    const references = indexMatches(query, tree.rootNode, budget);
    rebindImportedAliases(budget);

    const withReferences = wantsReferences(contracts, file.language);
    let occurrences: SymbolOccurrence[] | undefined;
    const scope: JavaScriptScope = {
      language: file.language,
      context: {
        path: file.path,
        language: file.language,
        lines: file.source.split(/\r?\n/),
        locate: lineLocator(file.source),
      },
      references,
      bindings: budget.bindings,
      callees: budget.callees,
      occurrencesOf: () => (occurrences ??= javaScriptOccurrences(tree.rootNode, budget.callees, withReferences)),
    };

    const results = new Map<string, SourceUsage[]>();
    for (const contract of contracts) results.set(contract.id, contractUsages(contract, scope));
    if (budget.capped) (results as JavaScriptUsageMap).analysisCapped = true;
    return results;
  } finally {
    tree.delete();
  }
}
