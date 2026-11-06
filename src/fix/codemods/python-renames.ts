import type { Finding, ScanResult, Severity, SourceUsage, UsageMatcher } from "../../domain.js";
import { required } from "../../required.js";
import { analyzeSourceUsage } from "../../source-usage.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { type Edit, patchFor } from "./shared/edits.js";
import { declineAll, groupByPath, planEachFile, sortTargets } from "./shared/plan.js";
import { locate, offsetOf, readRepositoryFile } from "./shared/source.js";
import { syntheticFinding } from "./shared/targets.js";

interface ModuleRename {
  id: string;
  /** The module that exports the symbol, as it is imported. */
  module: string;
  /** The removed name. */
  from: string;
  /** The current name. */
  to: string;
  title: string;
}

/** The two Python 3.12 removals that are one-to-one renames of a remaining symbol. */
const moduleRenames: readonly ModuleRename[] = [
  {
    id: "python.symbol.configparser.safeconfigparser",
    module: "configparser",
    from: "SafeConfigParser",
    to: "ConfigParser",
    title: "Configparser.SafeConfigParser has been removed",
  },
  {
    id: "python.symbol.io.openwrapper",
    module: "io",
    from: "OpenWrapper",
    to: "open",
    title: "Io.OpenWrapper has been removed",
  },
];

interface Alias {
  /** The removed TestCase method. */
  from: string;
  /** The current TestCase method, or undefined when Python 3.12 left no replacement. */
  to: string | undefined;
}

/** The unittest aliases Python 3.12 removed, in the order What's New lists them. */
const aliases: readonly Alias[] = [
  { from: "assertEquals", to: "assertEqual" },
  { from: "assertNotEquals", to: "assertNotEqual" },
  { from: "assert_", to: "assertTrue" },
  { from: "failUnless", to: "assertTrue" },
  { from: "failIf", to: "assertFalse" },
  { from: "failUnlessEqual", to: "assertEqual" },
  { from: "failIfEqual", to: "assertNotEqual" },
  { from: "assertAlmostEquals", to: "assertAlmostEqual" },
  { from: "assertNotAlmostEquals", to: "assertNotAlmostEqual" },
  { from: "failUnlessAlmostEqual", to: "assertAlmostEqual" },
  { from: "failIfAlmostEqual", to: "assertNotAlmostEqual" },
  { from: "failUnlessRaises", to: "assertRaises" },
  { from: "assertRegexpMatches", to: "assertRegex" },
  { from: "assertNotRegexpMatches", to: "assertNotRegex" },
  { from: "assertRaisesRegexp", to: "assertRaisesRegex" },
  { from: "assertDictContainsSubset", to: undefined },
];

const aliasRuleId = "python.symbol.unittest.removed-aliases";
const aliasRuleTitle = "The deprecated unittest aliases have been removed";

interface Target {
  ruleId: string;
  title: string;
  severity: Severity;
  /** Set for a module rename. */
  rename?: ModuleRename;
  /** Set for a removed TestCase alias. */
  alias?: Alias;
  usage: SourceUsage;
  finding: Finding;
}

/**
 * Rewrites the Python 3.12 one-to-one renames: `configparser.SafeConfigParser` to `configparser.ConfigParser`,
 * `io.OpenWrapper` to `io.open`, and the deprecated `unittest.TestCase` aliases to the methods they call. A call
 * through a local alias and an alias with no replacement are refused with the reason. The replacement name is the
 * only text that changes; the receiver, arguments, and every other byte are kept.
 */
export const pythonRenamesFixer: Fixer = {
  id: "python-renames",
  async plan(result, refuse) {
    const { targets, unittestPaths } = await targetsFor(result.root, result);
    const byPath = groupByPath(targets);
    for (const path of unittestPaths) if (!byPath.has(path)) byPath.set(path, []);
    return planEachFile(byPath, (path, fileTargets) =>
      planPath(result.root, path, fileTargets, unittestPaths.has(path), refuse),
    );
  },
};

async function planPath(
  repositoryRoot: string,
  path: string,
  fileTargets: readonly Target[],
  isUnittestPath: boolean,
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
    const edits = editsFor(fileTargets, indexFile(tree.rootNode), tree.rootNode, source.text, refuse);
    if (isUnittestPath) {
      refuseAliasesOutsideTestcase(path, tree.rootNode, source.text, testcaseClassIds(tree.rootNode), refuse);
    }
    return patchFor(path, source.text, dedupe(edits));
  } finally {
    tree.delete();
  }
}

