import type { ScanResult, Severity, UsageMatcher } from "../../domain.js";
import { required } from "../../required.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { callsByCallee } from "./shared/ast.js";
import { type Edit, patchFor } from "./shared/edits.js";
import { declineAll, groupByPath, planEachFile, sortTargets } from "./shared/plan.js";
import { offsetOf, readParseableFile } from "./shared/source.js";
import { analyzeTargets, syntheticFinding, type UsageTarget } from "./shared/targets.js";

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

type Target = UsageTarget<Rule>;

const typeAssertions = new Set(["as_expression", "satisfies_expression", "type_assertion", "non_null_expression"]);

/**
 * Rewrites `new Buffer(...)`, `Buffer(...)`, and `new SlowBuffer(...)` into `Buffer.alloc`, `Buffer.from`, or
 * `Buffer.allocUnsafeSlow` when the argument is a number, string, template without substitutions, or array literal.
 * Every other shape, and every argument whose kind is not visible in the source text, is refused with a reason.
 */
export const nodeBufferFixer: Fixer = {
  id: "node-buffer",
  async plan(result, refuse) {
    return planEachFile(groupByPath(await targetsFor(result)), (path, fileTargets) =>
      planFile(result.root, path, fileTargets, refuse),
    );
  },
};

/** The patch for one file's targets, or undefined when no call changes; every refusal is reported. */
async function planFile(
  root: string,
  path: string,
  fileTargets: readonly Target[],
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const decline = (reason: string): undefined => {
    declineAll(fileTargets, refuse, reason);
    return undefined;
  };
  const source = await readParseableFile(root, path, required(fileTargets[0], "the file target").usage.language);
  if ("reason" in source) return decline(source.reason);
  const tree = await parseSource(source.grammar, source.text);
  if (tree === undefined) return decline("The source file could not be parsed.");
  try {
    const calls = callsByCallee(tree.rootNode, ["call_expression", "new_expression"]);
    const edits: Edit[] = [];
    for (const target of sortTargets(fileTargets, (candidate) => candidate.rule.id)) {
      const rewrite = rewriteFor(target, calls, source.text);
      if ("reason" in rewrite) refuse?.(target.finding, rewrite.reason);
      else edits.push(rewrite);
    }
    return patchFor(path, source.text, edits);
  } finally {
    tree.delete();
  }
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the two rules it covers.
 */
async function targetsFor(result: ScanResult): Promise<Target[]> {
  const { targets } = await analyzeTargets(result, rules, {
    matchers: (rule) => rule.matchers,
    finding: (rule, usage) => syntheticFinding(rule, usage),
  });
  return targets;
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
    if (rule.constructOnly && !isNew)
      return { reason: `\`${rule.name}\` is only rewritten when it is constructed with \`new\`.` };
    const args = call.childForFieldName("arguments");
    if (!args) return { reason: "The call has no argument list." };
    const values = args.namedChildren.filter((value): value is Node => value !== null);
    const classification = classify(values);
    if ("reason" in classification) return classification;
    const replacement = rule.replacement[classification.kind];
    if (replacement === undefined)
      return { reason: `\`${rule.name}\` does not accept ${classification.kind} literals.` };
    return isNew
      ? { start: call.startIndex, end: callee.endIndex, replacement }
      : { start: callee.startIndex, end: callee.endIndex, replacement };
  }
  return { reason: `The call at the reported location is not a direct reference to \`${rule.name}\`.` };
}

type LiteralKind = "number" | "string" | "array";
type Classification = { kind: LiteralKind } | { reason: string };
type FirstArgumentCheck = (first: Node, values: readonly Node[]) => Classification;

const firstArgumentChecks = new Map<string, FirstArgumentCheck>([
  ["number", classifyNumber],
  ["string", classifyString],
  ["template_string", classifyString],
  ["array", classifyArray],
]);

function classify(values: readonly Node[]): Classification {
  if (values.length === 0)
    return { reason: "The call passes no argument, so its kind is not known from the source text." };
  const first = unwrapParentheses(required(values[0], "argument node"));
  if (typeAssertions.has(first.type)) {
    return { reason: "The argument has a TypeScript type assertion, so its runtime kind is not rewritten." };
  }
  const check = firstArgumentChecks.get(first.type);
  if (check === undefined) {
    return { reason: `The argument is ${describe(first.type)}; only a number, string, or array literal is rewritten.` };
  }
  return check(first, values);
}

function classifyNumber(first: Node, values: readonly Node[]): Classification {
  if (/n$/i.test(first.text)) return { reason: "The argument is a BigInt literal, not a number literal." };
  if (values.length !== 1) return { reason: "The numeric form takes exactly one argument." };
  return { kind: "number" };
}

function classifyString(first: Node, values: readonly Node[]): Classification {
  if (first.type === "template_string" && hasSubstitution(first)) {
    return { reason: "The template literal has substitutions, so its value is not known from the source text." };
  }
  if (values.length > 2) return { reason: "The string form takes at most a string literal encoding." };
  const encoding = values[1];
  if (encoding !== undefined) {
    const problem = encodingProblem(encoding);
    if (problem !== undefined) return { reason: problem };
  }
  return { kind: "string" };
}

function hasSubstitution(node: Node): boolean {
  return node.namedChildren.some((child) => child?.type === "template_substitution");
}

function encodingProblem(encoding: Node): string | undefined {
  const unwrapped = unwrapParentheses(encoding);
  if (typeAssertions.has(unwrapped.type)) {
    return "The encoding argument has a TypeScript type assertion, so its runtime kind is not rewritten.";
  }
  if (unwrapped.type !== "string") return "The second argument is not a string literal encoding.";
  return undefined;
}

function classifyArray(_first: Node, values: readonly Node[]): Classification {
  if (values.length !== 1) return { reason: "The array form takes exactly one argument." };
  return { kind: "array" };
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
    case "identifier":
      return "an identifier";
    case "call_expression":
      return "a call expression";
    case "new_expression":
      return "a construction";
    case "member_expression":
      return "a member expression";
    case "binary_expression":
      return "a binary expression";
    case "unary_expression":
      return "a unary expression";
    case "spread_element":
      return "a spread argument";
    default:
      return `a ${type.replaceAll("_", " ")}`;
  }
}
