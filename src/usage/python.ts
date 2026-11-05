import type { Node, Query } from "./vendor/tree-sitter/tree-sitter.js";

import type {
  CallUsageMatcher,
  ImportUsageMatcher,
  SourceUsage,
  SourceUsageContract,
  SymbolUsageMatcher,
  UsageMatcher,
} from "../domain.js";
import { required } from "../required.js";
import { BindingBudget, type ImportBinding } from "./binding-budget.js";
import { distinctUsages, positionalKey, sortUsages, symbolUsages, type SymbolOccurrence } from "./symbols.js";
import { lineExcerpt, lineLocator, loadQuery, parseSource } from "./tree-sitter.js";

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

/** A module import site in the file, keyed by the module's position so each is reported once. */
interface Reference {
  module: string;
  node: Node;
}

/** What one file's matchers are evaluated against, read once from the syntax tree. */
interface FileUsages {
  file: PythonSourceFile;
  describe: (node: Node) => Pick<SourceUsage, "location" | "excerpt">;
  references: ReadonlyMap<number, Reference>;
  bindings: readonly Binding[];
  callees: readonly Node[];
}

/** Parent positions in which a name is the object or callee of a larger expression, which call occurrences report. */
const operandPositions: [type: string, field: string][] = [
  ["attribute", "object"],
  ["call", "function"],
];

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

