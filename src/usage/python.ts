import type { Node, Query } from "./vendor/tree-sitter/tree-sitter.js";

import type { CallUsageMatcher, SourceUsage, SourceUsageContract, SymbolUsageMatcher } from "../domain.js";
import { required } from "../required.js";
import { BindingBudget, type ImportBinding } from "./binding-budget.js";
import { positionalKey, symbolMatchersFor, symbolUsages, wantsReferences, type SymbolOccurrence } from "./symbols.js";
import { lineLocator, loadQuery, parseSource } from "./tree-sitter.js";
import { describeAt, usageAt, UsageList, type UsageContext } from "./usage-results.js";

export interface PythonSourceFile {
  /** Repository-relative POSIX path, reported in every usage location. */
  path: string;
  language: "python";
  source: string;
}

type Binding = ImportBinding;

interface Chain {
  head: Node;
  path: string[];
}

/** Usage map from {@link analyzePythonFile}; `analysisCapped` is set when the binding ceiling refused further work. */
export type PythonUsageMap = Map<string, SourceUsage[]> & {
  analysisCapped?: boolean;
};

/** `get = requests.get` and `session = requests` rebind an imported symbol under a new name. */
function rebindImportedAliases(budget: BindingBudget<Node>): void {
  const { bindings, aliases } = budget;
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const alias of aliases) {
      if (budget.capped) break;
      const chain = chainOf(alias.value);
      if (!chain || !alias.local) continue;
      const rest = chain.path.slice(1);
      for (const binding of bindings.filter((candidate) => candidate.local === chain.path[0])) {
        changed =
          budget.addBinding({
            module: binding.module,
            local: alias.local,
            imported: symbolPath(binding, rest),
          }) || changed;
      }
    }
    if (!changed || budget.capped) break;
  }
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
  if (
    [
      "function_definition",
      "class_definition",
      "keyword_argument",
      "default_parameter",
      "typed_parameter",
      "typed_default_parameter",
    ].includes(parent.type)
  ) {
    if (parent.childForFieldName("name")?.id === node.id) return true;
  }
  if (parent.type === "attribute" && parent.childForFieldName("attribute")?.id === node.id) return true;
  if (
    ["assignment", "augmented_assignment", "for_statement", "for_in_clause"].includes(parent.type) &&
    parent.childForFieldName("left")?.id === node.id
  )
    return true;
  return [
    "dotted_name",
    "aliased_import",
    "import_statement",
    "import_from_statement",
    "parameters",
    "lambda_parameters",
    "as_pattern",
    "list_splat_pattern",
    "dictionary_splat_pattern",
    "global_statement",
    "nonlocal_statement",
  ].includes(parent.type);
}

/** A module matches itself and its submodules, as in the regex scanner. */
function moduleMatches(actual: string, expected: string): boolean {
  return actual === expected || actual.startsWith(`${expected}.`);
}

/** The import bindings one matched import statement contributes. */
function importBindings(captured: ReadonlyMap<string, Node>, module: string): Binding[] {
  const dotted = captured.get("binding.dotted");
  const name = captured.get("binding.name");
  const alias = captured.get("binding.alias")?.text;
  if (dotted)
    return [
      {
        module,
        local: required(module.split(".")[0], "module name"),
        imported: "*",
      },
    ];
  if (name) return [{ module, local: alias ?? name.text, imported: name.text }];
  if (alias) return [{ module, local: alias, imported: "*" }];
  return [];
}

interface ModuleReference {
  module: string;
  node: Node;
}

/**
 * Records what each query match contributes to the budget: an import's bindings, an alias, or a call. Returns the
 * module each import statement names, keyed by the offset of the module, and the classes that may be test cases.
 */
