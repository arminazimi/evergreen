import type { CallUsageMatcher, SourceLanguage } from "../domain.js";
import { cachedPattern, EVERY_LINE, type FileScan, PHP_HITS, pushCallHits, RUBY_HITS } from "./file-scan.js";
import type { Binding } from "./imports.js";
import { moduleMatches } from "./module-matches.js";
import { escapePattern } from "./patterns.js";
import { phpCallForms, phpCallPattern } from "./php.js";
import { rubyReceivers } from "./ruby.js";

/** The first `::`-separated segment of a Rust path. */
function rustHead(target: string): string {
  return target.split("::")[0] ?? "";
}

const RUST_SEPARATOR = "\\s*::\\s*";
const DOT_SEPARATOR = "\\s*\\.\\s*";

/** A qualified name as a pattern that tolerates whitespace around each dot. */
function dottedPattern(value: string): string {
  return value.split(".").map(escapePattern).join("\\s*\\.\\s*");
}

/** A Rust path as a pattern that tolerates whitespace around each `::`. */
function rustPathPattern(value: string): string {
  return value.split("::").map(escapePattern).join(RUST_SEPARATOR);
}

/**
 * A Swift call counts only when it stays module-qualified or uses a `typealias` whose target is inside that
 * module; an unqualified imported name is ambiguous. Longest form first, so a prefix cannot shadow it.
 */
function matchSwiftCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  for (const target of matcher.targets) {
    const qualified = `${matcher.module}.${target}`;
    const forms = [qualified];
    for (const alias of scan.swiftAliases) {
      if (qualified === alias.target) forms.push(alias.local);
      else if (qualified.startsWith(`${alias.target}.`))
        forms.push(`${alias.local}${qualified.slice(alias.target.length)}`);
    }
    const alternatives = [...new Set(forms)].sort((left, right) => right.length - left.length).map(dottedPattern);
    pushCallHits(
      scan,
      contractId,
      qualified,
      new RegExp(`(?<![\\w$.])(?:${alternatives.join("|")})\\s*\\(`, "g"),
      EVERY_LINE,
    );
  }
}

/** In Rust a crate is always in scope by name, so `crate::function(…)` needs no `use`, and a macro ends in `!`. */
function matchRustQualifiedCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  for (const target of matcher.targets) {
    const full = rustPathPattern(`${matcher.module}::${target}`);
    pushCallHits(
      scan,
      contractId,
      `${matcher.module}.${target}`,
      new RegExp(`(?<![\\w$:])${full}\\s*(?:!\\s*[(\\[{]|\\()`, "g"),
      EVERY_LINE,
    );
  }
}

/** In C# a type is reached by its full name, or by its simple name once `using` brings in its namespace. */
function matchCsharpCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  // `using N;` brings in the types of N itself, not those of its sub-namespaces.
  const imported = scan.imports.some((candidate) => candidate.module === matcher.module);
  for (const target of matcher.targets) {
    const forms = [dottedPattern(`${matcher.module}.${target}`), ...(imported ? [dottedPattern(target)] : [])];
    for (const source of forms) {
      pushCallHits(
        scan,
        contractId,
        `${matcher.module}.${target}`,
        new RegExp(`(?<![\\w$.])${source}\\s*\\(`, "g"),
        EVERY_LINE,
      );
    }
  }
}

/** A PHP call target is `Class::method(` or `new Class`; `use Foo as Alias` makes `Alias::method(` the same call. */
function matchPhpCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  for (const target of matcher.targets) {
    const forms = phpCallForms(target, scan.phpAliases);
    if (forms.length === 0) continue;
    const formKey = forms.map((form) => `${form.kind}\0${form.receiver}\0${form.method ?? ""}`).join("\n");
    const pattern = cachedPattern(scan.phpReceiverPatterns, formKey, () => phpCallPattern(forms));
    pushCallHits(scan, contractId, `${matcher.module}.${target}`, pattern, PHP_HITS);
  }
}