/** The bindings one import match creates: a dotted import, a `from` import, or an alias, in that order of precedence. */
function importBindings(module: string, captured: Map<string, Node>): Binding[] {
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

/** Reads every query match of the file into the budget; returns the module import sites and the TestCase class candidates. */
function collectMatches(
  query: Query,
  root: Node,
  budget: BindingBudget<Node>,
): { references: Map<number, Reference>; classCandidates: Node[] } {
  const references = new Map<number, Reference>();
  const classCandidates: Node[] = [];
  for (const match of query.matches(root)) {
    const captured = new Map<string, Node>();
    for (const capture of match.captures) captured.set(capture.name, capture.node);
    const moduleNode = captured.get("module");
    if (moduleNode) {
      const module = moduleNode.text;
      references.set(moduleNode.startIndex, { module, node: moduleNode });
      for (const binding of importBindings(module, captured)) budget.addBinding(binding);
      continue;
    }
    const aliasValue = captured.get("alias.value");
    const aliasLocal = captured.get("alias.local");
    if (aliasValue && aliasLocal) {
      budget.addAlias({
        local: aliasLocal.text,
        pattern: undefined,
        value: aliasValue,
      });
      continue;
    }
    const callee = captured.get("callee");
    if (callee) budget.addCallee(callee);
    const testcaseClass = captured.get("testcase.class");
    if (testcaseClass) classCandidates.push(testcaseClass);
  }
  return { references, classCandidates };
}

/** Call occurrences from the recorded callees, and then, when a reference matcher asks, bare uses. */
function symbolOccurrences(callees: readonly Node[], root: Node, wantsReferences: boolean): SymbolOccurrence[] {
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
  return wantsReferences ? occurrences.concat(referenceOccurrences(root, used)) : occurrences;
}

/** Identifiers and attribute reads that are used rather than called, declared, or read through a larger expression. */
function referenceOccurrences(root: Node, used: ReadonlySet<number>): SymbolOccurrence[] {
  const found: SymbolOccurrence[] = [];
  for (const node of root.descendantsOfType(["identifier", "attribute"])) {
    if (!node || used.has(node.id) || namesADeclaration(node) || isOperandOfLarger(node)) continue;
    const chain = chainOf(node);
    if (chain) found.push({ head: chain.head, path: chain.path, role: "reference" });
  }
  return found;
}

function isOperandOfLarger(node: Node): boolean {
  const parent = node.parent;
  return operandPositions.some(
    ([type, field]) => parent?.type === type && parent.childForFieldName(field)?.id === node.id,
  );
}

/** Import usages: every module import site that matches the matcher's module, or a submodule of it. */
function importUsages(matcher: ImportUsageMatcher, ctx: FileUsages): SourceUsage[] {
  const usages: SourceUsage[] = [];
  for (const reference of ctx.references.values()) {
    if (!moduleMatches(reference.module, matcher.module)) continue;
    usages.push({
      kind: "import",
      language: "python",
      symbol: matcher.module,
      ...ctx.describe(reference.node),
    });
  }
  return usages;
}

/** Whether a callee path bound to `binding` denotes one of a call matcher's targets. */
function isCallTarget(binding: Binding, symbol: string, rest: readonly string[], target: string): boolean {
  if (target === "default") return (binding.imported === "*" || binding.imported === "default") && rest.length === 0;
  return symbol === target;
}

/** Call usages: each callee that reads a target of the matcher's module through a binding of that module. */
function callUsages(matcher: CallUsageMatcher, ctx: FileUsages): SourceUsage[] {
  const usages: SourceUsage[] = [];
  const matching = ctx.bindings.filter((binding) => moduleMatches(binding.module, matcher.module));
  for (const callee of ctx.callees) {
    const chain = chainOf(callee);
    if (!chain) continue;
    const rest = chain.path.slice(1);
    for (const binding of matching) {
      if (binding.local !== chain.path[0]) continue;
      const symbol = symbolPath(binding, rest);
      for (const target of matcher.targets) {
        if (!isCallTarget(binding, symbol, rest, target)) continue;
        usages.push({
          kind: "call",
          language: "python",
          symbol: target === "default" ? matcher.module : `${matcher.module}.${target}`,
          ...ctx.describe(chain.head),
        });
      }
    }
  }
  return usages;
}

/** The usages one matcher finds. Symbol matchers are evaluated separately, over all occurrences at once. */
function matcherUsages(matcher: UsageMatcher, ctx: FileUsages): SourceUsage[] {
  if (matcher.language !== "python") return [];
  if (matcher.kind === "import") return importUsages(matcher, ctx);
  if (matcher.kind === "call") return callUsages(matcher, ctx);
  return [];
}

/**
 * `method` is a call by name on any receiver, reported at the method name, so it does not go through symbol
 * resolution: the receiver may be `self`, `cls`, another object, or absent from the imports.
 */
function methodUsages(
  matcher: SymbolUsageMatcher,
  callees: readonly Node[],
  testcaseClassIds: ReadonlySet<number>,
  describe: FileUsages["describe"],
): SourceUsage[] {
  const usages: SourceUsage[] = [];
  for (const callee of callees) {
    if (callee.type !== "attribute") continue;
    const attribute = callee.childForFieldName("attribute");
    if (attribute?.text !== matcher.symbol) continue;
    if (!isInsideTestcaseClass(callee, testcaseClassIds)) continue;
    usages.push({
      kind: "symbol",
      language: "python",
      symbol: matcher.module === undefined ? matcher.symbol : `${matcher.module}.${matcher.symbol}`,
      ...describe(attribute),
    });
  }
  return usages;
}

/** The symbol matchers of a contract, all of which are Python. */
function symbolMatchers(contract: SourceUsageContract): SymbolUsageMatcher[] {
  return contract.matchers.filter(
    (matcher): matcher is SymbolUsageMatcher => matcher.kind === "symbol" && matcher.language === "python",
  );
}

/** One contract's usages in this file, deduplicated and in source order. */
function contractUsages(
  contract: SourceUsageContract,
  ctx: FileUsages,
  testcaseClassIds: ReadonlySet<number>,
  occurrencesOf: () => SymbolOccurrence[],
): SourceUsage[] {
  const usages = contract.matchers.flatMap((matcher) => matcherUsages(matcher, ctx));
  const symbols = symbolMatchers(contract);
  const named = symbols.filter((matcher) => matcher.shape !== "method");
  const namedFound = named.length > 0 ? symbolUsages(named, occurrencesOf(), ctx.bindings, ctx.describe, ctx.file) : [];
  const methodFound = symbols
    .filter((matcher) => matcher.shape === "method")
    .flatMap((matcher) => methodUsages(matcher, ctx.callees, testcaseClassIds, ctx.describe));
  return sortUsages(distinctUsages(usages.concat(namedFound, methodFound)));
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
    const locate = lineLocator(file.source);
    const lines = file.source.split(/\r?\n/);
    const describe = (node: Node): Pick<SourceUsage, "location" | "excerpt"> => {
      const { line, column } = locate(node.startIndex);
      return {
        location: { path: file.path, line, column },
        excerpt: lineExcerpt(lines, line),
      };
    };

    const budget = new BindingBudget<Node>();
    const { references, classCandidates } = collectMatches(query, tree.rootNode, budget);
    rebindImportedAliases(budget);

    const bindings = budget.bindings;
    const testcaseClassIds = new Set(
      classCandidates.filter((node) => isTestcaseClass(node, bindings)).map((node) => node.id),
    );
    const ctx: FileUsages = {
      file,
      describe,
      references,
      bindings,
      callees: budget.callees,
    };
    const wantsReferences = contracts.some((contract) =>
      symbolMatchers(contract).some((matcher) => matcher.shape === "reference"),
    );
    let occurrences: SymbolOccurrence[] | undefined;
    const occurrencesOf = (): SymbolOccurrence[] =>
      (occurrences ??= symbolOccurrences(budget.callees, tree.rootNode, wantsReferences));

    const results = new Map<string, SourceUsage[]>();
    for (const contract of contracts) {
      results.set(contract.id, contractUsages(contract, ctx, testcaseClassIds, occurrencesOf));
    }
    if (budget.capped) (results as PythonUsageMap).analysisCapped = true;
    return results;
  } finally {
    tree.delete();
  }
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
