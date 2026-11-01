import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../../agent-instructions.js";
import type { Finding, ScanResult, Severity, SourceUsage, UsageMatcher } from "../../domain.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { grammarFor, parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer } from "../index.js";

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
    reason: "Node.js offers no exact native equivalent of `util.isError` on every supported version; the codemod leaves the call unchanged.",
  },
];

interface Target {
  rule: Rule;
  usage: SourceUsage;
  finding: Finding;
}

interface Edit {
  start: number;
  end: number;
  replacement: string;
}

/** A local name that stands for the `util` module or one of its functions. */
interface Binding {
  local: string;
  /** "*" or "default" for the module itself, otherwise the imported function name. */
  imported: string;
}

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
    const targets = await targetsFor(result);
    const byPath = new Map<string, Target[]>();
    for (const target of targets) {
      const list = byPath.get(target.usage.location.path) ?? [];
      list.push(target);
      byPath.set(target.usage.location.path, list);
    }

    const patches: FilePatch[] = [];
    for (const [path, fileTargets] of [...byPath].sort(([left], [right]) => left.localeCompare(right))) {
      const decline = (reason: string): void => {
        for (const target of fileTargets) refuse?.(target.finding, reason);
      };
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) {
        decline("The path resolves outside the repository.");
        continue;
      }
      const before = await readFile(absolute, "utf8").catch(() => undefined);
      if (before === undefined) {
        decline("The source file could not be read.");
        continue;
      }
      if (!before.endsWith("\n")) {
        decline("The source file does not end with a newline.");
        continue;
      }
      const grammar = grammarFor(fileTargets[0]!.usage.language, path);
      if (grammar === undefined) {
        decline("No parser covers this source language.");
        continue;
      }
      const tree = await parseSource(grammar, before);
      if (tree === undefined) {
        decline("The source file could not be parsed.");
        continue;
      }
      try {
        const root = tree.rootNode;
        const bindings = utilBindings(root);
        const reassigned = reassignedNames(root);
        const namespace = namespaceBinding(bindings, reassigned);
        const calls = callsByCallee(root);
        const targetOffsets = new Set<number>();
        for (const target of fileTargets) {
          const offset = target.usage.location.line === undefined || target.usage.location.column === undefined
            ? -1
            : offsetOf(before, target.usage.location.line, target.usage.location.column);
          if (offset !== -1) targetOffsets.add(offset);
        }
        const edits: Edit[] = [];
        for (const target of fileTargets.sort(compareTargets)) {
          const rewrite = rewriteFor(target, calls, targetOffsets, { bindings, reassigned, namespace }, before);
          if ("reason" in rewrite) {
            refuse?.(target.finding, rewrite.reason);
            continue;
          }
          edits.push(rewrite);
        }
        if (edits.length === 0) continue;
        const text = applyEdits(before, edits);
        if (text !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
      } finally {
        tree.delete();
      }
    }
    return patches;
  },
};

