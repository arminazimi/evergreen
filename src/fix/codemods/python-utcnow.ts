import type { ScanResult, UsageMatcher } from "../../domain.js";
import { required } from "../../required.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { callsByCallee, namedChildNodes } from "./shared/ast.js";
import { applyEdits, diffFor, type Edit } from "./shared/edits.js";
import { declineAll, groupByPath, planEachFile, sortTargets } from "./shared/plan.js";
import { offsetOf, readRepositoryFile } from "./shared/source.js";
import { analyzeTargets, syntheticFinding, type UsageTarget } from "./shared/targets.js";

interface Rule {
  id: string;
  /** The method read from the `datetime` class, as in `datetime.utcnow`. */
  symbol: string;
  title: string;
}

const rules: readonly Rule[] = [
  { id: "python.symbol.datetime.utcnow", symbol: "utcnow", title: "datetime.utcnow is deprecated" },
  {
    id: "python.symbol.datetime.utcfromtimestamp",
    symbol: "utcfromtimestamp",
    title: "datetime.utcfromtimestamp is deprecated",
  },
];

type Target = UsageTarget<Rule>;

/**
 * One of the import shapes the codemod rewrites. The class shape reads the class through
 * `from datetime import datetime` and names `timezone` bare, so that import may need extending; the module shapes read
 * `datetime.datetime` through `import datetime` or `import datetime as dt` and qualify everything.
 */
interface Shape {
  prefix: string;
  timezone: string;
  fromImport: Node | undefined;
}

/**
 * Rewrites the two `datetime` methods Python 3.12 deprecated into the forms that return the exact same naive value:
 * `datetime.now(timezone.utc).replace(tzinfo=None)` and `datetime.fromtimestamp(t, timezone.utc).replace(tzinfo=None)`.
 * The rewrite follows the file's import shape, extends the `from datetime import` statement with `timezone` when it is
 * missing, and refuses every shape it cannot rewrite without changing behavior.
 */
export const pythonUtcnowFixer: Fixer = {
  id: "python-utcnow",
  async plan(result, refuse) {
    return planEachFile(groupByPath(await targetsFor(result)), (path, fileTargets) =>
      planFile(result.root, path, fileTargets, refuse),
    );
  },
};

/** The patch for one file's targets, or undefined when no call in the file changes. Every refusal is reported. */
async function planFile(
  root: string,
  path: string,
  fileTargets: readonly Target[],
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const source = await readRepositoryFile(root, path);
  if ("reason" in source) {
    declineAll(fileTargets, refuse, source.reason);
    return undefined;
  }
  const before = source.text;
  const tree = await parseSource("python", before);
  if (tree === undefined) {
    declineAll(fileTargets, refuse, "The source file could not be parsed.");
    return undefined;
  }
  try {
    if (tree.rootNode.hasError) {
      declineAll(fileTargets, refuse, "The source file has syntax errors.");
      return undefined;
    }
    const text = rewriteSource(tree.rootNode, before, fileTargets, refuse);
    if (text === undefined) return undefined;
    return diffFor(path, before, text);
  } finally {
    tree.delete();
  }
}

/** The file with its rewritable calls rewritten, or undefined when none of the file's targets can be rewritten. */
function rewriteSource(
  root: Node,
  before: string,
  fileTargets: readonly Target[],
  refuse: Refuse | undefined,
): string | undefined {
  const calls = callsByCallee(root, "call");
  const imports = inspectDatetimeImports(root);
  const shape = shapeFor(imports);
  const problem = shapeProblem(imports, shape);
  const edits: Edit[] = [];
  let rewrote = false;
  for (const target of sortTargets(fileTargets, (candidate) => candidate.rule.id)) {
    if (problem !== undefined) {
      refuse?.(target.finding, problem);
      continue;
    }
    const rewrite = rewriteFor(target, calls, required(shape, "the datetime import shape"), before);
    if ("reason" in rewrite) {
      refuse?.(target.finding, rewrite.reason);
      continue;
    }
    edits.push(...rewrite.edits);
    rewrote = true;
  }
  if (!rewrote) return undefined;

  if (shape?.fromImport !== undefined && !imports.timezoneImported) {
    edits.push(timezoneEditFor(shape.fromImport));
  }
  return applyEdits(before, edits);
}

