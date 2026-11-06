import type { ScanResult, Severity, UsageMatcher } from "../../domain.js";
import { required } from "../../required.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { callsByCallee } from "./shared/ast.js";
import { type Edit, patchFor } from "./shared/edits.js";
import { optionalCall, requiredModule, normalizeModule, unquote } from "./shared/javascript.js";
import { declineAll, groupByPath, planEachFile, sortTargets } from "./shared/plan.js";
import { offsetOf, readParseableFile } from "./shared/source.js";
import { analyzeTargets, syntheticFinding, type UsageTarget } from "./shared/targets.js";

interface Rule {
  id: string;
  /** The deprecated `util.is*` name, as the usage analysis resolves it. */
  name: string;
  /** A call, or a binary or logical expression that needs parentheses in some positions. */
  form: "call" | "binary" | "refuse";
  /** The replacement, with `{arg}` and, when the rule reads `util.types`, `{util}`. */
  template: string;
  /** Whether the argument appears more than once, so only a durable reference may be substituted. */
  durable: boolean;
  /** Whether the replacement reads `util.types` and therefore needs the namespace binding. */
  types: boolean;
  title: string;
  severity: Severity;
  /** Why a `refuse` rule is not rewritten. */
  reason?: string;
}

const matchers = (symbol: string): UsageMatcher[] => [
  { kind: "symbol", language: "javascript", module: "util", symbol, shape: "call" },
  { kind: "symbol", language: "typescript", module: "util", symbol, shape: "call" },
];

/**
 * The replacements Node.js itself names for the removed `util.is*` functions (DEP0044 to DEP0058), except that
 * `isDate` and `isRegExp` keep the `util.types` check the deprecated functions already ran: `instanceof` fails for a
 * value from another realm, which `util.isDate` and `util.isRegExp` accepted. `isError` is refused because Node's own
 * suggested expression needs `Object.prototype.toString` plus `instanceof`, and `Error.isError` is newer than the
 * Node versions these rules cover.
 */
const rules: readonly Rule[] = [
  {
    id: "nodejs.symbol.util.isarray",
    name: "isArray",
    form: "call",
    template: "Array.isArray({arg})",
    durable: false,
    types: false,
    title: "util.isArray is deprecated",
    severity: "low",
  },
  {
    id: "nodejs.symbol.util.isboolean",
    name: "isBoolean",
    form: "binary",
    template: 'typeof {arg} === "boolean"',
    durable: false,
    types: false,
    title: "Util.isBoolean has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isbuffer",
    name: "isBuffer",
    form: "call",
    template: "Buffer.isBuffer({arg})",
    durable: false,
    types: false,
    title: "Util.isBuffer has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isdate",
    name: "isDate",
    form: "call",
    template: "{util}.types.isDate({arg})",
    durable: false,
    types: true,
    title: "Util.isDate has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isregexp",
    name: "isRegExp",
    form: "call",
    template: "{util}.types.isRegExp({arg})",
    durable: false,
    types: true,
    title: "Util.isRegExp has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isfunction",
    name: "isFunction",
    form: "binary",
    template: 'typeof {arg} === "function"',
    durable: false,
    types: false,
    title: "Util.isFunction has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isnull",
    name: "isNull",
    form: "binary",
    template: "{arg} === null",
    durable: false,
    types: false,
    title: "Util.isNull has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isundefined",
    name: "isUndefined",
    form: "binary",
    template: "{arg} === undefined",
    durable: false,
    types: false,
    title: "Util.isUndefined has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isnullorundefined",
    name: "isNullOrUndefined",
    form: "binary",
    template: "{arg} == null",
    durable: false,
    types: false,
    title: "Util.isNullOrUndefined has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isnumber",
    name: "isNumber",
    form: "binary",
    template: 'typeof {arg} === "number"',
    durable: false,
    types: false,
    title: "Util.isNumber has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isstring",
    name: "isString",
    form: "binary",
    template: 'typeof {arg} === "string"',
    durable: false,
    types: false,
    title: "util.isString has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.issymbol",
    name: "isSymbol",
    form: "binary",
    template: 'typeof {arg} === "symbol"',
    durable: false,
    types: false,
    title: "Util.isSymbol has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isobject",
    name: "isObject",
    form: "binary",
    template: '{arg} !== null && typeof {arg} === "object"',
    durable: true,
    types: false,
    title: "Util.isObject has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.isprimitive",
    name: "isPrimitive",
    form: "binary",
    template: '{arg} === null || (typeof {arg} !== "object" && typeof {arg} !== "function")',
    durable: true,
    types: false,
    title: "Util.isPrimitive has been removed",
    severity: "high",
  },
  {
    id: "nodejs.symbol.util.iserror",
    name: "isError",
    form: "refuse",
    template: "",
    durable: false,
    types: false,
    title: "Util.isError has been removed",
    severity: "high",
    reason:
      "Node.js offers no exact native equivalent of `util.isError` on every supported version; the codemod leaves the call unchanged.",
  },
];