function editsFor(
  fileTargets: readonly Target[],
  index: FileIndex,
  root: Node,
  source: string,
  refuse: Refuse | undefined,
): Edit[] {
  const edits: Edit[] = [];
  for (const target of sortTargets(fileTargets, (candidate) => candidate.ruleId)) {
    const rewrite = rewriteFor(target, index, root, source);
    if ("reason" in rewrite) refuse?.(target.finding, rewrite.reason);
    else edits.push(...rewrite.edits);
  }
  return edits;
}

function moduleMatchers(rename: ModuleRename): UsageMatcher[] {
  return [
    { kind: "symbol", language: "python", module: rename.module, symbol: rename.from, shape: "call" },
    { kind: "symbol", language: "python", module: rename.module, symbol: rename.from, shape: "reference" },
  ];
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use. The analysis also finds the files that
 * import unittest, so an alias call outside a TestCase class can be refused even though it is not reported as a usage.
 */
async function targetsFor(
  root: string,
  result: ScanResult,
): Promise<{ targets: Target[]; unittestPaths: Set<string> }> {
  const ruleIds = [...moduleRenames.map((rename) => rename.id), aliasRuleId];
  const reported = new Map(ruleIds.map((id) => [id, result.findings.filter((finding) => finding.ruleId === id)]));
  const analyses = await analyzeSourceUsage(root, usageContracts());
  const byContract = new Map(analyses.map((analysis) => [analysis.contractId, analysis.usages]));
  const targets = [...moduleTargets(reported, byContract), ...aliasTargets(reported, byContract)];
  const unittestPaths = new Set((byContract.get("import:unittest") ?? []).map((usage) => usage.location.path));
  return { targets, unittestPaths };
}

function usageContracts(): { id: string; matchers: UsageMatcher[] }[] {
  return [
    ...moduleRenames.map((rename) => ({ id: `module:${rename.id}`, matchers: moduleMatchers(rename) })),
    {
      id: "alias",
      matchers: aliases.map(
        (alias): UsageMatcher => ({
          kind: "symbol",
          language: "python",
          module: "unittest",
          symbol: alias.from,
          shape: "method",
        }),
      ),
    },
    { id: "import:unittest", matchers: [{ kind: "import", language: "python", module: "unittest" }] },
  ];
}

function moduleTargets(
  reported: ReadonlyMap<string, Finding[]>,
  byContract: ReadonlyMap<string, SourceUsage[]>,
): Target[] {
  const targets: Target[] = [];
  for (const rename of moduleRenames) {
    const findings = required(reported.get(rename.id), "reported findings");
    if (findings.length > 0) {
      for (const finding of findings) {
        for (const usage of finding.usages ?? []) targets.push(moduleTarget(rename, usage, finding));
      }
      continue;
    }
    for (const usage of byContract.get(`module:${rename.id}`) ?? []) {
      targets.push(moduleTarget(rename, usage));
    }
  }
  return targets;
}

function moduleTarget(rename: ModuleRename, usage: SourceUsage, finding?: Finding): Target {
  return {
    ruleId: rename.id,
    title: rename.title,
    severity: "high",
    rename,
    usage,
    finding: finding ?? syntheticFinding({ id: rename.id, title: rename.title, severity: "high" }, usage, true),
  };
}

function aliasTargets(
  reported: ReadonlyMap<string, Finding[]>,
  byContract: ReadonlyMap<string, SourceUsage[]>,
): Target[] {
  const targets: Target[] = [];
  const add = (usage: SourceUsage, finding?: Finding): void => {
    const alias = aliasFor(usage);
    if (alias !== undefined) {
      targets.push({
        ruleId: aliasRuleId,
        title: aliasRuleTitle,
        severity: "high",
        alias,
        usage,
        finding: finding ?? syntheticFinding({ id: aliasRuleId, title: aliasRuleTitle, severity: "high" }, usage, true),
      });
    }
  };
  const findings = required(reported.get(aliasRuleId), "reported findings");
  if (findings.length > 0) {
    for (const finding of findings) {
      for (const usage of finding.usages ?? []) add(usage, finding);
    }
    return targets;
  }
  for (const usage of byContract.get("alias") ?? []) add(usage);
  return targets;
}

function aliasFor(usage: SourceUsage): Alias | undefined {
  return aliases.find((alias) => usage.symbol === `unittest.${alias.from}`);
}

interface FileIndex {
  /** Calls by the offset where the callee chain starts, which is the location a symbol usage reports. */
  callsByCallee: Map<number, Node[]>;
  /** Calls by the offset of the method name, which is the location a `method` usage reports. */
  callsByMethod: Map<number, Node[]>;
  /** Outermost attribute chains by the offset where the chain starts. */
  attributesByHead: Map<number, Node>;
  /** Identifiers by their start offset, for a name imported by `from module import name`. */
  identifiersByStart: Map<number, Node>;
}

function indexFile(root: Node): FileIndex {
  const callsByCallee = new Map<number, Node[]>();
  const callsByMethod = new Map<number, Node[]>();
  const add = (map: Map<number, Node[]>, key: number, call: Node): void => {
    const list = map.get(key) ?? [];
    list.push(call);
    map.set(key, list);
  };
  for (const call of root.descendantsOfType("call")) {
    if (!call) continue;
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    add(callsByCallee, chainOf(callee)?.head.startIndex ?? callee.startIndex, call);
    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute");
      if (method) add(callsByMethod, method.startIndex, call);
    }
  }
  const attributesByHead = new Map<number, Node>();
  for (const node of root.descendantsOfType("attribute")) {
    if (!node) continue;
    const chain = chainOf(node);
    if (!chain) continue;
    const current = attributesByHead.get(chain.head.startIndex);
    if (current === undefined || node.endIndex > current.endIndex) attributesByHead.set(chain.head.startIndex, node);
  }
  const identifiersByStart = new Map<number, Node>();
  for (const node of root.descendantsOfType("identifier")) {
    if (node) identifiersByStart.set(node.startIndex, node);
  }
  return { callsByCallee, callsByMethod, attributesByHead, identifiersByStart };
}