function matchers(rule: Rule): UsageMatcher[] {
  return [{ kind: "symbol", language: "python", module: "datetime", symbol: `datetime.${rule.symbol}`, shape: "call" }];
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the rules it covers.
 */
async function targetsFor(result: ScanResult): Promise<Target[]> {
  const { targets } = await analyzeTargets(result, rules, {
    matchers: (rule) => matchers(rule),
    finding: (rule, usage) => syntheticFinding({ id: rule.id, title: rule.title, severity: "medium" }, usage),
  });
  return targets;
}

interface Imports {
  /** The local name `import datetime` or `import datetime as dt` binds, when the file has one. */
  moduleHead: string | undefined;
  /** The first single-line, unaliased `from datetime import datetime` statement, when the file has one. */
  classImport: Node | undefined;
  /** The local name of a `from datetime import datetime as ...` alias, which the codemod refuses to follow. */
  aliasedClass: string | undefined;
  /** The file has a `from datetime import *`, so the codemod cannot tell where a bare name comes from. */
  star: boolean;
  /** A `timezone` name is already imported from `datetime`, so the import statement needs no extension. */
  timezoneImported: boolean;
  /** A `timezone` name is bound to something other than `datetime.timezone`, so a bare `timezone` would change meaning. */
  timezoneConflict: boolean;
}

function inspectDatetimeImports(root: Node): Imports {
  const imports: Imports = {
    moduleHead: undefined,
    classImport: undefined,
    aliasedClass: undefined,
    star: false,
    timezoneImported: false,
    timezoneConflict: false,
  };
  for (const node of root.descendantsOfType("import_statement")) {
    if (node) inspectModuleImport(node, imports);
  }
  for (const node of root.descendantsOfType("import_from_statement")) {
    if (node) inspectFromImport(node, imports);
  }
  imports.timezoneConflict = imports.timezoneConflict || bindsTimezoneOutsideDatetimeImports(root);
  return imports;
}

/** Reads `import datetime` and `import datetime as dt`, and notes any name in it that binds `timezone`. */
function inspectModuleImport(statement: Node, imports: Imports): void {
  for (const child of statement.namedChildren) {
    if (child?.type === "dotted_name" && child.text === "datetime") imports.moduleHead ??= "datetime";
    if (child?.type === "aliased_import" && child.childForFieldName("name")?.text === "datetime") {
      imports.moduleHead ??= child.childForFieldName("alias")?.text;
    }
    if (child && bindsName(child, "timezone")) imports.timezoneConflict = true;
  }
}

/** Reads `from datetime import ...`; any other `from` import that binds `timezone` is a conflict. */
function inspectFromImport(statement: Node, imports: Imports): void {
  const moduleNode = statement.childForFieldName("module_name");
  if (moduleNode === null || moduleNode === undefined) return;
  if (moduleNode.text !== "datetime") {
    imports.timezoneConflict =
      imports.timezoneConflict ||
      statement.namedChildren.some(
        (child) => child !== null && child.id !== moduleNode.id && bindsName(child, "timezone"),
      );
    return;
  }
  if (statement.namedChildren.some((child) => child?.type === "wildcard_import")) {
    imports.star = true;
    return;
  }
  for (const child of statement.namedChildren) {
    if (child && child.id !== moduleNode.id) inspectDatetimeName(statement, child, imports);
  }
}

/** One name in a `from datetime import ...` statement: the class, `timezone`, or an alias that changes either. */
function inspectDatetimeName(statement: Node, child: Node, imports: Imports): void {
  if (child.type === "dotted_name") {
    if (child.text === "datetime") imports.classImport ??= statement;
    if (child.text === "timezone") imports.timezoneImported = true;
    return;
  }
  if (child.type !== "aliased_import") return;
  const name = child.childForFieldName("name")?.text;
  const alias = child.childForFieldName("alias")?.text;
  if (name === "datetime") imports.aliasedClass ??= alias;
  if (alias === "timezone" && name !== "timezone") imports.timezoneConflict = true;
}

/** Whether an import-name node binds the local name `name`. */
function bindsName(node: Node, name: string): boolean {
  return (
    (node.type === "dotted_name" && node.text === name) ||
    (node.type === "aliased_import" && node.childForFieldName("alias")?.text === name)
  );
}

/**
 * Whether a statement other than `from datetime import ...` binds `timezone`: an assignment or loop target, a function
 * or class name, a parameter, a `with`/`except` alias, a walrus, or `global`/`nonlocal`. Import statements are checked
 * by the caller, which knows which module each name came from.
 */
function bindsTimezoneOutsideDatetimeImports(root: Node): boolean {
  return (
    assignsTimezone(root) ||
    definesTimezone(root) ||
    parameterNamesTimezone(root) ||
    asAliasNamesTimezone(root) ||
    declaresTimezoneGlobal(root)
  );
}

/** Whether a name is the identifier `timezone`. */
function isTimezoneName(node: Node | null | undefined): boolean {
  return node?.type === "identifier" && node.text === "timezone";
}

/** An assignment, loop, or walrus whose target is `timezone`. */
function assignsTimezone(root: Node): boolean {
  return root
    .descendantsOfType(["assignment", "augmented_assignment", "for_statement", "for_in_clause", "named_expression"])
    .some((node) => isTimezoneName(node?.childForFieldName("left") ?? node?.childForFieldName("name")));
}

/** A function or class named `timezone`. */
function definesTimezone(root: Node): boolean {
  return root
    .descendantsOfType(["function_definition", "class_definition"])
    .some((node) => node?.childForFieldName("name")?.text === "timezone");
}

/** A parameter named `timezone`, including the starred forms. */
function parameterNamesTimezone(root: Node): boolean {
  return root
    .descendantsOfType(["parameters", "lambda_parameters"])
    .some((node) =>
      (node?.namedChildren ?? []).some((parameter) => parameter !== null && isTimezoneName(parameterName(parameter))),
    );
}

/** The identifier a parameter node binds, or undefined when it has none. */
function parameterName(parameter: Node): Node | null | undefined {
  if (parameter.type === "identifier") return parameter;
  if (parameter.type === "list_splat_pattern" || parameter.type === "dictionary_splat_pattern") {
    return parameter.namedChild(0);
  }
  return parameter.childForFieldName("name");
}

/** A `with` or `except` alias named `timezone`. */
function asAliasNamesTimezone(root: Node): boolean {
  return root.descendantsOfType("as_pattern").some((node) => node?.childForFieldName("alias")?.text === "timezone");
}

/** A `global` or `nonlocal` declaration that names `timezone`. */
function declaresTimezoneGlobal(root: Node): boolean {
  return root
    .descendantsOfType(["global_statement", "nonlocal_statement"])
    .some((node) => (node?.namedChildren ?? []).some((child) => isTimezoneName(child)));
}

/**
 * The import shape the file's calls are rewritten in, or undefined when no shape applies. A file that binds the same
 * name both ways is left alone, because a call written `datetime.` could read either binding.
 */
function shapeFor(imports: Imports): Shape | undefined {
  if (imports.moduleHead !== undefined && imports.classImport !== undefined && imports.moduleHead === "datetime")
    return undefined;
  if (imports.classImport !== undefined) {
    return { prefix: "datetime", timezone: "timezone.utc", fromImport: imports.classImport };
  }
  if (imports.moduleHead !== undefined) {
    return {
      prefix: `${imports.moduleHead}.datetime`,
      timezone: `${imports.moduleHead}.timezone.utc`,
      fromImport: undefined,
    };
  }
  return undefined;
}

/** Why no call in the file can be rewritten, checked before the per-call work. */
function shapeProblem(imports: Imports, shape: Shape | undefined): string | undefined {
  if (shape === undefined) {
    if (imports.aliasedClass !== undefined && imports.classImport === undefined && imports.moduleHead === undefined) {
      return `The class is imported as \`from datetime import datetime as ${imports.aliasedClass}\`; the codemod rewrites only the plain \`datetime\` name.`;
    }
    if (imports.classImport !== undefined && imports.moduleHead !== undefined) {
      return "The file binds `datetime` both as the module and as the class imported by name, so the codemod cannot tell which binding a call reads.";
    }
    return "No `datetime` import was found, so the calls cannot be rewritten.";
  }
  if (imports.star)
    return "The file uses `from datetime import *`, so the codemod cannot tell where the names come from.";
  if (shape.fromImport !== undefined && !imports.timezoneImported) {
    if (imports.timezoneConflict)
      return "`timezone` is already bound to something other than `datetime.timezone` in this file.";
    const text = shape.fromImport.text;
    if (text.includes("(") || text.includes("\n")) {
      return "The `from datetime import datetime` statement is parenthesized or spans several lines, so `timezone` cannot be added to it.";
    }
  }
  return undefined;
}

/** The `object` of a call whose callee is an attribute on a name or dotted name, such as `datetime.utcnow()`. */
function receiverOf(call: Node): Node | undefined {
  const callee = call.childForFieldName("function");
  if (callee?.type !== "attribute") return undefined;
  const object = callee.childForFieldName("object");
  if (!object) return undefined;
  return object.type === "identifier" || object.type === "attribute" ? object : undefined;
}

function rewriteFor(
  target: Target,
  calls: Map<number, Node[]>,
  shape: Shape,
  source: string,
): { edits: Edit[] } | { reason: string } {
  const { usage, rule } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  const candidates = calls.get(offset);
  if (candidates === undefined) return { reason: `No \`datetime.${rule.symbol}\` call is at the reported location.` };

  const mismatch = {
    reason: `The call at the reported location is not a direct \`${shape.prefix}.${rule.symbol}\` through the file's datetime import.`,
  };
  const call = candidates.find((candidate) => receiverOf(candidate) !== undefined);
  if (call === undefined || receiverOf(call)?.text !== shape.prefix) return mismatch;

  const args = call.childForFieldName("arguments");
  if (!args || args.type !== "argument_list") return { reason: "The call has no argument list." };
  const check = checkArguments(rule, args);
  if ("reason" in check) return check;

  const callee = call.childForFieldName("function");
  if (!callee) return mismatch;
  return {
    edits:
      rule.symbol === "utcnow"
        ? utcnowEdits(call, callee, args, shape)
        : utcfromtimestampEdits(call, callee, args, shape),
  };
}

/** `datetime.utcnow()` becomes `datetime.now(timezone.utc).replace(tzinfo=None)`. */
function utcnowEdits(call: Node, callee: Node, args: Node, shape: Shape): Edit[] {
  const inner = args.startIndex + 1;
  return [
    { start: callee.startIndex, end: callee.endIndex, replacement: `${shape.prefix}.now` },
    { start: inner, end: inner, replacement: shape.timezone },
    { start: call.endIndex, end: call.endIndex, replacement: ".replace(tzinfo=None)" },
  ];
}

/** `datetime.utcfromtimestamp(t)` becomes `datetime.fromtimestamp(t, timezone.utc).replace(tzinfo=None)`. */
function utcfromtimestampEdits(call: Node, callee: Node, args: Node, shape: Shape): Edit[] {
  const last = required(namedChildNodes(args).at(-1), "the timestamp argument");
  return [
    { start: callee.startIndex, end: callee.endIndex, replacement: `${shape.prefix}.fromtimestamp` },
    { start: last.endIndex, end: last.endIndex, replacement: `, ${shape.timezone}` },
    { start: call.endIndex, end: call.endIndex, replacement: ".replace(tzinfo=None)" },
  ];
}

/** A replacement is written only when the call's arguments keep their meaning: none at all, or one plain positional. */
function checkArguments(rule: Rule, args: Node): { reason: string } | { ok: true } {
  const callArguments = namedChildNodes(args);
  if (rule.symbol === "utcnow") {
    if (args.text.slice(1, -1).trim() !== "")
      return { reason: "`datetime.utcnow` takes no arguments, so the call's arguments cannot be kept." };
    return { ok: true };
  }
  if (callArguments.length === 0)
    return { reason: "`datetime.utcfromtimestamp` needs a timestamp argument, so the call is left alone." };
  for (const argument of callArguments) {
    if (argument.type === "keyword_argument") {
      return { reason: "`datetime.utcfromtimestamp` takes no keyword arguments, so the call is left alone." };
    }
    if (argument.type === "list_splat" || argument.type === "dictionary_splat") {
      return { reason: "The call uses a splat argument, so its argument names are not visible in the source text." };
    }
  }
  return { ok: true };
}

/** Adds `timezone` to the single-line `from datetime import ...` statement that names the class. */
function timezoneEditFor(statement: Node): Edit {
  const names = statement.namedChildren.filter(
    (child): child is Node => child !== null && (child.type === "dotted_name" || child.type === "aliased_import"),
  );
  const last = required(names.at(-1), "the imported name");
  return { start: last.endIndex, end: last.endIndex, replacement: ", timezone" };
}
