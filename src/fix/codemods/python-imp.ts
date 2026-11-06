import type { ScanResult, UsageMatcher } from "../../domain.js";
import { required } from "../../required.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { callsByCallee } from "./shared/ast.js";
import { type Edit, patchFor } from "./shared/edits.js";
import { declineAll, groupByPath, planEachFile, sortTargets } from "./shared/plan.js";
import { offsetOf, readRepositoryFile } from "./shared/source.js";
import { analyzeTargets, syntheticFinding, type UsageTarget } from "./shared/targets.js";

interface Rule {
  id: string;
  /** The attribute read from `imp`, as in `imp.reload`. */
  symbol: string;
  title: string;
  /** The callee that replaces `imp.<symbol>`, or the whole call for a constant. */
  replacement?: string;
  /** The replacement is a value, not a call, so the whole call expression is replaced. */
  wholeCall?: boolean;
  /** The module the replacement needs, added to the imports when it is absent. */
  module?: string;
  /** Keyword arguments the replacement accepts. */
  keywords?: readonly string[];
  /** The most positional arguments the replacement reads without changing meaning. */
  maxPositional?: number;
  /** Why a call with more positional arguments than that is not rewritten. */
  overflowReason?: string;
  /** The reason a rule this codemod cannot rewrite is refused. */
  refusal?: string;
}

const rules: readonly Rule[] = [
  {
    id: "python.symbol.imp.reload",
    symbol: "reload",
    title: "Imp.reload has been removed",
    replacement: "importlib.reload",
    module: "importlib",
    keywords: ["module"],
    maxPositional: 1,
    overflowReason: "`imp.reload` takes exactly one argument.",
  },
  {
    id: "python.symbol.imp.new-module",
    symbol: "new_module",
    title: "Imp.new_module has been removed",
    replacement: "types.ModuleType",
    module: "types",
    keywords: ["name", "doc"],
    maxPositional: 1,
    overflowReason: "`imp.new_module` takes exactly one argument.",
  },
  {
    id: "python.symbol.imp.get-magic",
    symbol: "get_magic",
    title: "Imp.get_magic has been removed",
    replacement: "importlib.util.MAGIC_NUMBER",
    wholeCall: true,
    module: "importlib.util",
  },
  {
    id: "python.symbol.imp.get-tag",
    symbol: "get_tag",
    title: "Imp.get_tag has been removed",
    replacement: "sys.implementation.cache_tag",
    wholeCall: true,
    module: "sys",
  },
  {
    id: "python.symbol.imp.cache-from-source",
    symbol: "cache_from_source",
    title: "Imp.cache_from_source has been removed",
    replacement: "importlib.util.cache_from_source",
    module: "importlib.util",
    keywords: ["path", "optimization", "debug_override"],
    maxPositional: 1,
    overflowReason:
      "A second positional argument means `debug_override` in `imp` but `optimization` in `importlib.util`.",
  },
  {
    id: "python.symbol.imp.source-from-cache",
    symbol: "source_from_cache",
    title: "Imp.source_from_cache has been removed",
    replacement: "importlib.util.source_from_cache",
    module: "importlib.util",
    keywords: ["path"],
    maxPositional: 1,
    overflowReason: "`imp.source_from_cache` takes exactly one argument.",
  },
  {
    id: "python.symbol.imp.find-module",
    symbol: "find_module",
    title: "Imp.find_module has been removed",
    refusal: "No exact replacement exists for `imp.find_module`; `importlib.util.find_spec` returns a different shape.",
  },
  {
    id: "python.symbol.imp.load-module",
    symbol: "load_module",
    title: "Imp.load_module has been removed",
    refusal:
      "No exact replacement exists for `imp.load_module`; `importlib.import_module` loads an installed module, not a finder tuple.",
  },
  {
    id: "python.symbol.imp.load-source",
    symbol: "load_source",
    title: "Imp.load_source has been removed",
    refusal:
      "No exact replacement exists for `imp.load_source`; `importlib.machinery.SourceFileLoader` needs a spec and a module.",
  },
  {
    id: "python.symbol.imp.get-suffixes",
    symbol: "get_suffixes",
    title: "Imp.get_suffixes has been removed",
    refusal:
      "No exact replacement exists for `imp.get_suffixes`; it returns tuples that the `importlib.machinery` suffix lists do not reproduce.",
  },
];