function rewriteFor(
  target: Target,
  index: FileIndex,
  root: Node,
  source: string,
): { edits: Edit[] } | { reason: string } {
  const { usage } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  if (target.alias !== undefined) return rewriteAlias(target.alias, index, offset);
  return rewriteModuleRename(required(target.rename, "the module rename"), index, root, offset);
}

function rewriteAlias(alias: Alias, index: FileIndex, offset: number): { edits: Edit[] } | { reason: string } {
  const candidates = index.callsByMethod.get(offset);
  if (candidates === undefined) return { reason: `No \`${alias.from}()\` method call is at the reported location.` };
  for (const call of candidates) {
    const callee = call.childForFieldName("function");
    if (callee?.type !== "attribute") continue;
    const method = callee.childForFieldName("attribute");
    if (method?.text !== alias.from) continue;
    if (alias.to === undefined) {
      return { reason: `\`${alias.from}()\` has no replacement in Python 3.12; rewrite the assertion by hand.` };
    }
    return { edits: [{ start: method.startIndex, end: method.endIndex, replacement: alias.to }] };
  }
  return { reason: `No \`${alias.from}()\` method call is at the reported location.` };
}

function rewriteModuleRename(
  rename: ModuleRename,
  index: FileIndex,
  root: Node,
  offset: number,
): { edits: Edit[] } | { reason: string } {
  const call = index.callsByCallee.get(offset)?.[0];
  if (call !== undefined) {
    const callee = unwrap(call.childForFieldName("function"));
    if (callee === undefined)
      return {
        reason: `The call at the reported location is not a direct \`${rename.module}.${rename.from}\` access.`,
      };
    if (callee.type === "attribute") {
      const method = callee.childForFieldName("attribute");
      if (method?.text !== rename.from) {
        return {
          reason: `The call at the reported location is not a direct \`${rename.module}.${rename.from}\` access.`,
        };
      }
      return { edits: [{ start: method.startIndex, end: method.endIndex, replacement: rename.to }] };
    }
    if (callee.type === "identifier") return rewriteImportedName(rename, root, callee);
    return { reason: `The call at the reported location is not a direct \`${rename.module}.${rename.from}\` access.` };
  }

  const attribute = index.attributesByHead.get(offset);
  if (attribute !== undefined) {
    const method = attribute.childForFieldName("attribute");
    if (method?.text !== rename.from) {
      return {
        reason: `The usage at the reported location is not a direct \`${rename.module}.${rename.from}\` access.`,
      };
    }
    return { edits: [{ start: method.startIndex, end: method.endIndex, replacement: rename.to }] };
  }

  const identifier = index.identifiersByStart.get(offset);
  if (identifier !== undefined) return rewriteImportedName(rename, root, identifier);
  return { reason: `The usage at the reported location is not a direct \`${rename.module}.${rename.from}\` access.` };
}