type Target = UsageTarget<Rule>;

/** What a call's callee reads: the deprecated function, and the util expression when the call already has one. */
interface Callee {
  symbol: string;
  /** The binding the call goes through, when it goes through one. */
  local?: string;
  /** The source text that reads the `util` namespace, when the callee itself reads it. */
  utilExpression?: string;
}

const utilModule = "util";

/**
 * Rewrites the removed `util.is*` type checks into the native expression Node.js names for each one, when the argument
 * is a single expression and the replacement evaluates that expression no more often than the call did. A call that
 * cannot be rewritten exactly, including `util.isError` and an optional or spread call, is refused with a reason.
 */
export const nodeUtilIsFixer: Fixer = {
  id: "node-util-is",
  async plan(result, refuse) {
    return planEachFile(groupByPath(await targetsFor(result)), (path, fileTargets) =>
      planFile(result.root, path, fileTargets, refuse),
    );
  },
};

async function planFile(
  root: string,
  path: string,
  fileTargets: readonly Target[],
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const source = await readParseableFile(root, path, required(fileTargets[0], "the file target").usage.language);
  if ("reason" in source) {
    declineAll(fileTargets, refuse, source.reason);
    return undefined;
  }
  const tree = await parseSource(source.grammar, source.text);
  if (tree === undefined) {
    declineAll(fileTargets, refuse, "The source file could not be parsed.");
    return undefined;
  }
  try {
    return patchFor(path, source.text, editsForFile(fileTargets, tree.rootNode, source.text, refuse));
  } finally {
    tree.delete();
  }
}