type Target = UsageTarget<Rule>;

/**
 * Rewrites `imp` calls that have an exact `importlib`, `types`, or `sys` equivalent. The replacements are applied only
 * when the call is written as a direct `imp.<symbol>` attribute, so a rebinding such as `reload = imp.reload` is
 * refused. When every `imp` use in a file was rewritten, `import imp` is replaced by the imports the replacements
 * need; otherwise it stays.
 */
export const pythonImpFixer: Fixer = {
  id: "python-imp",
  async plan(result, refuse) {
    return planEachFile(groupByPath(await targetsFor(result)), (path, fileTargets) =>
      planPath(result.root, path, fileTargets, refuse),
    );
  },
};

async function planPath(
  repositoryRoot: string,
  path: string,
  fileTargets: readonly Target[],
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const source = await readRepositoryFile(repositoryRoot, path);
  if ("reason" in source) {
    declineAll(fileTargets, refuse, source.reason);
    return undefined;
  }
  const tree = await parseSource("python", source.text);
  if (tree === undefined) {
    declineAll(fileTargets, refuse, "The source file could not be parsed.");
    return undefined;
  }
  try {
    if (tree.rootNode.hasError) {
      declineAll(fileTargets, refuse, "The source file has syntax errors.");
      return undefined;
    }
    return planSource(path, tree.rootNode, source.text, fileTargets, refuse);
  } finally {
    tree.delete();
  }
}

interface Rewrites {
  edits: Edit[];
  rewritten: Set<number>;
  needed: string[];
}

function planSource(
  path: string,
  root: Node,
  source: string,
  fileTargets: readonly Target[],
  refuse: Refuse | undefined,
): FilePatch | undefined {
  const imports = inspectImports(root, source);
  const rewrites = rewritesFor(fileTargets, callsByCallee(root, "call"), source, imports, refuse);
  if (rewrites.edits.length === 0) return undefined;
  const existing = importedModules(root);
  const additions = [...new Set(rewrites.needed)].filter((module) => !isImported(module, existing));
  const importEdit = importEditFor(
    required(imports.statement, "the `import imp` statement"),
    additions,
    hasRemainingImpReference(root, rewrites.rewritten),
    source,
  );
  const edits = importEdit === undefined ? rewrites.edits : [...rewrites.edits, importEdit];
  return patchFor(path, source, edits);
}

function rewritesFor(
  fileTargets: readonly Target[],
  calls: Map<number, Node[]>,
  source: string,
  imports: Imports,
  refuse: Refuse | undefined,
): Rewrites {
  const edits: Edit[] = [];
  const rewritten = new Set<number>();
  const needed: string[] = [];
  for (const target of sortTargets(fileTargets, (candidate) => candidate.rule.id)) {
    if (imports.problem !== undefined) {
      refuse?.(target.finding, imports.problem);
      continue;
    }
    if (target.rule.refusal !== undefined) {
      refuse?.(target.finding, target.rule.refusal);
      continue;
    }
    const rewrite = rewriteFor(target, calls, source);
    if ("reason" in rewrite) {
      refuse?.(target.finding, rewrite.reason);
      continue;
    }
    edits.push(rewrite.edit);
    rewritten.add(rewrite.calleeStart);
    if (target.rule.module !== undefined) needed.push(target.rule.module);
  }
  return { edits, rewritten, needed };
}

