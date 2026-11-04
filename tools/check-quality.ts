// Enforces the measurable quality bar in docs/QUALITY.md, on every `npm run check`.
//
//   node dist/tools/check-quality.js [--today YYYY-MM-DD] [--audit <npm-audit.json>] [--report]
//   node dist/tools/check-quality.js --against <ref>
//
// `--report` prints the remaining debt per section, and per directory for complexity and non-null, from the
// allowlist. It checks nothing and always exits 0.
//
// `--against <ref>` compares the working-tree allowlist and the TARGETS table with that git ref. A raised
// ceiling, a new entry, a later expiry, a removed owner, or a looser numeric limit fails. Removing or
// lowering entries passes. CI runs this on pull requests so the gate cannot loosen itself.
//
// The hand-written sources are parsed with the TypeScript compiler API. Nothing is type-checked and no
// repository code runs. Each measured number is compared with benchmarks/quality-allowlist.json:
//
// - A target with no allowlist entry must hold. A new file over 800 lines, a new function over 15, an
//   explicit `any`, or a `@ts-ignore` fails.
// - An entry is a ceiling on existing debt. It may shrink, and then its number is tightened to match,
//   or it may be removed. It may not grow, and it may not outlive its `expires` date.
// - An entry that no longer matches a violation is stale and fails until it is removed.
//
// The `--audit` option reads `npm audit --json` output that CI wrote; the tool itself does no network
// access. High and critical advisories can never be allowlisted.

import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join, posix, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

export const ALLOWLIST_PATH = "benchmarks/quality-allowlist.json";
export const ALLOWLIST_SCHEMA = "evergreen.quality-allowlist.v2";
/** The end of the v0.8.0 phase in docs/ROADMAP.md. No entry may run past it. */
export const MAX_EXPIRY = "2027-01-26";

export const TARGETS = {
  medianLines: 300,
  warnLines: 800,
  ceilingLines: 1000,
  complexity: 15,
} as const;

export type TargetLimits = { readonly [K in keyof typeof TARGETS]: number };

/** Source path of this checker; `--against` reads the TARGETS table from the same path on the ref. */
export const CHECKER_PATH = "tools/check-quality.ts";

/** Modules a detector may not import, and a rule may not reach through the engine. */
export const NETWORK_MODULES: readonly string[] = [
  "node:net",
  "node:http",
  "node:https",
  "node:dgram",
  "node:tls",
  "node:child_process",
  "net",
  "http",
  "https",
  "dgram",
  "tls",
  "child_process",
];

/** Adapters translate one interface to a host; they must not import detectors. */
export const ADAPTER_FILES: readonly string[] = ["src/cli.ts", "src/mcp.ts", "src/github-action.ts"];
export const DETECTOR_DIR = "src/detectors/";
export const ENGINE_FILES: readonly string[] = ["src/engine.ts", "src/domain.ts"];

export interface SourceFile {
  /** Repository-relative path with forward slashes. */
  path: string;
  text: string;
}

export interface FunctionMeasure {
  name: string;
  complexity: number;
}

export interface FileMeasure {
  path: string;
  lines: number;
  functions: FunctionMeasure[];
  explicitAny: number;
  asUnknownAs: number;
  nonNull: number;
  tsDirectives: number;
  /** Boundary rule id to the number of offending imports or calls. */
  boundary: Map<string, number>;
}

export interface AllowEntry {
  owner: string;
  expires: string;
  reason: string;
}

export interface FileSizeEntry extends AllowEntry {
  file: string;
  lines: number;
}

export interface ComplexityEntry extends AllowEntry {
  file: string;
  function: string;
  complexity: number;
}

export interface AsUnknownAsEntry extends AllowEntry {
  file: string;
  count: number;
}

export interface BoundaryEntry extends AllowEntry {
  file: string;
  rule: string;
  count: number;
}

export interface NonNullEntry extends AllowEntry {
  file: string;
  count: number;
}

export interface AuditEntry extends AllowEntry {
  advisory: string;
  package: string;
}

export interface Allowlist {
  schemaVersion: string;
  fileSize: FileSizeEntry[];
  complexity: ComplexityEntry[];
  asUnknownAs: AsUnknownAsEntry[];
  nonNull: NonNullEntry[];
  boundaries: BoundaryEntry[];
  audit: AuditEntry[];
}

export interface AuditAdvisory {
  id: string;
  package: string;
  severity: string;
}

export interface QualityInput {
  files: FileMeasure[];
  registryNonJson: string[];
  allowlist: Allowlist;
  /** Structural problems found while reading the allowlist. */
  allowlistProblems: Finding[];
  today: string;
  audit?: AuditAdvisory[];
}

export interface Finding {
  check: string;
  location: string;
  message: string;
}