function indexMatches(
  query: Query,
  root: Node,
  budget: BindingBudget<Node>,
): { references: Map<number, ModuleReference>; classCandidates: Node[] } {
  const references = new Map<number, ModuleReference>();
  const classCandidates: Node[] = [];
  for (const match of query.matches(root)) {
    const captured = new Map<string, Node>();
    for (const capture of match.captures) captured.set(capture.name, capture.node);
    const moduleNode = captured.get("module");
    const aliasValue = captured.get("alias.value");
    const aliasLocal = captured.get("alias.local");
    if (moduleNode) {
      references.set(moduleNode.startIndex, {
        module: moduleNode.text,
        node: moduleNode,
      });
      for (const binding of importBindings(captured, moduleNode.text)) budget.addBinding(binding);
    } else if (aliasValue && aliasLocal) {
      budget.addAlias({
        local: aliasLocal.text,
        pattern: undefined,
        value: aliasValue,
      });
    } else {
      const callee = captured.get("callee");
      if (callee) budget.addCallee(callee);
      const testcaseClass = captured.get("testcase.class");
      if (testcaseClass) classCandidates.push(testcaseClass);
    }
  }
  return { references, classCandidates };
}

/** Positions whose parent reads the node as a callee or receiver, so the call occurrence already covers it. */
const calleeFieldByParent = new Map([
  ["attribute", "object"],
  ["call", "function"],
]);

function isCalleeOrReceiver(node: Node): boolean {
  const parent = node.parent;
  const field = parent ? calleeFieldByParent.get(parent.type) : undefined;
  return field !== undefined && parent?.childForFieldName(field)?.id === node.id;
}

/**
 * Every call and (when `wantsReferences`) bare name in the file, as the symbol matchers read them. A callee is reported
 * once as a call; a name is reported as a reference only where it is not a declaration and not the receiver or callee
 * of another expression.
 */