/**
 * A name imported by `from module import name` is renamed at the use and at the import statement, so the binding still
 * exists. A name the file bound another way, such as `name = module.name` or `from module import name as short`, is
 * refused: renaming the use alone would leave the local binding pointing at the removed name.
 */
function rewriteImportedName(
  rename: ModuleRename,
  root: Node,
  identifier: Node,
): { edits: Edit[] } | { reason: string } {
  if (identifier.text !== rename.from) {
    return {
      reason: `The name is used through the local binding \`${identifier.text}\`, not a direct \`${rename.module}.${rename.from}\` name.`,
    };
  }
  const imports = directImportsFor(root, rename);
  if (imports.length === 0) {
    return {
      reason: `\`${rename.from}\` is not bound by a direct \`from ${rename.module} import ${rename.from}\` statement, so the codemod cannot rename it exactly.`,
    };
  }
  return {
    edits: [{ start: identifier.startIndex, end: identifier.endIndex, replacement: rename.to }, ...imports],
  };
}

/** The imported-name nodes of every `from module import name` statement that binds the removed name. */
function directImportsFor(root: Node, rename: ModuleRename): Edit[] {
  const edits: Edit[] = [];
  for (const statement of root.descendantsOfType("import_from_statement")) {
    if (!statement) continue;
    const module = statement.childForFieldName("module_name");
    if (module?.text !== rename.module) continue;
    for (const child of statement.namedChildren) {
      if (!child || child.id === module.id) continue;
      if (child.type === "dotted_name" && child.text === rename.from) {
        edits.push({ start: child.startIndex, end: child.endIndex, replacement: rename.to });
      } else if (child.type === "aliased_import") {
        const aliased = child.childForFieldName("name");
        if (aliased?.text === rename.from)
          edits.push({ start: aliased.startIndex, end: aliased.endIndex, replacement: rename.to });
      }
    }
  }
  return edits;
}

/**
 * Every alias-named method call in a file that imports unittest but is not inside a TestCase subclass is refused with
 * a finding of its own, because the usage analysis only reports the shape it is asked for.
 */
function refuseAliasesOutsideTestcase(
  path: string,
  root: Node,
  source: string,
  testcase: ReadonlySet<number>,
  refuse: Refuse | undefined,
): void {
  if (refuse === undefined) return;
  const lines = source.split(/\r?\n/);
  const bindings = unittestBindings(root);
  for (const node of root.descendantsOfType("call")) {
    if (!node) continue;
    const callee = node.childForFieldName("function");
    if (!callee) continue;
    const alias = aliasNamed(callee, bindings);
    if (alias === undefined) continue;
    if (insideTestcase(callee, testcase)) continue;
    const name = callee.type === "attribute" ? callee.childForFieldName("attribute") : callee;
    if (!name) continue;
    const { line, column } = locate(source, name.startIndex);
    const usage: SourceUsage = {
      kind: "symbol",
      language: "python",
      symbol: `unittest.${alias.from}`,
      location: { path, line, column },
      excerpt: (lines[line - 1] ?? "").trim(),
    };
    refuse(
      syntheticFinding({ id: aliasRuleId, title: aliasRuleTitle, severity: "high" }, usage, true),
      `The \`${alias.from}()\` call is not inside a class that subclasses unittest.TestCase, so it is not one of the removed TestCase aliases.`,
    );
  }
}

interface UnittestBindings {
  /** Local names bound to the unittest module itself, such as `unittest` or an alias of it. */
  modules: Set<string>;
  /** Local names bound to a name imported from unittest, mapped to the imported name. */
  names: Map<string, string>;
  /** The file imports every unittest name with `from unittest import *`. */
  star: boolean;
}

function unittestBindings(root: Node): UnittestBindings {
  const bindings: UnittestBindings = { modules: new Set(), names: new Map(), star: false };
  for (const statement of root.descendantsOfType("import_statement")) {
    if (statement) bindModuleImport(statement, bindings);
  }
  for (const statement of root.descendantsOfType("import_from_statement")) {
    if (statement) bindNameImport(statement, bindings);
  }
  return bindings;
}

