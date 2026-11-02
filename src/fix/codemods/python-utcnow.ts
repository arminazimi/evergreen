import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../../agent-instructions.js";
import type { Finding, ScanResult, SourceUsage, UsageMatcher } from "../../domain.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer } from "../index.js";

interface Rule {
  id: string;
  /** The method read from the `datetime` class, as in `datetime.utcnow`. */
  symbol: string;
  title: string;
}

const rules: readonly Rule[] = [
  { id: "python.symbol.datetime.utcnow", symbol: "utcnow", title: "datetime.utcnow is deprecated" },
  { id: "python.symbol.datetime.utcfromtimestamp", symbol: "utcfromtimestamp", title: "datetime.utcfromtimestamp is deprecated" },
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
      const tree = await parseSource("python", before);
      if (tree === undefined) {
        decline("The source file could not be parsed.");
        continue;
      }
      try {
        if (tree.rootNode.hasError) {
          decline("The source file has syntax errors.");
          continue;
        }
        const calls = callsByCallee(tree.rootNode);
        const imports = inspectDatetimeImports(tree.rootNode);
        const shape = shapeFor(imports);
        const problem = shapeProblem(imports, shape);
        const edits: Edit[] = [];
        let rewrote = false;
        for (const target of fileTargets.sort(compareTargets)) {
          if (problem !== undefined) {
            refuse?.(target.finding, problem);
            continue;
          }
          const rewrite = rewriteFor(target, calls, shape!, before);
          if ("reason" in rewrite) {
            refuse?.(target.finding, rewrite.reason);
            continue;
          }
          edits.push(...rewrite.edits);
          rewrote = true;
        }
        if (!rewrote) continue;

        if (shape!.fromImport !== undefined && !imports.timezoneImported) {
          edits.push(timezoneEditFor(shape!.fromImport));
        }
        const text = applyEdits(before, edits);
        if (text !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
      } finally {
        tree.delete();
      }
    }
    return patches;
  },
};

function matchers(rule: Rule): UsageMatcher[] {
  return [{ kind: "symbol", language: "python", module: "datetime", symbol: `datetime.${rule.symbol}`, shape: "call" }];
}

function syntheticFinding(rule: Rule, usage: SourceUsage): Finding {
  return {
    id: `${rule.id}:${usage.location.path}:${usage.location.line ?? 1}`,
    ruleId: rule.id,
    detector: "codemod",
    title: rule.title,
    summary: "",
    severity: "medium",
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
  const reported = new Map(rules.map((rule) => [rule.id, result.findings.filter((finding) => finding.ruleId === rule.id)]));
  const missing = rules.filter((rule) => reported.get(rule.id)!.length === 0);
  const analyses = missing.length === 0
    ? []
    : await analyzeSourceUsage(result.root, missing.map((rule) => ({ id: rule.id, matchers: matchers(rule) })));
  const derived = new Map(analyses.map((analysis) => [analysis.contractId, analysis.usages]));

  const targets: Target[] = [];
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
  for (const node of root.descendantsOfType("call")) {
    if (!node) continue;
    const callee = node.childForFieldName("function");
    if (!callee) continue;
    const list = calls.get(callee.startIndex) ?? [];
    list.push(node);
    calls.set(callee.startIndex, list);
  }
  return calls;
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
    if (!node) continue;
    for (const child of node.namedChildren) {
      if (child?.type === "dotted_name" && child.text === "datetime") imports.moduleHead ??= "datetime";
      if (child?.type === "aliased_import" && child.childForFieldName("name")?.text === "datetime") {
        imports.moduleHead ??= child.childForFieldName("alias")?.text;
      }
      if (child && bindsName(child, "timezone")) imports.timezoneConflict = true;
    }
  }
  for (const node of root.descendantsOfType("import_from_statement")) {
    if (!node) continue;
    const moduleNode = node.childForFieldName("module_name");
    if (moduleNode === null || moduleNode === undefined) continue;
    if (moduleNode.text !== "datetime") {
      imports.timezoneConflict = imports.timezoneConflict ||
        node.namedChildren.some((child) => child !== null && child.id !== moduleNode.id && bindsName(child, "timezone"));
      continue;
    }
    if (node.namedChildren.some((child) => child?.type === "wildcard_import")) {
      imports.star = true;
      continue;
    }
    for (const child of node.namedChildren) {
      if (!child || child.id === moduleNode.id) continue;
      if (child.type === "dotted_name") {
        if (child.text === "datetime") imports.classImport ??= node;
        if (child.text === "timezone") imports.timezoneImported = true;
      }
      if (child.type === "aliased_import") {
        const name = child.childForFieldName("name")?.text;
        const alias = child.childForFieldName("alias")?.text;
        if (name === "datetime") imports.aliasedClass ??= alias;
        if (alias === "timezone" && name !== "timezone") imports.timezoneConflict = true;
      }
    }
  }
  imports.timezoneConflict = imports.timezoneConflict || bindsTimezoneOutsideDatetimeImports(root);
  return imports;
}

/** Whether an import-name node binds the local name `name`. */
function bindsName(node: Node, name: string): boolean {
  return (node.type === "dotted_name" && node.text === name) ||
    (node.type === "aliased_import" && node.childForFieldName("alias")?.text === name);
}

/**
 * Whether a statement other than `from datetime import ...` binds `timezone`: an assignment or loop target, a function
 * or class name, a parameter, a `with`/`except` alias, a walrus, or `global`/`nonlocal`. Import statements are checked
 * by the caller, which knows which module each name came from.
 */