function pythonOccurrences(root: Node, callees: readonly Node[], wantsReferences: boolean): SymbolOccurrence[] {
  const occurrences: SymbolOccurrence[] = [];
  const used = new Set<number>();
  for (const callee of callees) {
    const chain = chainOf(callee);
    const call = callee.parent;
    if (!chain || !call) continue;
    used.add(callee.id);
    occurrences.push({
      head: chain.head,
      path: chain.path,
      role: "call",
      options: argumentOptions(call.childForFieldName("arguments")),
    });
  }
  if (!wantsReferences) return occurrences;
  for (const node of root.descendantsOfType(["identifier", "attribute"])) {
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

/** What the usage matchers of one file read from. */
interface PythonScope {
  context: UsageContext;
  references: ReadonlyMap<number, ModuleReference>;
  bindings: readonly Binding[];
  callees: readonly Node[];
  testcaseClassIds: ReadonlySet<number>;
  occurrencesOf: () => SymbolOccurrence[];
}

/** Reports each import statement that names the matcher's module or one of its submodules. */
function importUsages(module: string, scope: PythonScope, usages: UsageList): void {
  for (const reference of scope.references.values()) {
    if (!moduleMatches(reference.module, module)) continue;
    usages.add(usageAt(scope.context, "import", module, reference.node.startIndex));
  }
}

/** Whether a call's target path is one the matcher asks for: the module itself (`default`), or a dotted symbol. */
function isCallTarget(target: string, binding: Binding, symbol: string, rest: readonly string[]): boolean {
  return target === "default"
    ? (binding.imported === "*" || binding.imported === "default") && rest.length === 0
    : symbol === target;
}

/** Reports each call whose callee reads from a binding of the matcher's module and names one of its targets. */
function callUsages(matcher: CallUsageMatcher, scope: PythonScope, usages: UsageList): void {
  const matching = scope.bindings.filter((binding) => moduleMatches(binding.module, matcher.module));
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

/**
 * Reports a call by name on any receiver inside a unittest.TestCase subclass, at the method name. It does not go
 * through symbol resolution: the receiver may be `self`, `cls`, another object, or absent from the imports.
 */
function methodUsages(matcher: SymbolUsageMatcher, scope: PythonScope, usages: UsageList): void {
  for (const callee of scope.callees) {
    if (callee.type !== "attribute") continue;
    const attribute = callee.childForFieldName("attribute");
    if (!attribute || attribute.text !== matcher.symbol) continue;
    if (!isInsideTestcaseClass(callee, scope.testcaseClassIds)) continue;
    const symbol = matcher.module === undefined ? matcher.symbol : `${matcher.module}.${matcher.symbol}`;
    usages.add(usageAt(scope.context, "symbol", symbol, attribute.startIndex));
  }
}

/** The usages one contract's matchers find in the file, in source order. */
function contractUsages(contract: SourceUsageContract, scope: PythonScope): SourceUsage[] {
  const usages = new UsageList();
  for (const matcher of contract.matchers) {
    if (matcher.language !== "python") continue;
    if (matcher.kind === "import") importUsages(matcher.module, scope, usages);
    else if (matcher.kind === "call") callUsages(matcher, scope, usages);
  }
  const symbols = symbolMatchersFor(contract, "python");
  // `method` matchers are not resolved through imports, so they are kept apart from the named shapes.
  const named = symbols.filter((matcher) => matcher.shape !== "method");
  if (named.length > 0) {
    const describe = (node: Node): Pick<SourceUsage, "location" | "excerpt"> =>
      describeAt(scope.context, node.startIndex);
    for (const usage of symbolUsages(named, scope.occurrencesOf(), scope.bindings, describe, scope.context)) {
      usages.add(usage);
    }
  }
  for (const matcher of symbols.filter((candidate) => candidate.shape === "method")) {
    methodUsages(matcher, scope, usages);
  }
  return usages.sorted();
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
): Promise<PythonUsageMap | undefined> {
  const tree = await parseSource("python", file.source);
  if (!tree) return undefined;
  try {
    const query = await loadQuery("python", "python");
    const budget = new BindingBudget<Node>();
    const { references, classCandidates } = indexMatches(query, tree.rootNode, budget);
    rebindImportedAliases(budget);

    const scope = pythonScope(file, tree.rootNode, budget, references, classCandidates, contracts);
    const results = new Map<string, SourceUsage[]>();
    for (const contract of contracts) results.set(contract.id, contractUsages(contract, scope));
    if (budget.capped) (results as PythonUsageMap).analysisCapped = true;
    return results;
  } finally {
    tree.delete();
  }
}

/** The scope the matchers read from, once the file's imports, aliases, and calls are indexed. */
function pythonScope(
  file: PythonSourceFile,
  root: Node,
  budget: BindingBudget<Node>,
  references: ReadonlyMap<number, ModuleReference>,
  classCandidates: readonly Node[],
  contracts: readonly SourceUsageContract[],
): PythonScope {
  const withReferences = wantsReferences(contracts, "python");
  const testcaseClassIds = new Set(
    classCandidates.filter((node) => isTestcaseClass(node, budget.bindings)).map((node) => node.id),
  );
  let occurrences: SymbolOccurrence[] | undefined;
  return {
    context: {
      path: file.path,
      language: "python",
      lines: file.source.split(/\r?\n/),
      locate: lineLocator(file.source),
    },
    references,
    bindings: budget.bindings,
    callees: budget.callees,
    testcaseClassIds,
    occurrencesOf: () => (occurrences ??= pythonOccurrences(root, budget.callees, withReferences)),
  };
}

/** Whether the closest class around a node is one that subclasses unittest.TestCase. */
function isInsideTestcaseClass(node: Node, testcaseClassIds: ReadonlySet<number>): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (current.type === "class_definition") return testcaseClassIds.has(current.id);
  }
  return false;
}

/** Whether a class definition lists a unittest.TestCase base among its superclasses. */
function isTestcaseClass(node: Node, bindings: readonly Binding[]): boolean {
  const superclasses = node.childForFieldName("superclasses");
  return superclasses?.namedChildren.some((base) => base !== null && isTestcaseBase(base, bindings)) ?? false;
}

/** A base is TestCase, an alias of it, or `unittest.TestCase` reached through the unittest module name. */
function isTestcaseBase(node: Node, bindings: readonly Binding[]): boolean {
  if (node.type === "identifier") {
    return bindings.some(
      (binding) =>
        binding.local === node.text && moduleMatches(binding.module, "unittest") && binding.imported === "TestCase",
    );
  }
  if (node.type !== "attribute") return false;
  const chain = chainOf(node);
  if (!chain || chain.path.at(-1) !== "TestCase") return false;
  return bindings.some(
    (binding) =>
      binding.local === chain.path[0] && moduleMatches(binding.module, "unittest") && binding.imported === "*",
  );
}
