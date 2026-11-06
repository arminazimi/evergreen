import type { ScanResult, Severity, SourceUsage, UsageMatcher } from "../../domain.js";
import { parseSource } from "../../usage/tree-sitter.js";
import type { Node } from "../../usage/vendor/tree-sitter/tree-sitter.js";
import type { FilePatch, Fixer, Refuse } from "../types.js";
import { callsByCallee } from "./shared/ast.js";
import { type Edit, patchFor } from "./shared/edits.js";
import { normalizeModule, optionalCall, requiredModule, unquote } from "./shared/javascript.js";
import { declineAll, groupByPath, planEachFile, sortTargets } from "./shared/plan.js";
import { locate, offsetOf, readParseableFile } from "./shared/source.js";
import { analyzeTargets, syntheticFinding, type UsageTarget } from "./shared/targets.js";

interface Rename {
  id: string;
  /** The module that exports the symbol, as it is imported. */
  module: string;
  /** The deprecated name. */
  from: string;
  /** The current name. */
  to: string;
  title: string;
  severity: Severity;
  matchers: UsageMatcher[];
}

/** Node.js source is JavaScript or TypeScript, so every rename needs one call matcher per language. */
function callMatchers(module: string, symbol: string): UsageMatcher[] {
  return [
    { kind: "symbol", language: "javascript", module, symbol, shape: "call" },
    { kind: "symbol", language: "typescript", module, symbol, shape: "call" },
  ];
}

/**
 * The Node.js deprecations that are exact renames of a current API, proven from the Node.js source. Candidates that
 * merely look like renames are not here: `os.getNetworkInterfaces()` returns the native flat array while
 * `os.networkInterfaces()` builds the keyed object, and `module.createRequire()` validates its argument and decodes
 * non-absolute strings as file URLs while `module.createRequireFromPath()` accepts any path.
 *
 * `crypto.Hash` and `crypto.Hmac` are constructors that also accept a call without `new` and delegate to the
 * constructor, which is the same call `crypto.createHash()` and `crypto.createHmac()` make; only that call form is a
 * rename, so the `new` form is refused.
 */
const renames: readonly Rename[] = [
  {
    id: "nodejs.symbol.os.tmpdir",
    module: "os",
    from: "tmpDir",
    to: "tmpdir",
    title: "Os.tmpDir has been removed",
    severity: "high",
    matchers: callMatchers("os", "tmpDir"),
  },
  {
    id: "nodejs.symbol.path.makelong",
    module: "path",
    from: "_makeLong",
    to: "toNamespacedPath",
    title: "Path._makeLong is deprecated",
    severity: "low",
    matchers: callMatchers("path", "_makeLong"),
  },
  {
    id: "nodejs.symbol.async-hooks.currentid",
    module: "async_hooks",
    from: "currentId",
    to: "executionAsyncId",
    title: "Async_hooks.currentId has been removed",
    severity: "high",
    matchers: callMatchers("async_hooks", "currentId"),
  },
  {
    id: "nodejs.symbol.async-hooks.triggerid",
    module: "async_hooks",
    from: "triggerId",
    to: "triggerAsyncId",
    title: "Async_hooks.triggerId has been removed",
    severity: "high",
    matchers: callMatchers("async_hooks", "triggerId"),
  },
  {
    id: "nodejs.symbol.crypto.hash",
    module: "crypto",
    from: "Hash",
    to: "createHash",
    title: "The crypto.Hash constructor is deprecated",
    severity: "medium",
    matchers: callMatchers("crypto", "Hash"),
  },
  {
    id: "nodejs.symbol.crypto.hmac",
    module: "crypto",
    from: "Hmac",
    to: "createHmac",
    title: "The crypto.Hmac constructor is deprecated",
    severity: "medium",
    matchers: callMatchers("crypto", "Hmac"),
  },
];

const modules: readonly string[] = [...new Set(renames.map((rename) => rename.module))];

type Target = UsageTarget<Rename>;