function syntheticFinding(rule: Rule, usage: SourceUsage): Finding {
  const line = usage.location.line ?? 1;
  return {
    id: `${rule.id}:${usage.location.path}:${line}:${usage.location.column ?? 1}`,
    ruleId: rule.id,
    detector: "codemod",
    title: rule.title,
    summary: "",
    severity: rule.severity,
    confidence: "exact",
    location: usage.location,
    sources: [],
  };
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the rules it covers.
 */
async function targetsFor(result: ScanResult): Promise<Target[]> {
  const targets: Target[] = [];
  const reported = new Map(rules.map((rule) => [rule.id, result.findings.filter((finding) => finding.ruleId === rule.id)]));
  const missing = rules.filter((rule) => reported.get(rule.id)!.length === 0);
  const analyses = missing.length === 0
    ? []
    : await analyzeSourceUsage(result.root, missing.map((rule) => ({ id: rule.id, matchers: matchers(rule.name) })));
  const derived = new Map(analyses.map((analysis) => [analysis.contractId, analysis.usages]));

  for (const rule of rules) {
    const findings = reported.get(rule.id)!;
    if (findings.length > 0) {
      for (const finding of findings) {
        for (const usage of finding.usages ?? []) targets.push({ rule, usage, finding });
      }
      continue;
    }
    for (const usage of derived.get(rule.id) ?? []) targets.push({ rule, usage, finding: syntheticFinding(rule, usage) });
  }
  return targets;
}

function compareTargets(left: Target, right: Target): number {
  return (left.usage.location.line ?? 0) - (right.usage.location.line ?? 0) ||
    (left.usage.location.column ?? 0) - (right.usage.location.column ?? 0) ||
    left.rule.id.localeCompare(right.rule.id);
}

/** Calls keyed by the offset where their callee starts, which is the location a symbol usage reports. */
function callsByCallee(root: Node): Map<number, Node[]> {
  const calls = new Map<number, Node[]>();
  for (const node of root.descendantsOfType("call_expression")) {
    if (!node) continue;
    const callee = node.childForFieldName("function");
    if (!callee) continue;
    const list = calls.get(callee.startIndex) ?? [];
    list.push(node);
    calls.set(callee.startIndex, list);
  }
  return calls;
}

interface FileContext {
  bindings: Map<string, string>;
  reassigned: Set<string>;
  namespace: string | undefined;
}

function rewriteFor(target: Target, calls: Map<number, Node[]>, targetOffsets: ReadonlySet<number>, context: FileContext, source: string): Edit | { reason: string } {
  const { usage, rule } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  const candidates = calls.get(offset);
  if (candidates === undefined) return { reason: `No \`util.${rule.name}\` call is at the reported location.` };

  for (const call of candidates) {
    const calleeNode = call.childForFieldName("function");
    if (!calleeNode) continue;
    if (optionalCall(call, calleeNode, source)) {
      return { reason: "The call is optional (`?.`), so replacing it would change when it runs." };
    }
    const callee = resolveCallee(calleeNode, context.bindings);
    if (callee?.symbol !== rule.name) continue;
    if (callee.local !== undefined && context.reassigned.has(callee.local)) {
      return { reason: `The binding \`${callee.local}\` is reassigned in this file, so the call may not reach \`util.${rule.name}\`.` };
    }
    const args = call.childForFieldName("arguments");
    if (!args) return { reason: "The call has no argument list." };
    if (nestedTarget(call, targetOffsets)) {
      return { reason: "The call contains another `util.is*` call, so replacing both would overlap; the codemod leaves the outer call unchanged." };
    }
    const values = args.namedChildren.filter((value): value is Node => value !== null);
    if (values.length === 0) return { reason: `The call passes no argument; \`util.${rule.name}\` takes exactly one.` };
    if (values.length > 1) return { reason: `The call passes ${values.length} arguments; \`util.${rule.name}\` takes exactly one.` };
    const argument = values[0]!;
    if (argument.type === "spread_element") return { reason: "The call spreads its argument, so the single value is not visible in the source text." };
    if (rule.form === "refuse") return { reason: rule.reason ?? `\`util.${rule.name}\` has no exact native equivalent.` };
    if (rule.durable && !durableReference(argument)) {
      return { reason: "The argument is not an identifier or a member chain without calls, so the replacement would evaluate it more than once." };
    }
    const util = rule.types ? callee.utilExpression ?? context.namespace : undefined;
    if (rule.types && util === undefined) {
      return { reason: "This file imports `util` only by name, so `util.types` is not reachable; the codemod does not add an import." };
    }
    const replacement = render(rule, argumentText(argument, source), util);
    const wrapped = rule.form === "binary" && needsParentheses(call) ? `(${replacement})` : replacement;
    return { start: call.startIndex, end: call.endIndex, replacement: wrapped };
  }
  return { reason: `The call at the reported location is not a direct \`util.${rule.name}\` call.` };
}

function render(rule: Rule, argument: string, util: string | undefined): string {
  return rule.template.split("{arg}").join(argument).split("{util}").join(util ?? "");
}

/** True when another `util.is*` target starts inside this call, which would make the two whole-call edits overlap. */
function nestedTarget(call: Node, offsets: ReadonlySet<number>): boolean {
  for (const offset of offsets) {
    if (offset > call.startIndex && offset < call.endIndex) return true;
  }
  return false;
}

/**
 * `os.tmpDir?.()` and `util?.isArray(x)` put the chain on the call in the JavaScript grammar but drop the node in the
 * TypeScript grammar, so the `?.` is also read from the source around the callee.
 */
function optionalCall(call: Node, callee: Node, source: string): boolean {
  if (call.childForFieldName("optional_chain") !== null) return true;
  const args = call.childForFieldName("arguments");
  const gap = args ? source.slice(callee.endIndex, args.startIndex) : "";
  return source.slice(callee.startIndex, callee.endIndex).includes("?.") || gap.includes("?.");
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

/** The local names a file binds to `util`, from `import`, `import * as`, `require`, and their destructured forms. */
function utilBindings(root: Node): Map<string, string> {
  const bindings = new Map<string, string>();
  const add = (local: string, imported: string): void => {
    if (!bindings.has(local)) bindings.set(local, imported);
  };
  for (const statement of root.descendantsOfType("import_statement")) {
    if (!statement) continue;
    const source = statement.childForFieldName("source") ?? statement.namedChildren.find((child) => child?.type === "string");
    if (!source || normalizeModule(unquote(source.text)) !== utilModule) continue;
    const clause = statement.namedChildren.find((child) => child?.type === "import_clause");
    if (!clause) continue;
    for (const child of clause.namedChildren) {
      if (!child) continue;
      if (child.type === "identifier") add(child.text, "default");
      else if (child.type === "namespace_import") {
        const local = child.namedChildren.find((candidate) => candidate?.type === "identifier");
        if (local) add(local.text, "*");
      } else if (child.type === "named_imports") {
        for (const specifier of child.namedChildren) {
          if (specifier?.type !== "import_specifier") continue;
          const imported = specifier.childForFieldName("name");
          const alias = specifier.childForFieldName("alias");
          if (!imported) continue;
          add(alias?.type === "identifier" ? alias.text : imported.text, unquote(imported.text));
        }
      }
    }
  }
  for (const declarator of root.descendantsOfType("variable_declarator")) {
    if (!declarator) continue;
    const name = declarator.childForFieldName("name");
    const value = declarator.childForFieldName("value");
    if (requiredModule(value) !== utilModule) continue;
    if (name?.type === "identifier") add(name.text, "*");
    else if (name?.type === "object_pattern") {
      for (const entry of patternEntries(name)) add(entry.local, entry.key);
    }
  }
  // `const u = util` and `const check = util.isArray` reach the same functions under another name.
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const declarator of root.descendantsOfType("variable_declarator")) {
      if (!declarator) continue;
      const name = declarator.childForFieldName("name");
      if (name?.type !== "identifier" || bindings.has(name.text)) continue;
      const imported = aliasTarget(declarator.childForFieldName("value"), bindings);
      if (imported === undefined) continue;
      add(name.text, imported);
      changed = true;
    }
    if (!changed) break;
  }
  return bindings;
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

/** The module `require("m")` reads, including the `node:` prefix, or undefined for any other expression. */
function requiredModule(node: Node | null | undefined): string | undefined {
  if (node?.type !== "call_expression") return undefined;
  const callee = node.childForFieldName("function");
  if (callee?.type !== "identifier" || callee.text !== "require") return undefined;
  const argument = node.childForFieldName("arguments")?.namedChildren[0];
  return argument?.type === "string" ? normalizeModule(unquote(argument.text)) : undefined;
}

function normalizeModule(module: string): string {
  return module.startsWith("node:") ? module.slice(5) : module;
}

function unquote(text: string): string {
  return text.replace(/^["'`]|["'`]$/g, "");
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

/** True for a name whose value can be substituted twice without a second call or construction. */
function durableReference(node: Node): boolean {
  switch (node.type) {
    case "identifier":
    case "this":
      return true;
    case "member_expression": {
      const object = node.childForFieldName("object");
      const property = node.childForFieldName("property");
      return property?.type === "property_identifier" && object !== null && object !== undefined && durableReference(object);
    }
    case "subscript_expression": {
      const object = node.childForFieldName("object");
      const index = node.childForFieldName("index");
      return object !== null && object !== undefined && durableReference(object) &&
        index !== null && index !== undefined && ["identifier", "number", "string"].includes(index.type);
    }

    case "parenthesized_expression":
    case "non_null_expression":
    case "type_assertion": {
      const inner = node.namedChildren.find((child) => child !== null);
      return inner !== undefined && durableReference(inner);
    }
    default:
      return false;
  }
}

/** Argument node types that bind tighter than every operator in a replacement, so they need no parentheses. */
const primaryArgumentTypes = new Set([
  "identifier", "this", "number", "string", "true", "false", "null", "undefined", "member_expression",
  "subscript_expression", "call_expression", "new_expression", "parenthesized_expression", "template_string",
  "regex", "array", "object", "unary_expression", "await_expression", "non_null_expression", "type_assertion",
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

function offsetOf(source: string, line: number, column: number): number {
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = source.indexOf("\n", start);
    if (next === -1) return -1;
    start = next + 1;
  }
  return start + column - 1 <= source.length ? start + column - 1 : -1;
}

/** Applies edits from the end of the file backwards so earlier offsets stay valid; their ranges never overlap. */
function applyEdits(source: string, edits: readonly Edit[]): string {
  let text = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    text = `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
  }
  return text;
}