function bindsTimezoneOutsideDatetimeImports(root: Node): boolean {
  for (const node of root.descendantsOfType(["assignment", "augmented_assignment", "for_statement", "for_in_clause", "named_expression"])) {
    const left = node?.childForFieldName("left") ?? node?.childForFieldName("name");
    if (left?.type === "identifier" && left.text === "timezone") return true;
  }
  for (const node of root.descendantsOfType(["function_definition", "class_definition"])) {
    if (node?.childForFieldName("name")?.text === "timezone") return true;
  }
  for (const node of root.descendantsOfType(["parameters", "lambda_parameters"])) {
    for (const parameter of node?.namedChildren ?? []) {
      if (!parameter) continue;
      const name = parameter.type === "identifier"
        ? parameter
        : parameter.type === "list_splat_pattern" || parameter.type === "dictionary_splat_pattern"
          ? parameter.namedChild(0)
          : parameter.childForFieldName("name");
      if (name?.type === "identifier" && name.text === "timezone") return true;
    }
  }
  for (const node of root.descendantsOfType("as_pattern")) {
    if (node?.childForFieldName("alias")?.text === "timezone") return true;
  }
  for (const node of root.descendantsOfType(["global_statement", "nonlocal_statement"])) {
    if (node?.namedChildren.some((child) => child?.type === "identifier" && child.text === "timezone")) return true;
  }
  return false;
}

/**
 * The import shape the file's calls are rewritten in, or undefined when no shape applies. A file that binds the same
 * name both ways is left alone, because a call written `datetime.` could read either binding.
 */
function shapeFor(imports: Imports): Shape | undefined {
  if (imports.moduleHead !== undefined && imports.classImport !== undefined && imports.moduleHead === "datetime") return undefined;
  if (imports.classImport !== undefined) {
    return { prefix: "datetime", timezone: "timezone.utc", fromImport: imports.classImport };
  }
  if (imports.moduleHead !== undefined) {
    return { prefix: `${imports.moduleHead}.datetime`, timezone: `${imports.moduleHead}.timezone.utc`, fromImport: undefined };
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
  if (imports.star) return "The file uses `from datetime import *`, so the codemod cannot tell where the names come from.";
  if (shape.fromImport !== undefined && !imports.timezoneImported) {
    if (imports.timezoneConflict) return "`timezone` is already bound to something other than `datetime.timezone` in this file.";
    const text = shape.fromImport.text;
    if (text.includes("(") || text.includes("\n")) {
      return "The `from datetime import datetime` statement is parenthesized or spans several lines, so `timezone` cannot be added to it.";
    }
  }
  return undefined;
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

  for (const call of candidates) {
    const callee = call.childForFieldName("function");
    if (callee?.type !== "attribute") continue;
    const object = callee.childForFieldName("object");
    if (object === null || object === undefined) continue;
    if (object.type !== "identifier" && object.type !== "attribute") continue;
    if (object.text !== shape.prefix) {
      return { reason: `The call at the reported location is not a direct \`${shape.prefix}.${rule.symbol}\` through the file's datetime import.` };
    }
    const args = call.childForFieldName("arguments");
    if (!args || args.type !== "argument_list") return { reason: "The call has no argument list." };
    const check = checkArguments(rule, args);
    if ("reason" in check) return check;

    if (rule.symbol === "utcnow") {
      const inner = args.startIndex + 1;
      return {
        edits: [
          { start: callee.startIndex, end: callee.endIndex, replacement: `${shape.prefix}.now` },
          { start: inner, end: inner, replacement: shape.timezone },
          { start: call.endIndex, end: call.endIndex, replacement: ".replace(tzinfo=None)" },
        ],
      };
    }
    const last = args.namedChildren.filter((argument): argument is Node => argument !== null).at(-1);
    return {
      edits: [
        { start: callee.startIndex, end: callee.endIndex, replacement: `${shape.prefix}.fromtimestamp` },
        { start: last!.endIndex, end: last!.endIndex, replacement: `, ${shape.timezone}` },
        { start: call.endIndex, end: call.endIndex, replacement: ".replace(tzinfo=None)" },
      ],
    };
  }
  return { reason: `The call at the reported location is not a direct \`${shape.prefix}.${rule.symbol}\` through the file's datetime import.` };
}

/** A replacement is written only when the call's arguments keep their meaning: none at all, or one plain positional. */
function checkArguments(rule: Rule, args: Node): { reason: string } | { ok: true } {
  const callArguments = args.namedChildren.filter((argument): argument is Node => argument !== null);
  if (rule.symbol === "utcnow") {
    if (args.text.slice(1, -1).trim() !== "") return { reason: "`datetime.utcnow` takes no arguments, so the call's arguments cannot be kept." };
    return { ok: true };
  }
  if (callArguments.length === 0) return { reason: "`datetime.utcfromtimestamp` needs a timestamp argument, so the call is left alone." };
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
  const names = statement.namedChildren.filter((child): child is Node => child !== null && (child.type === "dotted_name" || child.type === "aliased_import"));
  const last = names.at(-1)!;
  return { start: last.endIndex, end: last.endIndex, replacement: ", timezone" };
}

/** The character offset of a one-based line and column, or -1 when it is past the end of the source. */
function offsetOf(source: string, line: number, column: number): number {
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = source.indexOf("\n", start);
    if (next === -1) return -1;
    start = next + 1;
  }
  const offset = start + column - 1;
  return offset <= source.length ? offset : -1;
}

/** Applies edits from the end of the file backwards so earlier offsets stay valid; the edits never overlap. */
function applyEdits(source: string, edits: readonly Edit[]): string {
  let text = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start || left.end - right.end)) {
    text = `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
  }
  return text;
}