function matchers(rule: Rule): UsageMatcher[] {
  return [{ kind: "symbol", language: "python", module: "imp", symbol: rule.symbol, shape: "call" }];
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the rules it covers.
 */
async function targetsFor(result: ScanResult): Promise<Target[]> {
  const { targets } = await analyzeTargets(result, rules, {
    matchers: (rule) => matchers(rule),
    finding: (rule, usage) => syntheticFinding({ id: rule.id, title: rule.title, severity: "high" }, usage),
  });
  return targets;
}

function rewriteFor(
  target: Target,
  calls: Map<number, Node[]>,
  source: string,
): { edit: Edit; calleeStart: number } | { reason: string } {
  const { usage, rule } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  const candidates = calls.get(offset);
  if (candidates === undefined) return { reason: `No \`imp.${rule.symbol}\` call is at the reported location.` };

  for (const call of candidates) {
    const callee = call.childForFieldName("function");
    if (callee?.type !== "attribute") continue;
    const object = callee.childForFieldName("object");
    const attribute = callee.childForFieldName("attribute");
    if (object?.type !== "identifier" || object.text !== "imp") continue;
    if (attribute?.type !== "identifier" || attribute.text !== rule.symbol) continue;
    const args = call.childForFieldName("arguments");
    if (!args) return { reason: "The call has no argument list." };
    const check = checkArguments(
      rule,
      args.namedChildren.filter((argument): argument is Node => argument !== null),
    );
    if ("reason" in check) return check;
    return {
      edit: rule.wholeCall
        ? { start: call.startIndex, end: call.endIndex, replacement: required(rule.replacement, "replacement") }
        : { start: callee.startIndex, end: callee.endIndex, replacement: required(rule.replacement, "replacement") },
      calleeStart: callee.startIndex,
    };
  }
  return { reason: `The call at the reported location is not a direct \`imp.${rule.symbol}\` attribute.` };
}

/** A replacement is written only when every argument keeps its meaning, including its keyword name. */
function checkArguments(rule: Rule, args: readonly Node[]): { reason: string } | { ok: true } {
  if (rule.wholeCall) {
    return args.length === 0
      ? { ok: true }
      : { reason: `\`imp.${rule.symbol}\` takes no arguments, so it is not replaced by a constant.` };
  }
  let positional = 0;
  for (const argument of args) {
    if (argument.type === "keyword_argument") {
      const name = argument.childForFieldName("name")?.text;
      if (name === undefined || !(rule.keywords ?? []).includes(name)) {
        return {
          reason: `The replacement \`${rule.replacement}\` does not accept the keyword argument \`${name ?? "unknown"}\`.`,
        };
      }
      continue;
    }
    if (argument.type === "list_splat" || argument.type === "dictionary_splat") {
      return { reason: "The call uses a splat argument, so its argument names are not visible in the source text." };
    }
    positional += 1;
  }
  if (positional > (rule.maxPositional ?? 0)) {
    return { reason: rule.overflowReason ?? `\`imp.${rule.symbol}\` takes fewer positional arguments.` };
  }
  return { ok: true };
}

interface Imports {
  statement: Node | undefined;
  problem: string | undefined;
}

/** The single top-level `import imp` line the codemod edits, or why the file cannot be edited safely. */
function inspectImports(root: Node, source: string): Imports {
  const fromImport = root
    .descendantsOfType("import_from_statement")
    .find((node) => node !== null && /^from\s+imp\s+import\b/.test(node.text));
  if (fromImport) {
    return {
      statement: undefined,
      problem: "The module is imported with `from imp import ...`; the codemod rewrites only `import imp`.",
    };
  }
  let statement: Node | undefined;
  for (const node of root.descendantsOfType("import_statement")) {
    if (!node) continue;
    const names = node.namedChildren.filter((child): child is Node => child !== null);
    const alias = names.find(
      (child) => child.type === "aliased_import" && child.childForFieldName("name")?.text === "imp",
    );
    if (alias) {
      return {
        statement: undefined,
        problem: "The module is imported as `import imp as ...`; the codemod rewrites only `import imp`.",
      };
    }
    const mentionsImp = names.some((child) => child.type === "dotted_name" && child.text === "imp");
    if (!mentionsImp) continue;
    const imports = names.filter((child) => child.type === "dotted_name" || child.type === "aliased_import");
    if (imports.length !== 1) {
      return {
        statement: undefined,
        problem: "The `import imp` statement imports other modules, so its line is not replaced.",
      };
    }
    if (statement !== undefined) {
      return { statement: undefined, problem: "The file imports `imp` more than once." };
    }
    statement = node;
  }
  if (statement === undefined) return { statement: undefined, problem: "No `import imp` statement was found." };

  const lineStart = source.lastIndexOf("\n", statement.startIndex - 1) + 1;
  const newline = source.indexOf("\n", statement.endIndex);
  const lineEnd = newline === -1 ? source.length : newline;
  if (
    !/^\s*$/.test(source.slice(lineStart, statement.startIndex)) ||
    !/^\s*(?:#.*)?$/.test(source.slice(statement.endIndex, lineEnd))
  ) {
    return { statement: undefined, problem: "The `import imp` statement shares its line with other code." };
  }
  return { statement, problem: undefined };
}

/** The module names an `import` statement binds, plus `importlib.util` when a from-import names it. */
function importedModules(root: Node): Set<string> {
  const modules = new Set<string>();
  for (const node of root.descendantsOfType("import_statement")) {
    for (const child of node?.namedChildren ?? []) {
      if (child?.type === "dotted_name") modules.add(child.text);
    }
  }
  for (const node of root.descendantsOfType("import_from_statement")) {
    const match = node === null ? null : /^from\s+([\w.]+)\s+import\s+([\s\S]+)$/.exec(node.text);
    if (match?.[1] === "importlib" && /(?:^|,)\s*util\s*(?:,|$)/.test(required(match[2], "the import names")))
      modules.add("importlib.util");
  }
  return modules;
}

/** `import importlib.util` also binds `importlib`, so one import satisfies both replacements. */
function isImported(module: string, existing: ReadonlySet<string>): boolean {
  if (module === "importlib")
    return [...existing].some((name) => name === "importlib" || name.startsWith("importlib."));
  return existing.has(module);
}

/**
 * Whether a name `imp` outside the import statements still reads the module. A rewritten call's callee offset is
 * skipped; an attribute named `imp` such as `thing.imp` is not a module reference.
 */
function hasRemainingImpReference(root: Node, rewritten: ReadonlySet<number>): boolean {
  for (const node of root.descendantsOfType("identifier")) {
    if (node === null || node.text !== "imp" || insideImport(node)) continue;
    const parent = node.parent;
    if (parent?.type === "attribute" && parent.childForFieldName("attribute")?.id === node.id) continue;
    if (!rewritten.has(node.startIndex)) return true;
  }
  return false;
}

function insideImport(node: Node): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (current.type === "import_statement" || current.type === "import_from_statement") return true;
  }
  return false;
}

/** Adds the missing imports after `import imp`, or replaces that line when no `imp` reference remains. */
function importEditFor(
  statement: Node,
  additions: readonly string[],
  remaining: boolean,
  source: string,
): Edit | undefined {
  if (additions.length === 0 && remaining) return undefined;
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lineStart = source.lastIndexOf("\n", statement.startIndex - 1) + 1;
  const indent = source.slice(lineStart, statement.startIndex);
  const lines = additions.map((module) => `${indent}import ${module}`);
  const newlineIndex = source.indexOf("\n", statement.endIndex);
  if (remaining) {
    if (lines.length === 0) return undefined;
    const insertAt = newlineIndex === -1 ? source.length : newlineIndex + 1;
    return { start: insertAt, end: insertAt, replacement: `${lines.join(newline)}${newline}` };
  }
  const end = newlineIndex === -1 ? source.length : newlineIndex + 1;
  return { start: lineStart, end, replacement: lines.length > 0 ? `${lines.join(newline)}${newline}` : "" };
}