function editsForFile(fileTargets: readonly Target[], root: Node, source: string, refuse: Refuse | undefined): Edit[] {
  const bindings = utilBindings(root);
  const reassigned = reassignedNames(root);
  const context = { bindings, reassigned, namespace: namespaceBinding(bindings, reassigned) };
  const calls = callsByCallee(root);
  const targetOffsets = new Set<number>();
  for (const target of fileTargets) {
    const { line, column } = target.usage.location;
    if (line === undefined || column === undefined) continue;
    const offset = offsetOf(source, line, column);
    if (offset !== -1) targetOffsets.add(offset);
  }
  const edits: Edit[] = [];
  for (const target of sortTargets(fileTargets, (candidate) => candidate.rule.id)) {
    const rewrite = rewriteFor(target, calls, targetOffsets, context, source);
    if ("reason" in rewrite) refuse?.(target.finding, rewrite.reason);
    else edits.push(rewrite);
  }
  return edits;
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the rules it covers.
 */
async function targetsFor(result: ScanResult): Promise<Target[]> {
  const { targets } = await analyzeTargets(result, rules, {
    matchers: (rule) => matchers(rule.name),
    finding: (rule, usage) => syntheticFinding(rule, usage, true),
  });
  return targets;
}

interface FileContext {
  bindings: Map<string, string>;
  reassigned: Set<string>;
  namespace: string | undefined;
}

function rewriteFor(
  target: Target,
  calls: Map<number, Node[]>,
  targetOffsets: ReadonlySet<number>,
  context: FileContext,
  source: string,
): Edit | { reason: string } {
  const { usage, rule } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  const candidates = calls.get(offset);
  if (candidates === undefined) return { reason: `No \`util.${rule.name}\` call is at the reported location.` };

  for (const call of candidates) {
    const rewrite = rewriteCall(call, rule, targetOffsets, context, source);
    if (rewrite !== undefined) return rewrite;
  }
  return { reason: `The call at the reported location is not a direct \`util.${rule.name}\` call.` };
}

/** The edit for one candidate call, or undefined when the call does not go through `util.<rule.name>`. */
function rewriteCall(
  call: Node,
  rule: Rule,
  targetOffsets: ReadonlySet<number>,
  context: FileContext,
  source: string,
): Edit | { reason: string } | undefined {
  const callee = resolveTargetCallee(call, rule, context, source);
  if (callee === undefined || "reason" in callee) return callee;
  const checked = checkedArgument(call, rule, targetOffsets);
  if ("reason" in checked) return checked;
  const util = rule.types ? (callee.utilExpression ?? context.namespace) : undefined;
  if (rule.types && util === undefined) {
    return {
      reason:
        "This file imports `util` only by name, so `util.types` is not reachable; the codemod does not add an import.",
    };
  }
  const replacement = render(rule, argumentText(checked.argument, source), util);
  const wrapped = rule.form === "binary" && needsParentheses(call) ? `(${replacement})` : replacement;
  return { start: call.startIndex, end: call.endIndex, replacement: wrapped };
}

function resolveTargetCallee(
  call: Node,
  rule: Rule,
  context: FileContext,
  source: string,
): Callee | { reason: string } | undefined {
  const calleeNode = call.childForFieldName("function");
  if (!calleeNode) return undefined;
  if (optionalCall(call, calleeNode, source)) {
    return { reason: "The call is optional (`?.`), so replacing it would change when it runs." };
  }
  const callee = resolveCallee(calleeNode, context.bindings);
  if (callee?.symbol !== rule.name) return undefined;
  if (callee.local !== undefined && context.reassigned.has(callee.local)) {
    return {
      reason: `The binding \`${callee.local}\` is reassigned in this file, so the call may not reach \`util.${rule.name}\`.`,
    };
  }
  return callee;
}

function checkedArgument(
  call: Node,
  rule: Rule,
  targetOffsets: ReadonlySet<number>,
): { argument: Node } | { reason: string } {
  const args = call.childForFieldName("arguments");
  if (!args) return { reason: "The call has no argument list." };
  if (nestedTarget(call, targetOffsets)) {
    return {
      reason:
        "The call contains another `util.is*` call, so replacing both would overlap; the codemod leaves the outer call unchanged.",
    };
  }
  const values = args.namedChildren.filter((value): value is Node => value !== null);
  if (values.length === 0) return { reason: `The call passes no argument; \`util.${rule.name}\` takes exactly one.` };
  if (values.length > 1)
    return { reason: `The call passes ${values.length} arguments; \`util.${rule.name}\` takes exactly one.` };
  const argument = required(values[0], "the single argument");
  if (argument.type === "spread_element")
    return { reason: "The call spreads its argument, so the single value is not visible in the source text." };
  if (rule.form === "refuse") return { reason: rule.reason ?? `\`util.${rule.name}\` has no exact native equivalent.` };
  if (rule.durable && !durableReference(argument)) {
    return {
      reason:
        "The argument is not an identifier or a member chain without calls, so the replacement would evaluate it more than once.",
    };
  }
  return { argument };
}

function render(rule: Rule, argument: string, util: string | undefined): string {
  return rule.template
    .split("{arg}")
    .join(argument)
    .split("{util}")
    .join(util ?? "");
}

/** True when another `util.is*` target starts inside this call, which would make the two whole-call edits overlap. */
function nestedTarget(call: Node, offsets: ReadonlySet<number>): boolean {
  for (const offset of offsets) {
    if (offset > call.startIndex && offset < call.endIndex) return true;
  }
  return false;
}

/** The function a callee reads and, when it names the module, the expression that reads `util`. */
function resolveCallee(callee: Node, bindings: ReadonlyMap<string, string>): Callee | undefined {
  if (callee.type === "identifier") {
    const imported = bindings.get(callee.text);
    return imported === undefined ? undefined : { symbol: imported, local: callee.text };
  }
  if (callee.type !== "member_expression") return undefined;
  const object = callee.childForFieldName("object");
  const property = callee.childForFieldName("property");
  if (!object || property?.type !== "property_identifier") return undefined;
  if (object.type === "identifier") {
    const imported = bindings.get(object.text);
    if (imported === undefined) return undefined;
    if (imported === "*" || imported === "default") {
      return { symbol: property.text, local: object.text, utilExpression: object.text };
    }
    return { symbol: `${imported}.${property.text}`, local: object.text };
  }
  return undefined;
}

type Bindings = Map<string, string>;

function addBinding(bindings: Bindings, local: string, imported: string): void {
  if (!bindings.has(local)) bindings.set(local, imported);
}

/** The local names a file binds to `util`, from `import`, `import * as`, `require`, and their destructured forms. */
function utilBindings(root: Node): Bindings {
  const bindings: Bindings = new Map();
  for (const statement of root.descendantsOfType("import_statement")) {
    if (statement) addImportBindings(statement, bindings);
  }
  for (const declarator of root.descendantsOfType("variable_declarator")) {
    if (declarator) addDeclaratorBindings(declarator, bindings);
  }
  addAliasBindings(root, bindings);
  return bindings;
}

function addImportBindings(statement: Node, bindings: Bindings): void {
  const source =
    statement.childForFieldName("source") ?? statement.namedChildren.find((child) => child?.type === "string");
  if (!source || normalizeModule(unquote(source.text)) !== utilModule) return;
  const clause = statement.namedChildren.find((child) => child?.type === "import_clause");
  if (!clause) return;
  for (const child of clause.namedChildren) {
    if (child) addImportClause(child, bindings);
  }
}

function addImportClause(child: Node, bindings: Bindings): void {
  if (child.type === "identifier") addBinding(bindings, child.text, "default");
  else if (child.type === "namespace_import") addNamespaceImport(child, bindings);
  else if (child.type === "named_imports") addNamedImports(child, bindings);
}

function addNamespaceImport(node: Node, bindings: Bindings): void {
  const local = node.namedChildren.find((candidate) => candidate?.type === "identifier");
  if (local) addBinding(bindings, local.text, "*");
}

function addNamedImports(node: Node, bindings: Bindings): void {
  for (const specifier of node.namedChildren) {
    if (specifier?.type !== "import_specifier") continue;
    const imported = specifier.childForFieldName("name");
    const alias = specifier.childForFieldName("alias");
    if (!imported) continue;
    addBinding(bindings, alias?.type === "identifier" ? alias.text : imported.text, unquote(imported.text));
  }
}

function addDeclaratorBindings(declarator: Node, bindings: Bindings): void {
  const name = declarator.childForFieldName("name");
  const value = declarator.childForFieldName("value");
  if (requiredModule(value) !== utilModule) return;
  if (name?.type === "identifier") addBinding(bindings, name.text, "*");
  else if (name?.type === "object_pattern") {
    for (const entry of patternEntries(name)) addBinding(bindings, entry.local, entry.key);
  }
}

/** `const u = util` and `const check = util.isArray` reach the same functions under another name. */
function addAliasBindings(root: Node, bindings: Bindings): void {
  for (let pass = 0; pass < 4; pass += 1) {
    if (!addAliasPass(root, bindings)) return;
  }
}

function addAliasPass(root: Node, bindings: Bindings): boolean {
  let changed = false;
  for (const declarator of root.descendantsOfType("variable_declarator")) {
    if (!declarator) continue;
    const name = declarator.childForFieldName("name");
    if (name?.type !== "identifier" || bindings.has(name.text)) continue;
    const imported = aliasTarget(declarator.childForFieldName("value"), bindings);
    if (imported === undefined) continue;
    addBinding(bindings, name.text, imported);
    changed = true;
  }
  return changed;
}

/** The util name an alias's value reads, such as "*" for `util` or "isArray" for `util.isArray`. */
function aliasTarget(value: Node | null | undefined, bindings: ReadonlyMap<string, string>): string | undefined {
  if (!value) return undefined;
  if (value.type === "identifier") return bindings.get(value.text);
  if (value.type !== "member_expression") return undefined;
  const object = value.childForFieldName("object");
  const property = value.childForFieldName("property");
  if (!object || property?.type !== "property_identifier") return undefined;
  if (object.type === "identifier") {
    const imported = bindings.get(object.text);
    return imported === "*" || imported === "default" ? property.text : undefined;
  }
  return undefined;
}

/** Entries of `{ a, b: c, d = 1 }` as the imported name and the local name it binds. */
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

/** Local names a file assigns to, so a call through one cannot be assumed to reach `util`. */
function reassignedNames(root: Node): Set<string> {
  const names = new Set<string>();
  for (const node of root.descendantsOfType(["assignment_expression", "augmented_assignment_expression"])) {
    const left = node?.childForFieldName("left");
    if (left?.type === "identifier") names.add(left.text);
  }
  return names;
}

/** The first local name that reads the whole `util` module and is never reassigned, in source order. */
function namespaceBinding(bindings: ReadonlyMap<string, string>, reassigned: ReadonlySet<string>): string | undefined {
  for (const [local, imported] of bindings) {
    if ((imported === "*" || imported === "default") && !reassigned.has(local)) return local;
  }
  return undefined;
}

type DurableCheck = (node: Node) => boolean;

const durableChecks = new Map<string, DurableCheck>([
  ["identifier", () => true],
  ["this", () => true],
  ["member_expression", durableMember],
  ["subscript_expression", durableSubscript],
  ["parenthesized_expression", durableWrapped],
  ["non_null_expression", durableWrapped],
  ["type_assertion", durableWrapped],
]);

/** True for a name whose value can be substituted twice without a second call or construction. */
function durableReference(node: Node): boolean {
  return durableChecks.get(node.type)?.(node) ?? false;
}

function durableMember(node: Node): boolean {
  const object = node.childForFieldName("object");
  const property = node.childForFieldName("property");
  return (
    property?.type === "property_identifier" && object !== null && object !== undefined && durableReference(object)
  );
}

function durableSubscript(node: Node): boolean {
  const object = node.childForFieldName("object");
  const index = node.childForFieldName("index");
  return (
    object !== null &&
    object !== undefined &&
    durableReference(object) &&
    index !== null &&
    index !== undefined &&
    ["identifier", "number", "string"].includes(index.type)
  );
}

function durableWrapped(node: Node): boolean {
  const inner = node.namedChildren.find((child) => child !== null);
  return inner !== undefined && durableReference(inner);
}

/** Argument node types that bind tighter than every operator in a replacement, so they need no parentheses. */
const primaryArgumentTypes = new Set([
  "identifier",
  "this",
  "number",
  "string",
  "true",
  "false",
  "null",
  "undefined",
  "member_expression",
  "subscript_expression",
  "call_expression",
  "new_expression",
  "parenthesized_expression",
  "template_string",
  "regex",
  "array",
  "object",
  "unary_expression",
  "await_expression",
  "non_null_expression",
  "type_assertion",
]);

function argumentText(node: Node, source: string): string {
  const text = source.slice(node.startIndex, node.endIndex);
  return primaryArgumentTypes.has(node.type) ? text : `(${text})`;
}

/** Positions where a binary or logical replacement reads as the whole expression without parentheses. */
function needsParentheses(call: Node): boolean {
  const parent = call.parent;
  if (!parent) return true;
  switch (parent.type) {
    case "expression_statement":
    case "arguments":
    case "return_statement":
    case "parenthesized_expression":
      return false;
    case "if_statement":
    case "while_statement":
      return parent.childForFieldName("condition")?.id !== call.id;
    case "variable_declarator":
      return parent.childForFieldName("value")?.id !== call.id;
    default:
      return true;
  }
}