/**
 * Rewrites the exact Node.js API renames in a call's member name: `os.tmpDir()` to `os.tmpdir()`, and the same for
 * `path._makeLong`, `async_hooks.currentId`/`triggerId`, and `crypto.Hash`/`Hmac` called without `new`. The receiver
 * expression and arguments are kept byte-for-byte. A call through a local binding, an optional call, a computed
 * member access, or a constructor call is refused with a reason.
 */
export const nodeRenamesFixer: Fixer = {
  id: "node-renames",
  async plan(result, refuse) {
    const { targets, importPaths } = await targetsFor(result);
    const byPath = groupByPath(targets);
    for (const path of importPaths) if (!byPath.has(path)) byPath.set(path, []);
    return planEachFile(byPath, (path, fileTargets) =>
      planPath(result.root, path, fileTargets, importPaths.has(path), refuse),
    );
  },
};

async function planPath(
  repositoryRoot: string,
  path: string,
  fileTargets: readonly Target[],
  hasImportPath: boolean,
  refuse: Refuse | undefined,
): Promise<FilePatch | undefined> {
  const source = await readParseableFile(repositoryRoot, path, languageFor(path, fileTargets));
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
    const patch = patchFor(path, source.text, editsFor(fileTargets, tree.rootNode, source.text, refuse));
    if (hasImportPath) refuseComputedAccess(path, tree.rootNode, source.text, refuse);
    return patch;
  } finally {
    tree.delete();
  }
}

function editsFor(fileTargets: readonly Target[], root: Node, source: string, refuse: Refuse | undefined): Edit[] {
  const calls = callsByCallee(root, ["call_expression", "new_expression"]);
  const edits: Edit[] = [];
  for (const target of sortTargets(fileTargets, (candidate) => candidate.rule.id)) {
    const rewrite = rewriteFor(target, calls, source);
    if ("reason" in rewrite) refuse?.(target.finding, rewrite.reason);
    else edits.push(rewrite);
  }
  return edits;
}

function languageFor(path: string, targets: readonly Target[]): "javascript" | "typescript" {
  const target = targets[0];
  if (target !== undefined) return target.usage.language === "typescript" ? "typescript" : "javascript";
  return /\.(?:ts|tsx|mts|cts)$/i.test(path) ? "typescript" : "javascript";
}

/**
 * Symbol-only rules have no package declaration a detector can report, so a scan carries no finding for them. The
 * fixer falls back to the same parser-backed usage analysis the detectors use, over the rules it covers. The same
 * analysis finds the files that import the modules, so a computed member access can be refused even though the
 * analysis cannot report it as a usage.
 */
async function targetsFor(result: ScanResult): Promise<{ targets: Target[]; importPaths: Set<string> }> {
  const { targets, contracts } = await analyzeTargets(result, renames, {
    contractId: (rename) => `symbol:${rename.id}`,
    matchers: (rename) => rename.matchers,
    finding: (rename, usage) => syntheticFinding(rename, usage, true),
    extraContracts: modules.map((module) => ({
      id: `import:${module}`,
      matchers: [
        { kind: "import", language: "javascript", module },
        { kind: "import", language: "typescript", module },
        { kind: "import", language: "javascript", module: `node:${module}` },
        { kind: "import", language: "typescript", module: `node:${module}` },
      ] as UsageMatcher[],
    })),
  });
  const importPaths = new Set(
    modules.flatMap((module) => (contracts.get(`import:${module}`) ?? []).map((usage) => usage.location.path)),
  );
  return { targets, importPaths };
}

