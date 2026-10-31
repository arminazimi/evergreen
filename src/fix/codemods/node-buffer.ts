import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../../agent-instructions.js";
import type { Finding, ScanResult, Severity, SourceUsage, UsageMatcher } from "../../domain.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { grammarFor, parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../index.js";

interface Rule {
  id: string;
  /** The bare name the usage analysis resolved to this rule. */
  name: string;
  /** `SlowBuffer` only exists as a constructor; a plain call is not rewritten. */
  constructOnly: boolean;
  /** The callee replacement for each literal kind the source can show. */
  replacement: { number: string; string?: string; array?: string };
  title: string;
  severity: Severity;
  matchers: UsageMatcher[];
}

const rules: readonly Rule[] = [
  {
    id: "nodejs.symbol.buffer.constructor",
    name: "Buffer",
    constructOnly: false,
    replacement: { number: "Buffer.alloc", string: "Buffer.from", array: "Buffer.from" },
    title: "The Buffer() constructor is deprecated",
    severity: "medium",
    matchers: [
      { kind: "symbol", language: "javascript", symbol: "Buffer", shape: "construct" },
      { kind: "symbol", language: "javascript", symbol: "Buffer", shape: "call" },
      { kind: "symbol", language: "typescript", symbol: "Buffer", shape: "construct" },
      { kind: "symbol", language: "typescript", symbol: "Buffer", shape: "call" },
    ],
  },
  {
    id: "nodejs.symbol.slowbuffer",
    name: "SlowBuffer",
    constructOnly: true,
    replacement: { number: "Buffer.allocUnsafeSlow" },
    title: "SlowBuffer has been removed",
    severity: "high",
    matchers: [
      { kind: "symbol", language: "javascript", module: "buffer", symbol: "SlowBuffer", shape: "construct" },
      { kind: "symbol", language: "javascript", module: "buffer", symbol: "SlowBuffer", shape: "call" },
      { kind: "symbol", language: "typescript", module: "buffer", symbol: "SlowBuffer", shape: "construct" },
      { kind: "symbol", language: "typescript", module: "buffer", symbol: "SlowBuffer", shape: "call" },
    ],
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

const typeAssertions = new Set(["as_expression", "satisfies_expression", "type_assertion", "non_null_expression"]);

/**
 * Rewrites `new Buffer(...)`, `Buffer(...)`, and `new SlowBuffer(...)` into `Buffer.alloc`, `Buffer.from`, or
 * `Buffer.allocUnsafeSlow` when the argument is a number, string, template without substitutions, or array literal.
 * Every other shape, and every argument whose kind is not visible in the source text, is refused with a reason.
 */
export const nodeBufferFixer: Fixer = {
  id: "node-buffer",
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
        const calls = callsByCallee(tree.rootNode);
        const edits: Edit[] = [];
        for (const target of fileTargets.sort(compareTargets)) {
          const rewrite = rewriteFor(target, calls, before);
          if ("reason" in rewrite) {
            declineOne(refuse, target, rewrite.reason);
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
    id: `${rule.id}:${usage.location.path}:${line}`,
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
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the two rules it covers.
 */
async function targetsFor(result: ScanResult): Promise<Target[]> {
  const targets: Target[] = [];
  const reported = new Map(rules.map((rule) => [rule.id, result.findings.filter((finding) => finding.ruleId === rule.id)]));
  const missing = rules.filter((rule) => reported.get(rule.id)!.length === 0);
  const analyses = missing.length === 0 ? [] : await analyzeSourceUsage(result.root, missing.map((rule) => ({ id: rule.id, matchers: rule.matchers })));
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

/**
 * Calls and constructions keyed by the offset where their callee starts, which is the location a symbol usage
 * reports. The usage analysis reports the first identifier of a member expression, so `buffer.SlowBuffer()` is
 * found here and refused rather than rewritten.
 */
function callsByCallee(root: Node): Map<number, Node[]> {
  const calls = new Map<number, Node[]>();
  for (const node of root.descendantsOfType(["call_expression", "new_expression"])) {
    if (!node) continue;
    const callee = node.type === "new_expression" ? node.childForFieldName("constructor") : node.childForFieldName("function");
    if (!callee) continue;
    const list = calls.get(callee.startIndex) ?? [];
    list.push(node);
    calls.set(callee.startIndex, list);
  }
  return calls;
}

function rewriteFor(target: Target, calls: Map<number, Node[]>, source: string): Edit | { reason: string } {
  const { usage, rule } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  const candidates = calls.get(offset);
  if (candidates === undefined) return { reason: `No ${rule.name} call is at the reported location.` };

  for (const call of candidates) {
    const isNew = call.type === "new_expression";
    const callee = isNew ? call.childForFieldName("constructor") : call.childForFieldName("function");
    if (callee?.type !== "identifier" || callee.text !== rule.name) continue;
    if (rule.constructOnly && !isNew) return { reason: `\`${rule.name}\` is only rewritten when it is constructed with \`new\`.` };
    const args = call.childForFieldName("arguments");
    if (!args) return { reason: "The call has no argument list." };
    const values = args.namedChildren.filter((value): value is Node => value !== null);
    const classification = classify(values);
    if ("reason" in classification) return classification;
    const replacement = rule.replacement[classification.kind];
    if (replacement === undefined) return { reason: `\`${rule.name}\` does not accept ${classification.kind} literals.` };
    return isNew
      ? { start: call.startIndex, end: callee.endIndex, replacement }
      : { start: callee.startIndex, end: callee.endIndex, replacement };
  }
  return { reason: `The call at the reported location is not a direct reference to \`${rule.name}\`.` };
}

type LiteralKind = "number" | "string" | "array";

function classify(values: readonly Node[]): { kind: LiteralKind } | { reason: string } {
  if (values.length === 0) return { reason: "The call passes no argument, so its kind is not known from the source text." };
  const first = unwrapParentheses(values[0]!);
  if (typeAssertions.has(first.type)) {
    return { reason: "The argument has a TypeScript type assertion, so its runtime kind is not rewritten." };
  }
  if (first.type === "number") {
    if (/n$/i.test(first.text)) return { reason: "The argument is a BigInt literal, not a number literal." };
    if (values.length !== 1) return { reason: "The numeric form takes exactly one argument." };
    return { kind: "number" };
  }
  if (first.type === "string" || first.type === "template_string") {
    if (first.type === "template_string" && first.namedChildren.some((child) => child?.type === "template_substitution")) {
      return { reason: "The template literal has substitutions, so its value is not known from the source text." };
    }
    if (values.length > 2) return { reason: "The string form takes at most a string literal encoding." };
    const encoding = values[1];
    if (encoding !== undefined) {
      const unwrapped = unwrapParentheses(encoding);
      if (typeAssertions.has(unwrapped.type)) {
        return { reason: "The encoding argument has a TypeScript type assertion, so its runtime kind is not rewritten." };
      }
      if (unwrapped.type !== "string") return { reason: "The second argument is not a string literal encoding." };
    }
    return { kind: "string" };
  }
  if (first.type === "array") {
    if (values.length !== 1) return { reason: "The array form takes exactly one argument." };
    return { kind: "array" };
  }
  return { reason: `The argument is ${describe(first.type)}; only a number, string, or array literal is rewritten.` };
}

function unwrapParentheses(node: Node): Node {
  let current = node;
  while (current.type === "parenthesized_expression") {
    const inner = current.namedChildren.find((child): child is Node => child !== null);
    if (inner === undefined) return current;
    current = inner;
  }
  return current;
}

function describe(type: string): string {
  switch (type) {
    case "identifier": return "an identifier";
    case "call_expression": return "a call expression";
    case "new_expression": return "a construction";
    case "member_expression": return "a member expression";
    case "binary_expression": return "a binary expression";
    case "unary_expression": return "a unary expression";
    case "spread_element": return "a spread argument";
    default: return `a ${type.replaceAll("_", " ")}`;
  }
}

function declineOne(refuse: Refuse | undefined, target: Target, reason: string): void {
  refuse?.(target.finding, reason);
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

/** Applies edits from the end of the file backwards so earlier offsets stay valid; nested calls never overlap. */
function applyEdits(source: string, edits: readonly Edit[]): string {
  let text = source;
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    text = `${text.slice(0, edit.start)}${edit.replacement}${text.slice(edit.end)}`;
  }
  return text;
}