/** Reads `import unittest` and `import unittest as u`, which bind the module under a local name. */
function bindModuleImport(statement: Node, bindings: UnittestBindings): void {
  for (const child of statement.namedChildren) {
    if (!child) continue;
    if (child.type === "dotted_name" && moduleMatches(child.text, "unittest")) {
      bindings.modules.add(child.text.split(".", 1).join());
    }
    if (child.type === "aliased_import") {
      const name = child.childForFieldName("name");
      const alias = child.childForFieldName("alias");
      if (name && alias && moduleMatches(name.text, "unittest")) bindings.modules.add(alias.text);
    }
  }
}

/** Reads `from unittest import ...`, which binds each imported name, or every name for a star import. */
function bindNameImport(statement: Node, bindings: UnittestBindings): void {
  const module = statement.childForFieldName("module_name");
  if (!module || !moduleMatches(module.text, "unittest")) return;
  for (const child of statement.namedChildren) {
    if (!child || child.id === module.id) continue;
    bindImportedName(child, bindings);
  }
}

/** One name in `from unittest import ...`: a star, a plain name, or an alias mapped to the imported name. */
function bindImportedName(child: Node, bindings: UnittestBindings): void {
  if (child.type === "wildcard_import") {
    bindings.star = true;
  } else if (child.type === "dotted_name") {
    bindings.names.set(child.text, child.text);
  } else if (child.type === "aliased_import") {
    const name = child.childForFieldName("name")?.text;
    const alias = child.childForFieldName("alias")?.text;
    if (name !== undefined && alias !== undefined) bindings.names.set(alias, name);
  }
}

/** The removed alias a call goes through, when the file's unittest bindings explain the name. */
function aliasNamed(callee: Node, bindings: UnittestBindings): Alias | undefined {
  if (callee.type === "attribute") {
    // The alias shape is a method call on any receiver, so the receiver name is not checked here.
    const method = callee.childForFieldName("attribute");
    if (!method) return undefined;
    return aliases.find((candidate) => candidate.from === method.text);
  }
  if (callee.type !== "identifier") return undefined;
  const imported = bindings.names.get(callee.text);
  if (imported !== undefined) return aliases.find((candidate) => candidate.from === imported);
  return bindings.star ? aliases.find((candidate) => candidate.from === callee.text) : undefined;
}

/** The ids of the class definitions whose direct bases include unittest.TestCase, TestCase, or an alias of it. */
function testcaseClassIds(root: Node): Set<number> {
  const bindings = unittestBindings(root);
  const ids = new Set<number>();
  for (const node of root.descendantsOfType("class_definition")) {
    if (!node) continue;
    const superclasses = node.childForFieldName("superclasses");
    if (!superclasses) continue;
    if (superclasses.namedChildren.some((base) => base !== null && isTestcaseBase(base, bindings))) ids.add(node.id);
  }
  return ids;
}

function isTestcaseBase(node: Node, bindings: UnittestBindings): boolean {
  if (node.type === "identifier") {
    return bindings.names.get(node.text) === "TestCase" || (bindings.star && node.text === "TestCase");
  }
  if (node.type !== "attribute") return false;
  const chain = chainOf(node);
  if (chain === undefined || chain.path.at(-1) !== "TestCase") return false;
  return bindings.modules.has(required(chain.path[0], "the chain head"));
}

function insideTestcase(node: Node, testcase: ReadonlySet<number>): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (current.type === "class_definition") return testcase.has(current.id);
  }
  return false;
}

/** `a`, `a.b.c`, and `(a).b` as a head identifier plus attribute names. */
function chainOf(node: Node): { head: Node; path: string[] } | undefined {
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

function unwrap(node: Node | null): Node | undefined {
  let current = node ?? undefined;
  while (current?.type === "parenthesized_expression") current = current.namedChild(0) ?? undefined;
  return current;
}

function moduleMatches(actual: string, expected: string): boolean {
  return actual === expected || actual.startsWith(`${expected}.`);
}

function dedupe(edits: readonly Edit[]): Edit[] {
  const seen = new Set<string>();
  return edits.filter((edit) => {
    const key = `${edit.start}:${edit.end}:${edit.replacement}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