function rewriteFor(target: Target, calls: Map<number, Node[]>, source: string): Edit | { reason: string } {
  const { usage, rule: rename } = target;
  if (usage.location.line === undefined || usage.location.column === undefined) {
    return { reason: "The usage has no line and column to rewrite." };
  }
  const offset = offsetOf(source, usage.location.line, usage.location.column);
  if (offset === -1) return { reason: "The reported line and column are not in the source file." };
  const candidates = calls.get(offset);
  if (candidates === undefined) {
    return { reason: `No \`${rename.module}.${rename.from}\` call is at the reported location.` };
  }

  for (const call of candidates) {
    if (call.type === "new_expression") {
      return { reason: `The usage constructs \`${rename.module}.${rename.from}\`; only a direct call is renamed.` };
    }
    const callee = call.childForFieldName("function");
    if (!callee) continue;
    if (optionalCall(call, callee, source)) {
      return { reason: "The call is optional (`?.`), so renaming the member would change when it runs." };
    }
    if (callee.type === "member_expression") {
      const property = callee.childForFieldName("property");
      if (property?.type !== "property_identifier" || property.text !== rename.from) continue;
      return { start: property.startIndex, end: property.endIndex, replacement: rename.to };
    }
    if (callee.type === "identifier") {
      return {
        reason: `The call goes through the local binding \`${callee.text}\`, not a member access; renaming only the call would leave the import or alias unchanged.`,
      };
    }
    return {
      reason: `The call at the reported location is not a direct member access to \`${rename.module}.${rename.from}\`.`,
    };
  }
  return {
    reason: `The call at the reported location is not a direct member access to \`${rename.module}.${rename.from}\`.`,
  };
}

/**
 * A computed member access, such as `os["tmpDir"]()`, is not a usage the analysis can report, so it is found here in
 * the files that import the module and refused with the reason the rewrite is not exact.
 */
function refuseComputedAccess(path: string, root: Node, source: string, refuse: Refuse | undefined): void {
  const bindings = moduleBindings(root);
  if (bindings.size === 0) return;
  const lines = source.split(/\r?\n/);
  for (const node of root.descendantsOfType("subscript_expression")) {
    if (!node) continue;
    const call = node.parent;
    if (call?.type !== "call_expression" || call.childForFieldName("function")?.id !== node.id) continue;
    const object = node.childForFieldName("object");
    const index = node.childForFieldName("index");
    if (!object || index?.type !== "string") continue;
    const module = moduleOf(object, bindings);
    if (module === undefined) continue;
    const rename = renames.find((candidate) => candidate.module === module && candidate.from === unquote(index.text));
    if (!rename) continue;
    const { line, column } = locate(source, object.startIndex);
    const usage: SourceUsage = {
      kind: "symbol",
      language: languageFor(path, []),
      symbol: `${rename.module}.${rename.from}`,
      location: { path, line, column },
      excerpt: (lines[line - 1] ?? "").trim(),
    };
    refuse?.(
      syntheticFinding(rename, usage, true),
      "The member is accessed with a computed key, so renaming only the member name is not exact.",
    );
  }
}

/** The local names a file binds to one of the modules, from `import`, `import * as`, and `require`. */
function moduleBindings(root: Node): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const statement of root.descendantsOfType("import_statement")) {
    if (!statement) continue;
    const source =
      statement.childForFieldName("source") ?? statement.namedChildren.find((child) => child?.type === "string");
    const clause = statement.namedChildren.find((child) => child?.type === "import_clause");
    if (!source || !clause) continue;
    const module = normalizeModule(unquote(source.text));
    for (const child of clause.namedChildren) {
      if (!child) continue;
      if (child.type === "identifier") bindings.set(child.text, module);
      else if (child.type === "namespace_import") {
        const local = child.namedChildren.find((candidate) => candidate?.type === "identifier");
        if (local) bindings.set(local.text, module);
      }
    }
  }
  for (const declarator of root.descendantsOfType("variable_declarator")) {
    if (!declarator) continue;
    const name = declarator.childForFieldName("name");
    if (name?.type !== "identifier") continue;
    const module = requiredModule(declarator.childForFieldName("value"));
    if (module !== undefined) bindings.set(name.text, module);
  }
  return bindings;
}

/** The module an expression reads from: a bound name, an inline `require`, or one wrapped in type syntax. */
function moduleOf(node: Node, bindings: Map<string, string>): string | undefined {
  if (node.type === "identifier") return bindings.get(node.text);
  if (
    ["parenthesized_expression", "non_null_expression", "as_expression", "satisfies_expression"].includes(node.type)
  ) {
    const inner = node.namedChildren[0];
    return inner ? moduleOf(inner, bindings) : undefined;
  }
  return requiredModule(node);
}