/** A Ruby call is qualified (`JSON.parse(` or `JSON::parse(`); `Parser = JSON` then `Parser.parse(` is the same call. */
function matchRubyCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  // One combined regex per target, not one per alias form, so a large alias table cannot multiply the scans.
  for (const target of matcher.targets) {
    const forms = rubyReceivers(target, scan.rubyAliases);
    if (forms.length === 0) continue;
    const formKey = forms.map((parts) => parts.join("\0")).join("\n");
    const pattern = cachedPattern(scan.rubyReceiverPatterns, formKey, () => {
      const alternation = forms
        .map((parts) => parts.map((part) => escapePattern(part)).join("\\s*(?:\\.|::)\\s*"))
        .join("|");
      return new RegExp(`(?<![\\w$:])(?:::)?(?:${alternation})\\s*\\(`, "g");
    });
    pushCallHits(scan, contractId, `${matcher.module}.${target}`, pattern, RUBY_HITS);
  }
}

/** A call reader for one language: every call site of the matcher's module and targets in the file. */
type CallReader = (scan: FileScan, contractId: string, matcher: CallUsageMatcher) => void;

/** The languages that name a qualified call their own way; every other language is read through its bindings. */
const QUALIFIED_CALL_READERS: Partial<Record<SourceLanguage, CallReader>> = {
  swift: matchSwiftCalls,
  rust: matchRustQualifiedCalls,
  csharp: matchCsharpCalls,
  php: matchPhpCalls,
  ruby: matchRubyCalls,
};

/**
 * The expression that calls `target` through `binding`: the name it imported, or a member of the namespace
 * or module it stands for. Undefined when the binding cannot reach that target.
 */
function callableExpression(binding: Binding, target: string, language: SourceLanguage): string | undefined {
  const rust = language === "rust";
  const local = escapePattern(binding.local);
  if (target === "default") return binding.imported === "default" || binding.imported === "*" ? local : undefined;
  if (binding.imported === target) return local;
  if (rust && target.includes("::") && binding.imported === rustHead(target)) {
    return `${local}${RUST_SEPARATOR}${rustPathPattern(target.split("::").slice(1).join("::"))}`;
  }
  if (binding.imported === "*" || binding.imported === "default") {
    const reached = rust ? rustPathPattern(target) : escapePattern(target);
    return `${local}${rust ? RUST_SEPARATOR : DOT_SEPARATOR}${reached}`;
  }
  return undefined;
}

/** A call pattern for `callable`; a Rust macro is called with a bang, so `format_err!(…)` counts too. */
function callPattern(callable: string, language: SourceLanguage): RegExp {
  const rust = language === "rust";
  return new RegExp(`(?<![\\w$${rust ? ":" : ""}])${callable}${rust ? "\\s*(?:!\\s*[(\\[{]|\\()" : "\\s*\\("}`, "g");
}

/** A call through a name the file imported: `import legacy from "request"; legacy(url)`. */
function matchBindingCalls(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  // Swift names are resolved by `matchSwiftCalls`, which stays module-qualified; an imported name is ambiguous.
  if (scan.language === "swift") return;
  for (const binding of scan.bindings) {
    if (!moduleMatches(binding.module, matcher.module, scan.language)) continue;
    for (const target of matcher.targets) {
      const callable = callableExpression(binding, target, scan.language);
      if (callable === undefined) continue;
      const symbol = target === "default" ? matcher.module : `${matcher.module}.${target}`;
      pushCallHits(scan, contractId, symbol, callPattern(callable, scan.language), EVERY_LINE);
    }
  }
}

/** Every call site of a `call` matcher: the language's own qualified form, plus the names it imported. */
export function matchCallUsage(scan: FileScan, contractId: string, matcher: CallUsageMatcher): void {
  const qualified = QUALIFIED_CALL_READERS[scan.language];
  if (qualified !== undefined) qualified(scan, contractId, matcher);
  matchBindingCalls(scan, contractId, matcher);
}