const BOUNDARY_RULES = {
  engineNoDetectors: "engine-no-detectors",
  detectorsNoNetwork: "no-network",
  adaptersNoDetectors: "adapters-no-detectors",
  registryJsonOnly: "registry-json-only",
} as const;

export const BOUNDARY_RULE_IDS: readonly string[] = Object.values(BOUNDARY_RULES);

function isFunctionLike(node: ts.Node): node is ts.SignatureDeclaration & ts.FunctionLikeDeclarationBase {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function localFunctionName(node: ts.Node): string {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    if (node.name) return node.name.text;
  }
  if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return node.name.getText();
  }
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (ts.isPropertyAssignment(parent)) return parent.name.getText();
  return "<anonymous>";
}

/** Counts decision points in one function body, not in the functions nested inside it. */
export function cyclomaticComplexity(fn: ts.Node): number {
  let count = 1;
  const visit = (node: ts.Node): void => {
    if (node !== fn && isFunctionLike(node)) return;
    if (
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isCaseClause(node) ||
      ts.isCatchClause(node) ||
      ts.isConditionalExpression(node)
    ) {
      count += 1;
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn, visit);
  return count;
}

/** Every function in the file with its complexity. Methods are named `Class.method`, nested ones `outer > inner`. */
export function functionMeasures(file: ts.SourceFile): FunctionMeasure[] {
  const found: FunctionMeasure[] = [];
  const collect = (node: ts.Node, scope: string): void => {
    ts.forEachChild(node, (child) => {
      if (isFunctionLike(child)) {
        const local = localFunctionName(child);
        const owner = ts.isClassLike(child.parent) && child.parent.name ? `${child.parent.name.text}.` : "";
        const name = scope ? `${scope} > ${owner}${local}` : `${owner}${local}`;
        found.push({ name, complexity: cyclomaticComplexity(child) });
        collect(child, name);
        return;
      }
      if (ts.isClassLike(child) && child.name) {
        collect(child, scope);
        return;
      }
      collect(child, scope);
    });
  };
  collect(file, "");
  return withUniqueNames(found);
}

/** Two functions with the same name in one file get `#2`, `#3`, ... in source order, so keys stay unique. */
function withUniqueNames(found: FunctionMeasure[]): FunctionMeasure[] {
  const seen = new Map<string, number>();
  return found.map((fn) => {
    const count = (seen.get(fn.name) ?? 0) + 1;
    seen.set(fn.name, count);
    return count === 1 ? fn : { ...fn, name: `${fn.name}#${count}` };
  });
}

function importedModules(file: ts.SourceFile): string[] {
  const modules: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      modules.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      modules.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return modules;
}

/** Resolves a relative import to a repository path, or returns a bare specifier unchanged. */
function resolveSpecifier(from: string, specifier: string): string {
  if (!specifier.startsWith(".")) return specifier;
  return posix.normalize(posix.join(posix.dirname(from), specifier)).replace(/\.(js|ts)$/, "");
}

export function measureFile(path: string, text: string): FileMeasure {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const boundary = new Map<string, number>();
  const bump = (rule: string): void => {
    boundary.set(rule, (boundary.get(rule) ?? 0) + 1);
  };

  for (const specifier of importedModules(file)) {
    const target = resolveSpecifier(path, specifier);
    if (ENGINE_FILES.includes(path) && target.startsWith(DETECTOR_DIR)) bump(BOUNDARY_RULES.engineNoDetectors);
    if (ADAPTER_FILES.includes(path) && target.startsWith(DETECTOR_DIR)) bump(BOUNDARY_RULES.adaptersNoDetectors);
    if ((path.startsWith(DETECTOR_DIR) || ENGINE_FILES.includes(path)) && NETWORK_MODULES.includes(target)) {
      bump(BOUNDARY_RULES.detectorsNoNetwork);
    }
  }

  let explicitAny = 0;
  let asUnknownAs = 0;
  let nonNull = 0;
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) explicitAny += 1;
    if (
      ts.isAsExpression(node) &&
      ts.isAsExpression(node.expression) &&
      node.expression.type.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      asUnknownAs += 1;
    }
    if (ts.isNonNullExpression(node)) nonNull += 1;
    if (
      (path.startsWith(DETECTOR_DIR) || ENGINE_FILES.includes(path)) &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch"
    ) {
      bump(BOUNDARY_RULES.detectorsNoNetwork);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  const tsDirectives = [...text.matchAll(/@ts-(ignore|expect-error)\b/g)].length;

  return {
    path,
    lines: countLines(text),
    functions: functionMeasures(file),
    explicitAny,
    asUnknownAs,
    nonNull,
    tsDirectives,
    boundary,
  };
}

/** The line count `wc -l` reports for a file that ends in a newline. */
export function countLines(text: string): number {
  if (text.length === 0) return 0;
  const newlines = text.split("\n").length - 1;
  return text.endsWith("\n") ? newlines : newlines + 1;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OWNER = /^#\d+$/;

/** Fields every entry of a list must carry, and whether each is a number or a string. */
const REQUIRED_FIELDS: Readonly<
  Record<keyof Omit<Allowlist, "schemaVersion">, Readonly<Record<string, "string" | "count">>>
> = {
  fileSize: { file: "string", lines: "count" },
  nonNull: { file: "string", count: "count" },
  complexity: { file: "string", function: "string", complexity: "count" },
  asUnknownAs: { file: "string", count: "count" },
  boundaries: { file: "string", rule: "string", count: "count" },
  audit: { advisory: "string", package: "string" },
};

function validateEntry(list: string, entry: Record<string, unknown>, problems: Finding[]): void {
  const where = `${list}: ${JSON.stringify(entry.file ?? entry.function ?? entry.advisory ?? entry.rule ?? "")}`;
  const fields = REQUIRED_FIELDS[list as keyof typeof REQUIRED_FIELDS];
  for (const [field, kind] of Object.entries(fields)) {
    const value = entry[field];
    const valid =
      kind === "count" ? Number.isInteger(value) && (value as number) >= 0 : typeof value === "string" && value !== "";
    if (!valid)
      problems.push({
        check: "allowlist",
        location: where,
        message: `${field} must be ${kind === "count" ? "a whole number" : "a non-empty string"}`,
      });
  }
  if (typeof entry.owner !== "string" || !OWNER.test(entry.owner)) {
    problems.push({ check: "allowlist", location: where, message: `owner must be an issue number such as "#2041"` });
  }
  if (typeof entry.expires !== "string" || !DATE.test(entry.expires) || entry.expires > MAX_EXPIRY) {
    problems.push({
      check: "allowlist",
      location: where,
      message: `expires must be a date on or before ${MAX_EXPIRY} (the end of the v0.8.0 phase)`,
    });
  }
  if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
    problems.push({ check: "allowlist", location: where, message: "reason must say why the debt exists" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses the allowlist. Structural problems are returned as findings instead of thrown, so every one is reported. */
export function parseAllowlist(raw: unknown): { allowlist: Allowlist; problems: Finding[] } {
  const problems: Finding[] = [];
  const empty: Allowlist = {
    schemaVersion: ALLOWLIST_SCHEMA,
    fileSize: [],
    complexity: [],
    asUnknownAs: [],
    nonNull: [],
    boundaries: [],
    audit: [],
  };
  if (!isRecord(raw) || raw.schemaVersion !== ALLOWLIST_SCHEMA) {
    problems.push({
      check: "allowlist",
      location: ALLOWLIST_PATH,
      message: `schemaVersion must be "${ALLOWLIST_SCHEMA}"`,
    });
    return { allowlist: empty, problems };
  }
  const rows = (name: keyof typeof REQUIRED_FIELDS): Record<string, unknown>[] => {
    const value = raw[name];
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(isRecord)) {
      problems.push({ check: "allowlist", location: name, message: "must be an array of objects" });
      return [];
    }
    return value;
  };
  const lists = {
    fileSize: rows("fileSize"),
    complexity: rows("complexity"),
    asUnknownAs: rows("asUnknownAs"),
    nonNull: rows("nonNull"),
    boundaries: rows("boundaries"),
    audit: rows("audit"),
  };
  for (const [list, entries] of Object.entries(lists)) {
    for (const entry of entries) validateEntry(list, entry, problems);
  }
  return {
    allowlist: {
      schemaVersion: ALLOWLIST_SCHEMA,
      fileSize: lists.fileSize.map((entry) => ({
        ...details(entry),
        file: textOf(entry, "file"),
        lines: numberOf(entry, "lines"),
      })),
      complexity: lists.complexity.map((entry) => ({
        ...details(entry),
        file: textOf(entry, "file"),
        function: textOf(entry, "function"),
        complexity: numberOf(entry, "complexity"),
      })),
      asUnknownAs: lists.asUnknownAs.map((entry) => ({
        ...details(entry),
        file: textOf(entry, "file"),
        count: numberOf(entry, "count"),
      })),
      nonNull: lists.nonNull.map((entry) => ({
        ...details(entry),
        file: textOf(entry, "file"),
        count: numberOf(entry, "count"),
      })),
      boundaries: lists.boundaries.map((entry) => ({
        ...details(entry),
        file: textOf(entry, "file"),
        rule: textOf(entry, "rule"),
        count: numberOf(entry, "count"),
      })),
      audit: lists.audit.map((entry) => ({
        ...details(entry),
        advisory: textOf(entry, "advisory"),
        package: textOf(entry, "package"),
      })),
    },
    problems,
  };
}

/** Fields already checked by validateEntry, so the conversions below cannot receive a missing value. */
function details(entry: Record<string, unknown>): AllowEntry {
  return { owner: textOf(entry, "owner"), expires: textOf(entry, "expires"), reason: textOf(entry, "reason") };
}

function textOf(entry: Record<string, unknown>, key: string): string {
  const value = entry[key];
  return typeof value === "string" ? value : "";
}

function numberOf(entry: Record<string, unknown>, key: string): number {
  const value = entry[key];
  return typeof value === "number" ? value : 0;
}

function expiredFinding(check: string, location: string, expires: string, today: string): Finding | null {
  if (expires >= today) return null;
  return { check, location, message: `the allowlist entry expired on ${expires}; fix the debt or the check fails` };
}

/** The shared rule for a counted entry: it may shrink (tighten it) but not grow, and it must still match. */
function compareCount(check: string, location: string, current: number, ceiling: number, noun: string): Finding | null {
  if (current === 0) {
    return { check, location, message: `no ${noun} remain; remove this allowlist entry` };
  }
  if (current > ceiling) {
    return {
      check,
      location,
      message: `${noun} grew from ${ceiling} to ${current}; the allowlist is a ceiling, so reduce the ${noun} instead`,
    };
  }
  if (current < ceiling) {
    return { check, location, message: `${noun} is now ${current}; set this entry to ${current}` };
  }
  return null;
}

export function evaluateQuality(input: QualityInput): Finding[] {
  const findings: Finding[] = [...input.allowlistProblems];
  const { allowlist, today } = input;
  const files = input.files;

  // File size.
  const sizeEntries = new Map(allowlist.fileSize.map((entry) => [entry.file, entry]));
  const sizes = files.map((file) => file.lines);
  if (median(sizes) > TARGETS.medianLines) {
    findings.push({
      check: "file-size",
      location: "src/**/*.ts",
      message: `median file is ${median(sizes)} lines; the target is ${TARGETS.medianLines} or fewer. Split the largest files.`,
    });
  }
  for (const file of files) {
    const entry = sizeEntries.get(file.path);
    if (file.lines > TARGETS.warnLines && !entry) {
      const over = file.lines > TARGETS.ceilingLines ? "the 1,000-line ceiling" : "the 800-line limit";
      findings.push({
        check: "file-size",
        location: file.path,
        message: `${file.lines} lines is over ${over}. Split the file into modules; do not add an allowlist entry to pass.`,
      });
    }
    if (entry) {
      const expired = expiredFinding("file-size", file.path, entry.expires, today);
      if (expired) findings.push(expired);
      if (file.lines <= TARGETS.warnLines) {
        findings.push({
          check: "file-size",
          location: file.path,
          message: "now under 800 lines; remove this allowlist entry",
        });
      } else if (file.lines > entry.lines) {
        findings.push({
          check: "file-size",
          location: file.path,
          message: `grew from ${entry.lines} to ${file.lines} lines; the allowlist is a ceiling, so split the change`,
        });
      } else if (file.lines < entry.lines) {
        findings.push({
          check: "file-size",
          location: file.path,
          message: `is now ${file.lines} lines; set this entry to ${file.lines}`,
        });
      }
    }
  }
  for (const entry of allowlist.fileSize) {
    if (!files.some((file) => file.path === entry.file)) {
      findings.push({
        check: "file-size",
        location: entry.file,
        message: "the file no longer exists; remove this allowlist entry",
      });
    }
  }

  // Complexity.
  const complexityEntries = new Map(
    allowlist.complexity.map((entry) => [`${entry.file}\u0000${entry.function}`, entry]),
  );
  const measuredFunctions = new Map<string, number>();
  for (const file of files) {
    for (const fn of file.functions) {
      const key = `${file.path}\u0000${fn.name}`;
      measuredFunctions.set(key, fn.complexity);
      const entry = complexityEntries.get(key);
      const location = `${file.path} ${fn.name}`;
      if (fn.complexity > TARGETS.complexity && !entry) {
        findings.push({
          check: "complexity",
          location,
          message: `complexity ${fn.complexity} is over ${TARGETS.complexity}. Split the function into smaller functions; do not add an allowlist entry to pass.`,
        });
      }
      if (entry) {
        const expired = expiredFinding("complexity", location, entry.expires, today);
        if (expired) findings.push(expired);
        if (fn.complexity <= TARGETS.complexity) {
          findings.push({
            check: "complexity",
            location,
            message: "is now at or under 15; remove this allowlist entry",
          });
        } else if (fn.complexity > entry.complexity) {
          findings.push({
            check: "complexity",
            location,
            message: `complexity grew from ${entry.complexity} to ${fn.complexity}; the allowlist is a ceiling, so reduce it`,
          });
        } else if (fn.complexity < entry.complexity) {
          findings.push({
            check: "complexity",
            location,
            message: `complexity is now ${fn.complexity}; set this entry to ${fn.complexity}`,
          });
        }
      }
    }
  }
  for (const entry of allowlist.complexity) {
    if (!measuredFunctions.has(`${entry.file}\u0000${entry.function}`)) {
      findings.push({
        check: "complexity",
        location: `${entry.file} ${entry.function}`,
        message: "no such function; remove this allowlist entry (or fix its name)",
      });
    }
  }

  // Type safety.
  for (const file of files) {
    if (file.explicitAny > 0) {
      findings.push({
        check: "type-safety",
        location: file.path,
        message: `${file.explicitAny} explicit \`any\`. Use a real type, \`unknown\` with a narrowing check, or a generic.`,
      });
    }
    if (file.tsDirectives > 0) {
      findings.push({
        check: "type-safety",
        location: file.path,
        message: `${file.tsDirectives} \`@ts-ignore\` or \`@ts-expect-error\`. Fix the type instead.`,
      });
    }
  }
  const unknownEntries = new Map(allowlist.asUnknownAs.map((entry) => [entry.file, entry]));
  for (const file of files) {
    const entry = unknownEntries.get(file.path);
    if (file.asUnknownAs > 0 && !entry) {
      findings.push({
        check: "type-safety",
        location: file.path,
        message: `${file.asUnknownAs} new \`as unknown as\`. Narrow the type instead; this count may not grow.`,
      });
    }
    if (entry) {
      const expired = expiredFinding("type-safety", file.path, entry.expires, today);
      if (expired) findings.push(expired);
      const finding = compareCount("type-safety", file.path, file.asUnknownAs, entry.count, "`as unknown as`");
      if (finding) findings.push(finding);
    }
  }
  for (const entry of allowlist.asUnknownAs) {
    if (!files.some((file) => file.path === entry.file)) {
      findings.push({
        check: "type-safety",
        location: entry.file,
        message: "the file no longer exists; remove this allowlist entry",
      });
    }
  }
  const nonNullEntries = new Map(allowlist.nonNull.map((entry) => [entry.file, entry]));
  for (const file of files) {
    const entry = nonNullEntries.get(file.path);
    if (file.nonNull > 0 && !entry) {
      findings.push({
        check: "type-safety",
        location: file.path,
        message: `${file.nonNull} non-null assertions and no allowlist entry; this count may not grow`,
      });
    }
    if (entry) {
      const expired = expiredFinding("type-safety", file.path, entry.expires, today);
      if (expired) findings.push(expired);
      const finding = compareCount("type-safety", file.path, file.nonNull, entry.count, "non-null assertions");
      if (finding) findings.push(finding);
    }
  }
  for (const entry of allowlist.nonNull) {
    if (!files.some((file) => file.path === entry.file)) {
      findings.push({
        check: "type-safety",
        location: entry.file,
        message: "the file no longer exists; remove this allowlist entry",
      });
    }
  }

  // Boundaries.
  const boundaryEntries = new Map(allowlist.boundaries.map((entry) => [`${entry.file}\u0000${entry.rule}`, entry]));
  const boundaryCounts = new Map<string, number>();
  for (const file of files) {
    for (const [rule, count] of file.boundary) boundaryCounts.set(`${file.path}\u0000${rule}`, count);
  }
  for (const file of input.registryNonJson) {
    boundaryCounts.set(`${file}\u0000${BOUNDARY_RULES.registryJsonOnly}`, 1);
  }
  for (const [key, count] of boundaryCounts) {
    const [file, rule] = key.split("\u0000") as [string, string];
    const entry = boundaryEntries.get(key);
    if (!entry) {
      findings.push({
        check: "boundaries",
        location: file,
        message: `breaks rule \`${rule}\` (${count}); move the code to the layer that owns it (AGENTS.md, Architecture boundaries)`,
      });
      continue;
    }
    const expired = expiredFinding("boundaries", file, entry.expires, today);
    if (expired) findings.push(expired);
    const finding = compareCount("boundaries", `${file} ${rule}`, count, entry.count, "violations");
    if (finding) findings.push(finding);
  }
  for (const entry of allowlist.boundaries) {
    if (!boundaryCounts.has(`${entry.file}\u0000${entry.rule}`)) {
      findings.push({
        check: "boundaries",
        location: `${entry.file} ${entry.rule}`,
        message: "no violation remains; remove this allowlist entry",
      });
    }
  }

  // Dependency advisories, from npm audit output that CI wrote.
  if (input.audit) {
    const audited = new Set(allowlist.audit.map((entry) => entry.advisory));
    for (const advisory of input.audit) {
      if (advisory.severity === "high" || advisory.severity === "critical") {
        findings.push({
          check: "security",
          location: advisory.package,
          message: `${advisory.severity} advisory ${advisory.id}; fix or replace the dependency. High and critical advisories are never allowlisted.`,
        });
      } else if (!audited.has(advisory.id)) {
        findings.push({
          check: "security",
          location: advisory.package,
          message: `${advisory.severity} advisory ${advisory.id} is not allowlisted; update the dependency or add an entry with an owner and expiry`,
        });
      }
    }
    for (const entry of allowlist.audit) {
      const expired = expiredFinding("security", entry.advisory, entry.expires, today);
      if (expired) findings.push(expired);
      if (!input.audit.some((advisory) => advisory.id === entry.advisory)) {
        findings.push({
          check: "security",
          location: entry.advisory,
          message: "no longer reported; remove this allowlist entry",
        });
      }
    }
  }

  return findings;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The hand-written TypeScript under src/, minus the vendored tree and the generated index. */
export function isHandWritten(path: string): boolean {
  return (
    path.startsWith("src/") && path.endsWith(".ts") && !path.includes("/vendor/") && !path.endsWith(".generated.ts")
  );
}

/** Repository-relative file paths under `dir`, with forward slashes. */
async function listFiles(root: string, dir: string): Promise<string[]> {
  const entries = await readdir(resolve(root, dir), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
}

export async function readRepository(root: string, today: string, auditPath?: string): Promise<QualityInput> {
  const sourcePaths = (await listFiles(root, "src")).filter(isHandWritten);
  const files: FileMeasure[] = [];
  for (const path of sourcePaths) {
    files.push(measureFile(path, await readFile(resolve(root, path), "utf8")));
  }
  const registryNonJson = (await listFiles(root, "registry")).filter((path) => !path.endsWith(".json"));
  const { allowlist, problems } = parseAllowlist(JSON.parse(await readFile(resolve(root, ALLOWLIST_PATH), "utf8")));
  const input: QualityInput = { files, registryNonJson, allowlist, allowlistProblems: problems, today };
  if (auditPath) {
    input.audit = parseAudit(JSON.parse(await readFile(resolve(root, auditPath), "utf8")));
  }
  return input;
}

/** npm audit's `vulnerabilities` map, reduced to one row per advisory. */
export function parseAudit(report: unknown): AuditAdvisory[] {
  if (!isRecord(report) || !isRecord(report.vulnerabilities)) return [];
  const rows = new Map<string, AuditAdvisory>();
  for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
    if (!isRecord(vulnerability) || !Array.isArray(vulnerability.via)) continue;
    for (const via of vulnerability.via) {
      if (!isRecord(via) || typeof via.url !== "string") continue;
      const id = via.url.split("/").at(-1) ?? via.url;
      const severity = typeof via.severity === "string" ? via.severity : String(vulnerability.severity ?? "unknown");
      rows.set(id, { id, package: name, severity });
    }
  }
  return [...rows.values()];
}

export function renderFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return "";
  const lines = findings.map((finding) => `${finding.check}: ${finding.location}: ${finding.message}`);
  return `${lines.join("\n")}\n\n${findings.length} quality finding(s). See docs/QUALITY.md; a failing check blocks the pull request.\n`;
}

/** A table of `label  value  unit` rows, with the labels and values aligned. Empty input gives no lines. */
function formatTable(rows: readonly (readonly [label: string, value: number, unit: string])[]): string[] {
  if (rows.length === 0) return [];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const valueWidth = Math.max(...rows.map(([, value]) => String(value).length));
  return rows.map(([label, value, unit]) =>
    `${label.padEnd(labelWidth)}  ${String(value).padStart(valueWidth)}  ${unit}`.trimEnd(),
  );
}

/** Sums one number per file into its directory, largest first; ties sort by name so the output is stable. */
function directoryTotals(
  entries: readonly (readonly [file: string, size: number])[],
): [label: string, value: number, unit: string][] {
  const totals = new Map<string, number>();
  for (const [file, size] of entries) {
    const directory = posix.dirname(file);
    totals.set(directory, (totals.get(directory) ?? 0) + size);
  }
  return [...totals]
    .sort(([a, sizeA], [b, sizeB]) => sizeB - sizeA || (a < b ? -1 : a > b ? 1 : 0))
    .map(([directory, size]) => [directory, size, ""]);
}

/** The debt each allowlist section still carries. Counts come from the allowlist, which the check keeps equal to the measured values. */
export function renderReport(allowlist: Allowlist): string {
  const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
  const sections: [label: string, value: number, unit: string][] = [
    ["file size", allowlist.fileSize.length, "files over 800 lines"],
    ["complexity", allowlist.complexity.length, "functions over 15"],
    ["as unknown as", allowlist.asUnknownAs.length, "files"],
    ["non-null", sum(allowlist.nonNull.map((entry) => entry.count)), "non-null assertions"],
    ["boundaries", sum(allowlist.boundaries.map((entry) => entry.count)), "boundary violations"],
    ["audit", allowlist.audit.length, "advisories"],
  ];
  const complexityByDirectory = directoryTotals(allowlist.complexity.map((entry) => [entry.file, 1]));
  const nonNullByDirectory = directoryTotals(allowlist.nonNull.map((entry) => [entry.file, entry.count]));
  const lines = [
    `remaining debt, from ${ALLOWLIST_PATH}`,
    "",
    ...formatTable(sections),
    "",
    "complexity by directory (functions over 15)",
    ...formatTable(complexityByDirectory).map((line) => `  ${line}`),
    "",
    "non-null by directory (assertions)",
    ...formatTable(nonNullByDirectory).map((line) => `  ${line}`),
  ];
  return `${lines.join("\n")}\n`;
}

function gitFailure(error: unknown): string {
  const stderr = (error as { stderr?: string | Buffer }).stderr;
  const text = typeof stderr === "string" ? stderr : stderr?.toString("utf8");
  return (text ?? (error instanceof Error ? error.message : String(error))).trim();
}

/** Blob contents of `path` at `ref`, or a clear error when the ref or path is missing. */
export function readGitFile(ref: string, path: string, root = process.cwd()): string {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    throw new Error(
      `Cannot read ${path} at "${ref}": ${gitFailure(error)}. ` +
        `Fetch it first (git fetch origin main) or pass --against <ref>.`,
    );
  }
}

/** Reads the numeric TARGETS table from a checker source file. Missing or incomplete tables return null. */
export function parseTargets(source: string): TargetLimits | null {
  const block = source.match(/export const TARGETS = \{([^}]*)\}/s);
  if (!block) return null;
  const body = block[1] ?? "";
  const read = (name: keyof typeof TARGETS): number | null => {
    const match = body.match(new RegExp(`${name}\\s*:\\s*(\\d+)`));
    if (!match) return null;
    return Number(match[1]);
  };
  const medianLines = read("medianLines");
  const warnLines = read("warnLines");
  const ceilingLines = read("ceilingLines");
  const complexity = read("complexity");
  if (medianLines === null || warnLines === null || ceilingLines === null || complexity === null) return null;
  return { medianLines, warnLines, ceilingLines, complexity };
}

/** Fails when any numeric limit in `current` is higher (looser) than in `baseline`. */
export function compareTargets(baseline: TargetLimits, current: TargetLimits): Finding[] {
  const findings: Finding[] = [];
  for (const key of Object.keys(TARGETS) as (keyof typeof TARGETS)[]) {
    if (current[key] > baseline[key]) {
      findings.push({
        check: "gate",
        location: `TARGETS.${key}`,
        message: `limit loosened from ${baseline[key]} to ${current[key]}; the quality gate may only tighten against the base ref`,
      });
    }
  }
  return findings;
}

interface GateEntry {
  owner: string;
  expires: string;
  ceiling?: number;
}

/** Shared rules for one allowlist section: no new keys, no higher ceiling, no later expiry, no removed owner. */
function compareGateEntries(
  section: string,
  baseline: ReadonlyMap<string, GateEntry>,
  current: ReadonlyMap<string, GateEntry>,
  ceilingNoun?: string,
): Finding[] {
  const findings: Finding[] = [];
  for (const [key, head] of current) {
    const where = `${section}: ${key.replaceAll("\u0000", " ")}`;
    const base = baseline.get(key);
    if (!base) {
      findings.push({
        check: "gate",
        location: where,
        message: "new allowlist entry; remove it or fix the debt instead of raising the gate",
      });
      continue;
    }
    if (
      ceilingNoun !== undefined &&
      head.ceiling !== undefined &&
      base.ceiling !== undefined &&
      head.ceiling > base.ceiling
    ) {
      findings.push({
        check: "gate",
        location: where,
        message: `${ceilingNoun} raised from ${base.ceiling} to ${head.ceiling}; the allowlist may only shrink against the base ref`,
      });
    }
    if (head.expires > base.expires) {
      findings.push({
        check: "gate",
        location: where,
        message: `expiry moved later from ${base.expires} to ${head.expires}; the allowlist may only shorten against the base ref`,
      });
    }
    if (base.owner !== "" && head.owner === "") {
      findings.push({
        check: "gate",
        location: where,
        message: `owner ${base.owner} was removed; keep an issue owner on every entry`,
      });
    }
  }
  return findings;
}

function gateMap(
  entries: readonly AllowEntry[],
  keyOf: (entry: AllowEntry) => string,
  ceilingOf?: (entry: AllowEntry) => number,
): Map<string, GateEntry> {
  const map = new Map<string, GateEntry>();
  for (const entry of entries) {
    map.set(keyOf(entry), {
      owner: entry.owner,
      expires: entry.expires,
      ...(ceilingOf === undefined ? {} : { ceiling: ceilingOf(entry) }),
    });
  }
  return map;
}

/** Compares two allowlists: raising a ceiling, adding an entry, extending expiry, or dropping an owner fails. */
export function compareAllowlists(baseline: Allowlist, current: Allowlist): Finding[] {
  const fileKey = (entry: AllowEntry): string => (entry as FileSizeEntry).file;
  const complexityKey = (entry: AllowEntry): string => {
    const row = entry as ComplexityEntry;
    return `${row.file}\u0000${row.function}`;
  };
  const boundaryKey = (entry: AllowEntry): string => {
    const row = entry as BoundaryEntry;
    return `${row.file}\u0000${row.rule}`;
  };
  const auditKey = (entry: AllowEntry): string => (entry as AuditEntry).advisory;
  return [
    ...compareGateEntries(
      "fileSize",
      gateMap(baseline.fileSize, fileKey, (e) => (e as FileSizeEntry).lines),
      gateMap(current.fileSize, fileKey, (e) => (e as FileSizeEntry).lines),
      "lines",
    ),
    ...compareGateEntries(
      "complexity",
      gateMap(baseline.complexity, complexityKey, (e) => (e as ComplexityEntry).complexity),
      gateMap(current.complexity, complexityKey, (e) => (e as ComplexityEntry).complexity),
      "complexity",
    ),
    ...compareGateEntries(
      "asUnknownAs",
      gateMap(baseline.asUnknownAs, fileKey, (e) => (e as AsUnknownAsEntry).count),
      gateMap(current.asUnknownAs, fileKey, (e) => (e as AsUnknownAsEntry).count),
      "count",
    ),
    ...compareGateEntries(
      "nonNull",
      gateMap(baseline.nonNull, fileKey, (e) => (e as NonNullEntry).count),
      gateMap(current.nonNull, fileKey, (e) => (e as NonNullEntry).count),
      "count",
    ),
    ...compareGateEntries(
      "boundaries",
      gateMap(baseline.boundaries, boundaryKey, (e) => (e as BoundaryEntry).count),
      gateMap(current.boundaries, boundaryKey, (e) => (e as BoundaryEntry).count),
      "count",
    ),
    ...compareGateEntries("audit", gateMap(baseline.audit, auditKey), gateMap(current.audit, auditKey)),
  ];
}

/** Loads the allowlist and TARGETS at `ref` and compares them with the working tree. */
export async function evaluateAgainst(ref: string, root = process.cwd()): Promise<Finding[]> {
  const { allowlist, problems } = parseAllowlist(JSON.parse(readGitFile(ref, ALLOWLIST_PATH, root)));
  if (problems.length > 0) {
    return problems.map((problem) => ({
      check: "gate",
      location: problem.location,
      message: `base allowlist at ${ref} is invalid: ${problem.message}`,
    }));
  }
  const baselineTargets = parseTargets(readGitFile(ref, CHECKER_PATH, root));
  if (baselineTargets === null) {
    return [{ check: "gate", location: CHECKER_PATH, message: `TARGETS table missing or incomplete at ${ref}` }];
  }
  const { allowlist: current, problems: currentProblems } = parseAllowlist(
    JSON.parse(await readFile(resolve(root, ALLOWLIST_PATH), "utf8")),
  );
  if (currentProblems.length > 0) return currentProblems;
  return [...compareAllowlists(allowlist, current), ...compareTargets(baselineTargets, TARGETS)];
}

export function parseArguments(argv: readonly string[]): {
  today: string;
  audit?: string;
  report?: boolean;
  against?: string;
} {
  const options: { today: string; audit?: string; report?: boolean; against?: string } = { today: isoToday() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--today") options.today = argv[++index] ?? options.today;
    else if (arg === "--audit") {
      const path = argv[++index];
      if (path === undefined) throw new Error("--audit needs a file path");
      options.audit = path;
    } else if (arg === "--report") options.report = true;
    else if (arg === "--against") {
      const ref = argv[++index];
      if (ref === undefined) throw new Error("--against needs a git ref");
      options.against = ref;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.against !== undefined) {
      const findings = await evaluateAgainst(options.against);
      if (findings.length > 0) {
        process.stderr.write(renderFindings(findings));
        process.exitCode = 1;
      } else {
        process.stdout.write(`quality gate: allowlist and TARGETS hold against ${options.against}\n`);
      }
    } else {
      const input = await readRepository(process.cwd(), options.today, options.audit);
      if (options.report) {
        process.stdout.write(renderReport(input.allowlist));
      } else {
        const findings = evaluateQuality(input);
        if (findings.length > 0) {
          process.stderr.write(renderFindings(findings));
          process.exitCode = 1;
        } else {
          process.stdout.write(`quality: ${input.files.length} files, all targets hold\n`);
        }
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
