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
import { BindingBudget, maximumImportBindings, type ImportBinding } from "./binding-budget.js";
import { distinctUsages, sortUsages, symbolUsages, type SymbolOccurrence } from "./symbols.js";
import { grammarFor, lineExcerpt, lineLocator, loadQuery, parseSource } from "./tree-sitter.js";

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

/** A module import site in the file, keyed by the module's position so each is reported once. */
interface Reference {
  module: string;
  node: Node;
}

/** What one file's matchers are evaluated against, read once from the syntax tree. */
interface FileUsages {
  file: JavaScriptSourceFile;
  describe: (node: Node) => Pick<SourceUsage, "location" | "excerpt">;
  references: ReadonlyMap<number, Reference>;
  bindings: readonly Binding[];
  callees: readonly Node[];
}

const rootNames = new Set(["*", "default"]);

/** Parent positions in which a name is the object or callee of a larger expression, which call occurrences report. */
const operandPositions: [type: string, field: string][] = [
  ["member_expression", "object"],
  ["call_expression", "function"],
  ["new_expression", "constructor"],
];

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
function boundPropertyName(captured: Map<string, Node>): string {
  return required(captured.get("binding.property"), "bound property").text;
}

/** Usage map from {@link analyzeJavaScriptFile}; `analysisCapped` is set when the binding ceiling refused further work. */
export type JavaScriptUsageMap = Map<string, SourceUsage[]> & {
  analysisCapped?: boolean;
};

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

/** The bindings one import match creates: default, namespace, named, destructured, and member bindings, in that order. */
function importBindings(module: string, captured: Map<string, Node>): Binding[] {
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

/** Reads every query match of the file into the budget and returns the module import sites. */
function collectMatches(query: Query, root: Node, budget: BindingBudget<Node>): Map<number, Reference> {
  const references = new Map<number, Reference>();
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
    if (aliasValue) {
      budget.addAlias({
        local: captured.get("alias.local")?.text,
        pattern: captured.get("alias.pattern"),
        value: aliasValue,
      });
      continue;
    }
    const callee = captured.get("callee");
    if (callee) budget.addCallee(callee);
  }
  return references;
}

/** The option names each argument of a call offers, one map per argument position. */
function optionsOf(args: Node | null): Map<string, Node>[] {
  return args ? args.namedChildren.flatMap((argument) => (argument ? [objectOptions(argument)] : [])) : [];
}

/** Call and construction occurrences from the recorded callees, and then, when a reference matcher asks, bare uses. */
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
      role: call.type === "new_expression" ? "construct" : "call",
      options: optionsOf(call.childForFieldName("arguments")),
    });
  }
  return wantsReferences ? occurrences.concat(referenceOccurrences(root, used)) : occurrences;
}

/** Identifiers and member reads that are used rather than called, declared, or read through a larger expression. */
function referenceOccurrences(root: Node, used: ReadonlySet<number>): SymbolOccurrence[] {
  const found: SymbolOccurrence[] = [];
  for (const node of root.descendantsOfType(["identifier", "member_expression"])) {
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

/** Import usages: every module import site that matches the matcher's module. */
function importUsages(matcher: ImportUsageMatcher, ctx: FileUsages): SourceUsage[] {
  const usages: SourceUsage[] = [];
  for (const reference of ctx.references.values()) {
    if (reference.module !== matcher.module) continue;
    usages.push({
      kind: "import",
      language: ctx.file.language,
      symbol: matcher.module,
      ...ctx.describe(reference.node),
    });
  }
  return usages;
}

/** Whether a callee path bound to `binding` denotes one of a call matcher's targets. */
function isCallTarget(binding: Binding, symbol: string, rest: readonly string[], target: string): boolean {
  return target === "default" ? rootNames.has(binding.imported) && rest.length === 0 : symbol === target;
}

/** Call usages: each callee that reads a target of the matcher's module through a binding of that module. */
function callUsages(matcher: CallUsageMatcher, ctx: FileUsages): SourceUsage[] {
  const usages: SourceUsage[] = [];
  const matching = ctx.bindings.filter((binding) => binding.module === matcher.module);
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
          language: ctx.file.language,
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
  if (matcher.language !== ctx.file.language) return [];
  if (matcher.kind === "import") return importUsages(matcher, ctx);
  if (matcher.kind === "call") return callUsages(matcher, ctx);
  return [];
}

/** The symbol matchers of a contract that apply to this file's language. */
function symbolMatchers(
  contract: SourceUsageContract,
  language: JavaScriptSourceFile["language"],
): SymbolUsageMatcher[] {
  return contract.matchers.filter(
    (matcher): matcher is SymbolUsageMatcher => matcher.kind === "symbol" && matcher.language === language,
  );
}

/** One contract's usages in this file, deduplicated and in source order. */
function contractUsages(
  contract: SourceUsageContract,
  ctx: FileUsages,
  occurrencesOf: () => SymbolOccurrence[],
): SourceUsage[] {
  const usages = contract.matchers.flatMap((matcher) => matcherUsages(matcher, ctx));
  const symbols = symbolMatchers(contract, ctx.file.language);
  const symbolFound =
    symbols.length > 0 ? symbolUsages(symbols, occurrencesOf(), ctx.bindings, ctx.describe, ctx.file) : [];
  return sortUsages(distinctUsages(usages.concat(symbolFound)));
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
    const lines = file.source.split(/\r?\n/);
    const locate = lineLocator(file.source);
    const describe = (node: Node): Pick<SourceUsage, "location" | "excerpt"> => {
      const { line, column } = locate(node.startIndex);
      return {
        location: { path: file.path, line, column },
        excerpt: lineExcerpt(lines, line),
      };
    };

    const budget = new BindingBudget<Node>();
    const references = collectMatches(query, tree.rootNode, budget);
    rebindImportedAliases(budget);

    const ctx: FileUsages = {
      file,
      describe,
      references,
      bindings: budget.bindings,
      callees: budget.callees,
    };
    const wantsReferences = contracts.some((contract) =>
      symbolMatchers(contract, file.language).some((matcher) => matcher.shape === "reference"),
    );
    let occurrences: SymbolOccurrence[] | undefined;
    const occurrencesOf = (): SymbolOccurrence[] =>
      (occurrences ??= symbolOccurrences(budget.callees, tree.rootNode, wantsReferences));

    const results = new Map<string, SourceUsage[]>();
    for (const contract of contracts) results.set(contract.id, contractUsages(contract, ctx, occurrencesOf));
    if (budget.capped) (results as JavaScriptUsageMap).analysisCapped = true;
    return results;
  } finally {
    tree.delete();
  }
}
