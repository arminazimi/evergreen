import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { SourceLanguage, SourceUsage, SourceUsageAnalysis, SourceUsageContract } from "./domain.js";
import { sourceFiles } from "./source-files.js";
import { noteCappedUsage } from "./usage/binding-budget.js";
import { checkoutSourceIgnored } from "./usage/checkout.js";
import { configKeyMatch } from "./usage/config-keys.js";
import { dartImports } from "./usage/dart.js";
import { impactFor } from "./usage/impact.js";
import { type Binding, csharpImports, goImports, type ImportReference, javascriptBindings, jvmImports, pythonImports, swiftAliases, swiftImports } from "./usage/imports.js";
import { csharpVerbatimEnd, type MaskState, rubyPercentClose, rubyPercentOpen, rubyRegexEnd, rubyRegexMayStart } from "./usage/masking.js";
import { moduleMatches } from "./usage/module-matches.js";
import { parsedUsages } from "./usage/parsers.js";
import { escapePattern } from "./usage/patterns.js";
import { PHP_MAX_LINE, phpCallForms, phpCallPattern, phpImportsFromRequires, phpUses } from "./usage/php.js";
import { rubyAliases, rubyReceivers } from "./usage/ruby.js";
import { rustImports } from "./usage/rust.js";

/** The string at `index`, or the empty string when the array is shorter. */
function textAt(values: readonly string[], index: number): string {
  return values[index] ?? "";
}

/** The map value at `key`; every key here comes from the contract list, so a miss is a bug. */
function requiredAt<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`missing source-usage entry for ${String(key)}`);
  return value;
}

/** The first `::`-separated segment of a Rust path. */
function rustHead(target: string): string {
  return target.split("::")[0] ?? "";
}

function javascriptImports(line: string, lineNumber: number): ImportReference[] {
  const references: ImportReference[] = [];
  const fromPattern = /\bimport\s+(.+?)\s+from\s+["']([^"']+)["']/g;
  for (const match of line.matchAll(fromPattern)) {
    if (!match[1] || !match[2] || match.index === undefined) continue;
    const moduleColumn = line.indexOf(match[2], match.index) + 1;
    references.push({
      module: match[2],
      line: lineNumber,
      column: moduleColumn,
      bindings: javascriptBindings(match[1], match[2]),
    });
  }

  const sideEffectPattern = /\bimport\s+["']([^"']+)["']/g;
  for (const match of line.matchAll(sideEffectPattern)) {
    if (!match[1] || match.index === undefined) continue;
    references.push({
      module: match[1],
      line: lineNumber,
      column: line.indexOf(match[1], match.index) + 1,
      bindings: [],
    });
  }

  const requirePattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of line.matchAll(requirePattern)) {
    if (!match[1] || !match[2] || match.index === undefined) continue;
    references.push({
      module: match[2],
      line: lineNumber,
      column: line.indexOf(match[2], match.index) + 1,
      bindings: [{ module: match[2], local: match[1], imported: "*" }],
    });
  }

  const destructuredPattern = /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of line.matchAll(destructuredPattern)) {
    if (!match[1] || !match[2] || match.index === undefined) continue;
    const bindings = match[1].split(",").flatMap((entry): Binding[] => {
      const binding = /^\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
      return binding?.[1] ? [{ module: match[2] ?? "", imported: binding[1], local: binding[2] ?? binding[1] }] : [];
    });
    references.push({
      module: match[2],
      line: lineNumber,
      column: line.indexOf(match[2], match.index) + 1,
      bindings,
    });
  }

  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of line.matchAll(dynamicPattern)) {
    if (!match[1] || match.index === undefined) continue;
    references.push({
      module: match[1],
      line: lineNumber,
      column: line.indexOf(match[1], match.index) + 1,
      bindings: [],
    });
  }
  return references;
}

interface RubyLiteral {
  value: string;
  end: number;
  column: number;
  interpolated: boolean;
}

/** A single-line string literal starting at `start`, or undefined when the text is not a quoted or percent string. */
function readRubyLiteral(line: string, start: number): RubyLiteral | undefined {
  const quoted = line[start];
  if (quoted === "'" || quoted === '"') {
    let value = "";
    let escaped = false;
    for (let index = start + 1; index < line.length; index += 1) {
      const character = line.charAt(index);
      if (escaped) {
        value += character;
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (quoted === '"' && character === "#" && line[index + 1] === "{") {
        return { value, end: line.length, column: start + 2, interpolated: true };
      }
      if (character === quoted) return { value, end: index + 1, column: start + 2, interpolated: false };
      value += character;
    }
    return undefined;
  }
  if (quoted !== "%") return undefined;
  let cursor = start + 1;
  const marker = line[cursor];
  let type = "";
  if (marker && /[qQwWrsxiI]/.test(marker)) {
    type = marker;
    cursor += 1;
  }
  const delimiter = line[cursor];
  if (!delimiter) return undefined;
  const closer = delimiter === "(" ? ")" : delimiter === "[" ? "]" : delimiter === "{" ? "}" : delimiter === "<" ? ">" : /[^A-Za-z0-9_\s]/.test(delimiter) ? delimiter : undefined;
  if (!closer || (type !== "" && type !== "q" && type !== "Q" && type !== "s")) return undefined;
  const interpolating = type === "" || type === "Q";
  const paired = closer !== delimiter;
  let depth = 1;
  let value = "";
  for (let index = cursor + 1; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === "\\" && index + 1 < line.length) {
      value += line[index + 1];
      index += 1;
      continue;
    }
    if (interpolating && character === "#" && line[index + 1] === "{") {
      return { value, end: line.length, column: cursor + 2, interpolated: true };
    }
    if (paired && character === delimiter) {
      depth += 1;
      value += character;
      continue;
    }
    if (character === closer) {
      depth -= 1;
      if (depth === 0) return { value, end: index + 1, column: cursor + 2, interpolated: false };
    }
    value += character;
  }
  return undefined;
}

interface RubyInvocation {
  kind: "require" | "load" | "gem" | "autoload" | "require_relative";
  line: number;
  keywordColumn: number;
  reference: string;
  argument: { kind: "literal"; value: string; column: number } | { kind: "dynamic" };
}

const RUBY_MAX_LINE = 4096;
const RUBY_MAX_INVOCATIONS = 10_000;
const RUBY_MAX_REFERENCE = 200;
const RUBY_DEF_LOOKBEHIND = 32;

/**
 * True when the keyword at `index` is a real call site, not a hash key, method receiver, or bare assignment.
 * Argument-start checks use the original `line` because string literals are blanked in `masked`.
 */
function rubyKeywordIsCall(line: string, masked: string, index: number, keywordLength: number): boolean {
  const before = index > 0 ? masked[index - 1] : "";
  if (before === ":" || before === "@" || before === "$") return false;
  let cursor = index + keywordLength;
  const hadSpace = line[cursor] === " " || line[cursor] === "\t";
  while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
  const next = line[cursor];
  // Hash key `load:` has no space before `:`; `autoload :Foo` has whitespace then a symbol.
  if (next === ":") return hadSpace;
  if (next === undefined || next === "." || next === "," || next === "}" || next === ")" || next === ";") return false;
  // Assignment (`gem = …`), but not `==`.
  if (next === "=" && line[cursor + 1] !== "=") return false;
  if (next === "(") return true;
  return next === "'" || next === '"' || next === "%" || next === "/" || /[A-Za-z_$@]/.test(next);
}

/** True when `def` appears immediately before the match within a short look-behind window. */
function rubyKeywordIsMethodDefinition(masked: string, index: number): boolean {
  const start = Math.max(0, index - RUBY_DEF_LOOKBEHIND);
  const window = masked.slice(start, index);
  return /(?:^|\s)def\s+(?:self\s*\.\s*|(?:::)?Kernel\s*\.\s*)?$/.test(window);
}

interface RubyScanSkip {
  line: number;
  column: number;
  reference: string;
  reason: string;
}

interface RubyInvocationScan {
  invocations: RubyInvocation[];
  skips: RubyScanSkip[];
}

const RUBY_INVOCATION_HINT = /(?:^|[^\w.:])(?:(?:::)?Kernel\s*\.\s*)?(?:require_relative|require|load|gem|autoload)\b/;

/**
 * `require`, `load`, `gem`, `autoload`, and `require_relative` on one line. A string literal is a path; a
 * variable, interpolation, concatenation, or method call on the string is dynamic. `JSON.load` and
 * `require_relative` are not `load` or `require`. Lines over 4,096 characters and matches past
 * {@link RUBY_MAX_INVOCATIONS} are not scanned; each is reported in `skips` instead of being dropped.
 */
export function rubyInvocations(lines: readonly string[], maskedLines: readonly string[]): RubyInvocationScan {
  const keyword = /(?<![\w.:])(?:(?:::)?Kernel\s*\.\s*)?(require_relative|require|load|gem|autoload)\b/g;
  const invocations: RubyInvocation[] = [];
  const skips: RubyScanSkip[] = [];
  let invocationCapReached = false;
  for (const [index, masked] of maskedLines.entries()) {
    const line = textAt(lines, index);
    if (line.length > RUBY_MAX_LINE || masked.length > RUBY_MAX_LINE) {
      if (RUBY_INVOCATION_HINT.test(line)) {
        skips.push({
          line: index + 1,
          column: 1,
          reference: line.slice(0, RUBY_MAX_REFERENCE).trim(),
          reason: `line longer than ${RUBY_MAX_LINE} characters`,
        });
      }
      continue;
    }
    keyword.lastIndex = 0;
    for (const match of masked.matchAll(keyword)) {
      if (match.index === undefined || !match[1]) continue;
      const kind = match[1] as RubyInvocation["kind"];
      const keywordLength = match[0].length;
      if (rubyKeywordIsMethodDefinition(masked, match.index)) continue;
      if (!rubyKeywordIsCall(line, masked, match.index, keywordLength)) continue;
      const reference = line.slice(match.index, match.index + RUBY_MAX_REFERENCE).trim();
      if (invocationCapReached || invocations.length >= RUBY_MAX_INVOCATIONS) {
        invocationCapReached = true;
        skips.push({
          line: index + 1,
          column: match.index + 1,
          reference,
          reason: `more than ${RUBY_MAX_INVOCATIONS} invocations in this repository`,
        });
        continue;
      }
      let cursor = match.index + keywordLength;
      while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      if (line[cursor] === "(") {
        cursor += 1;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      }
      if (kind === "autoload") {
        const symbol = /^:([A-Za-z_]\w*)/.exec(line.slice(cursor));
        if (!symbol) {
          invocations.push({ kind, line: index + 1, keywordColumn: match.index + 1, reference, argument: { kind: "dynamic" } });
          continue;
        }
        cursor += symbol[0].length;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
        if (line[cursor] !== ",") {
          invocations.push({ kind, line: index + 1, keywordColumn: match.index + 1, reference, argument: { kind: "dynamic" } });
          continue;
        }
        cursor += 1;
        while (line[cursor] === " " || line[cursor] === "\t") cursor += 1;
      }
      const literal = readRubyLiteral(line, cursor);
      let after = literal?.end ?? cursor;
      while (line[after] === " " || line[after] === "\t") after += 1;
      const transformed = literal !== undefined && (literal.interpolated || line[after] === "+" || line[after] === "\\" || line[after] === ".");
      invocations.push({
        kind,
        line: index + 1,
        keywordColumn: match.index + 1,
        reference,
        argument: literal && !transformed ? { kind: "literal", value: literal.value, column: literal.column } : { kind: "dynamic" },
      });
    }
  }
  return { invocations, skips };
}

/** `require`/`load`/`gem`/`autoload` of a string. `require_relative` is a local file, not a gem. Bindings stay empty; calls use the rule's qualified target. */
function rubyImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const invocation of rubyInvocations(lines, maskedLines).invocations) {
    if (invocation.argument.kind !== "literal" || invocation.kind === "require_relative") continue;
    const module = invocation.argument.value.replace(/\.rb$/, "");
    if (module.length === 0) continue;
    references.push({ module, line: invocation.line, column: invocation.argument.column, bindings: [] });
  }
  return references;
}

export function maskCodeLine(line: string, language: SourceLanguage, state: MaskState): string {
  if (language === "ruby" && state.afterEnd) return " ".repeat(line.length);
  if (language === "ruby" && line === "__END__") {
    state.afterEnd = true;
    return " ".repeat(line.length);
  }
  if (language === "ruby" && state.heredoc) {
    if (line.trim() === state.heredoc) delete state.heredoc;
    return " ".repeat(line.length);
  }
  if (language === "ruby" && state.rubyBlock) {
    if (/^=end\b/.test(line)) state.rubyBlock = false;
    return " ".repeat(line.length);
  }
  if (language === "ruby" && /^=begin\b/.test(line)) {
    state.rubyBlock = true;
    return " ".repeat(line.length);
  }
  if (language === "php" && state.heredoc) {
    const trimmed = line.trim();
    if (trimmed === state.heredoc || trimmed === `${state.heredoc};`) delete state.heredoc;
    return " ".repeat(line.length);
  }
  // Fast path: no quotes, comments, percent literals, heredocs, character literals, or regexps to mask.
  if (language === "ruby" && !state.blockComment && !state.openString && !/[#"'%`<\/?]/.test(line)) return line;

  const output = [...line];
  let quote: string | undefined = state.openString?.kind === "quote" ? state.openString.quote : undefined;
  let escaped = state.openString?.kind === "quote" ? state.openString.escaped : false;
  let percent = state.openString?.kind === "percent" ? { ...state.openString } : undefined;
  if (language === "ruby" || language === "php") delete state.openString;

  let index = 0;
  if (language === "swift" && state.swiftMultilineString) {
    const end = line.indexOf('"""');
    if (end === -1) return " ".repeat(line.length);
    for (let cursor = 0; cursor < end + 3; cursor += 1) output[cursor] = " ";
    state.swiftMultilineString = false;
    index = end + 3;
  }
  if (language === "csharp" && state.csharpVerbatim) {
    const end = csharpVerbatimEnd(line, 0);
    if (end === undefined) return " ".repeat(line.length);
    for (let cursor = 0; cursor <= end; cursor += 1) output[cursor] = " ";
    state.csharpVerbatim = false;
    index = end + 1;
  }
  if (percent) {
    const closed = rubyPercentClose(line, 0, percent);
    const end = closed === undefined ? line.length - 1 : closed;
    for (let cursor = 0; cursor <= end; cursor += 1) output[cursor] = " ";
    if (closed === undefined) {
      state.openString = percent;
      return output.join("");
    }
    index = end + 1;
    percent = undefined;
  }

  for (; index < output.length; index += 1) {
    const character = textAt(output, index);
    const next = output[index + 1];
    if (state.blockComment) {
      output[index] = " ";
      if (language === "swift" && character === "/" && next === "*") {
        output[index + 1] = " ";
        state.swiftBlockCommentDepth = (state.swiftBlockCommentDepth ?? 1) + 1;
        index += 1;
        continue;
      }
      if (character === "*" && next === "/") {
        output[index + 1] = " ";
        if (language === "swift" && (state.swiftBlockCommentDepth ?? 1) > 1) {
          state.swiftBlockCommentDepth = (state.swiftBlockCommentDepth ?? 1) - 1;
        } else {
          state.blockComment = false;
          delete state.swiftBlockCommentDepth;
        }
        index += 1;
      }
      continue;
    }
    if (quote) {
      output[index] = " ";
      if (!escaped && character === quote) quote = undefined;
      escaped = character === "\\" && !escaped;
      continue;
    }
    if (language === "swift" && line.slice(index, index + 3) === '"""') {
      const end = line.indexOf('"""', index + 3);
      if (end === -1) {
        for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
        state.swiftMultilineString = true;
        return output.join("");
      }
      for (let cursor = index; cursor < end + 3; cursor += 1) output[cursor] = " ";
      index = end + 2;
      continue;
    }
    if (language === "ruby" && character === "?" && next !== undefined && next !== " " && next !== "\t") {
      // Character literal `?x` / `?\n` — a quote here must not open a string.
      output[index] = " ";
      if (next === "\\") {
        output[index + 1] = " ";
        if (index + 2 < output.length) {
          output[index + 2] = " ";
          index += 2;
        } else {
          index += 1;
        }
      } else {
        output[index + 1] = " ";
        index += 1;
      }
      continue;
    }
    if (language === "ruby" && character === "/" && next !== "=" && rubyRegexMayStart(line, index)) {
      const end = rubyRegexEnd(line, index);
      if (end !== undefined) {
        for (let cursor = index; cursor <= end; cursor += 1) output[cursor] = " ";
        index = end;
        continue;
      }
      // Unclosed regexp: mask the rest so a quote inside cannot hide later code.
      for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
      break;
    }
    if (language === "ruby" && character === "%") {
      const opened = rubyPercentOpen(line, index);
      if (opened) {
        const bodyStart = /[qQwWrsxiI]/.test(line.charAt(index + 1)) ? index + 3 : index + 2;
        const closed = rubyPercentClose(line, bodyStart, opened);
        const end = closed === undefined ? line.length - 1 : closed;
        for (let cursor = index; cursor <= end; cursor += 1) output[cursor] = " ";
        if (closed === undefined) {
          state.openString = opened;
          return output.join("");
        }
        index = end;
        continue;
      }
    }
    if (language === "php" && character === "<" && next === "<" && line[index + 2] === "<") {
      const opener = /^<<<(?:'([A-Za-z_][A-Za-z0-9_]*)'|"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(line.slice(index));
      const terminator = opener?.[1] ?? opener?.[2] ?? opener?.[3];
      if (opener && terminator) {
        state.heredoc = terminator;
        for (let cursor = index; cursor < output.length; cursor += 1) output[cursor] = " ";
        return output.join("");
      }
    }
    if (language === "ruby" && character === "<" && next === "<" && (index === 0 || !/[\w)\]]/.test(line.charAt(index - 1)))) {
      const heredoc = /^<<[-~]?(?:'([^'\n]+)'|"([^"\n]+)"|([A-Za-z_]\w*))/.exec(line.slice(index));
      const terminator = heredoc?.[1] ?? heredoc?.[2] ?? heredoc?.[3];
      if (heredoc && terminator) {
        state.heredoc = terminator;
        for (let cursor = index; cursor < index + heredoc[0].length; cursor += 1) output[cursor] = " ";
        index += heredoc[0].length - 1;
        continue;
      }
    }
    if (language === "csharp" && character === "@" && next === '"') {
      const end = csharpVerbatimEnd(line, index + 2);
      const last = end ?? output.length - 1;
      for (let cursor = index; cursor <= last; cursor += 1) output[cursor] = " ";
      if (end === undefined) {
        state.csharpVerbatim = true;
        return output.join("");
      }
      index = end;
      continue;
    }
    if (character === '"' || (character === "'" && language !== "rust") || (character === "`" && language !== "python" && language !== "rust")) {
      quote = character;
      output[index] = " ";
      escaped = false;
      continue;
    }
    if (language !== "python" && language !== "ruby" && character === "/" && next === "*") {
      output[index] = " ";
      output[index + 1] = " ";
      state.blockComment = true;
      if (language === "swift") state.swiftBlockCommentDepth = 1;
      index += 1;
      continue;
    }
    if (
      ((language === "python" || language === "ruby") && character === "#") ||
      (language === "php" && character === "#" && next !== "[") ||
      (language !== "python" && language !== "ruby" && character === "/" && next === "/")
    ) {
      for (let rest = index; rest < output.length; rest += 1) output[rest] = " ";
      break;
    }
  }
  if ((language === "ruby" || language === "php") && quote) state.openString = { kind: "quote", quote, escaped };
  return output.join("");
}

/** `parser: false` forces the regex scanner; `skips` receives one line per memory-capped file. */
export interface SourceUsageOptions {
  parser?: boolean;
  skips?: string[];
}
/** Finds every use of the given contracts in a repository and summarizes the impact. */
export async function analyzeSourceUsage(root: string, contracts: readonly SourceUsageContract[], options: SourceUsageOptions = {}): Promise<SourceUsageAnalysis[]> {
  const resolvedRoot = resolve(root);
  const relevantLanguages = new Set(contracts.flatMap((contract) => contract.matchers.map((matcher) => matcher.language)));
  const results = new Map<string, SourceUsage[]>(contracts.map((contract) => [contract.id, []]));
  const seen = new Map<string, Set<string>>(contracts.map((contract) => [contract.id, new Set()]));
  const push = (contractId: string, usage: SourceUsage): void => {
    const key = `${usage.kind}:${usage.location.path}:${usage.location.line}:${usage.location.column}:${usage.symbol}`;
    const contractSeen = requiredAt(seen, contractId);
    if (contractSeen.has(key)) return;
    contractSeen.add(key);
    requiredAt(results, contractId).push(usage);
  };

  for (const file of await sourceFiles(resolvedRoot, { include: (language) => relevantLanguages.has(language) })) {
    if ((file.language === "ruby" || file.language === "php") && checkoutSourceIgnored(file.path)) continue;
    const contents = await readFile(file.absolutePath, "utf8");
    // JavaScript, TypeScript, and Python import and call usages come from the parser when it can read the file;
    // otherwise (too large, over budget, or the runtime cannot load) the regex scanner below handles them.
    const parsed = options.parser === false ? undefined : await parsedUsages(file, contents, contracts);
    if (parsed) {
      noteCappedUsage(options.skips, file.path, parsed.analysisCapped);
      for (const [contractId, usages] of parsed) for (const usage of usages) push(contractId, usage);
      if (!contracts.some((contract) => contract.matchers.some((matcher) => matcher.kind === "config-key" && matcher.language === file.language))) continue;
    }
    const lines = contents.split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, file.language, maskState));
    const phpFile = file.language === "php" ? phpUses(lines, maskedLines) : undefined;
    const imports =
      phpFile !== undefined
        ? [...phpImportsFromRequires(lines, maskedLines), ...phpFile.imports.map((hit) => ({ module: hit.module, line: hit.line, column: hit.column, bindings: [] }))]
        : file.language === "ruby"
          ? rubyImports(lines, maskedLines)
          : file.language === "go"
            ? goImports(lines, maskedLines)
            : file.language === "rust"
              ? rustImports(lines, maskedLines)
              : file.language === "csharp"
                ? csharpImports(lines, maskedLines)
                : file.language === "java" || file.language === "kotlin"
                  ? jvmImports(lines, maskedLines)
                  : file.language === "swift"
                    ? swiftImports(lines, maskedLines)
                    : file.language === "dart"
                      ? dartImports(lines, maskedLines)
                      : lines.flatMap((line, index) => {
                          const maskedLine = textAt(maskedLines, index);
                          if (file.language === "python") {
                            return /\b(?:from|import)\b/.test(maskedLine) ? pythonImports(line, index + 1) : [];
                          }
                          if (file.language === "javascript" || file.language === "typescript") {
                            return /\b(?:import|require)\b/.test(maskedLine) ? javascriptImports(line, index + 1) : [];
                          }
                          return [];
                        });
    const bindings = imports.flatMap((reference) => reference.bindings);
    // Alias resolution is per file, not per matcher or target.
    const rubyFileAliases = file.language === "ruby" ? rubyAliases(maskedLines) : [];
    const phpFileAliases = phpFile?.aliases ?? [];
    const swiftFileAliases = file.language === "swift" ? swiftAliases(maskedLines) : [];
    const rubyReceiverPatterns = new Map<string, RegExp>();
    const phpReceiverPatterns = new Map<string, RegExp>();

    for (const contract of contracts) {
      const matchers = contract.matchers.filter((matcher) => matcher.language === file.language);
      for (const matcher of matchers) {
        if (parsed && matcher.kind !== "config-key") continue;
        if (matcher.kind === "import") {
          for (const reference of imports.filter((candidate) => moduleMatches(candidate.module, matcher.module, file.language))) {
            push(contract.id, {
              kind: "import",
              language: file.language,
              symbol: matcher.module,
              location: { path: file.path, line: reference.line, column: reference.column },
              excerpt: textAt(lines, reference.line - 1).trim(),
            });
          }
        } else if (matcher.kind === "call") {
          // Swift calls are attributed only when they stay module-qualified, or use a source-level
          // typealias whose target is inside that module. Unqualified imported names are ambiguous.
          if (file.language === "swift") {
            for (const target of matcher.targets) {
              const qualified = `${matcher.module}.${target}`;
              const forms = [qualified];
              for (const alias of swiftFileAliases) {
                if (qualified === alias.target) forms.push(alias.local);
                else if (qualified.startsWith(`${alias.target}.`)) forms.push(`${alias.local}${qualified.slice(alias.target.length)}`);
              }
              const alternatives = [...new Set(forms)].sort((left, right) => right.length - left.length).map((form) => form.split(".").map(escapePattern).join("\\s*\\.\\s*"));
              const pattern = new RegExp(`(?<![\\w$.])(?:${alternatives.join("|")})\\s*\\(`, "g");
              for (const [index, line] of maskedLines.entries()) {
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: textAt(lines, index).trim(),
                  });
                }
              }
            }
          }
          // In Rust a crate is always in scope by name, so `crate::function(…)` needs no `use`.
          if (file.language === "rust") {
            for (const target of matcher.targets) {
              const full = [matcher.module, target].join("::").split("::").map(escapePattern).join("\\s*::\\s*");
              const pattern = new RegExp(`(?<![\\w$:])${full}\\s*(?:!\\s*[(\\[{]|\\()`, "g");
              for (const [index, line] of maskedLines.entries()) {
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: textAt(lines, index).trim(),
                  });
                }
              }
            }
          }
          // In C# a type is reached by its full name, or by its simple name when a `using` brings in its namespace.
          if (file.language === "csharp") {
            // `using N;` brings in the types of N itself, not those of its sub-namespaces.
            const imported = imports.some((candidate) => candidate.module === matcher.module);
            for (const target of matcher.targets) {
              const path = (value: string): string => value.split(".").map(escapePattern).join("\\s*\\.\\s*");
              const forms = [{ source: path(`${matcher.module}.${target}`) }, ...(imported ? [{ source: path(target) }] : [])];
              for (const form of forms) {
                const pattern = new RegExp(`(?<![\\w$.])${form.source}\\s*\\(`, "g");
                for (const [index, line] of maskedLines.entries()) {
                  for (const match of line.matchAll(pattern)) {
                    if (match.index === undefined) continue;
                    push(contract.id, {
                      kind: "call",
                      language: file.language,
                      symbol: `${matcher.module}.${target}`,
                      location: { path: file.path, line: index + 1, column: match.index + 1 },
                      excerpt: textAt(lines, index).trim(),
                    });
                  }
                }
              }
            }
          }
          // A PHP call target is `Class::method(` or `new Class`. `use Foo as Alias` then `Alias::method(` or `new Alias` is the same call.
          if (file.language === "php") {
            for (const target of matcher.targets) {
              const forms = phpCallForms(target, phpFileAliases);
              if (forms.length === 0) continue;
              const formKey = forms.map((form) => `${form.kind}\0${form.receiver}\0${form.method ?? ""}`).join("\n");
              let pattern = phpReceiverPatterns.get(formKey);
              if (!pattern) {
                pattern = phpCallPattern(forms);
                phpReceiverPatterns.set(formKey, pattern);
              }
              for (const [index, line] of maskedLines.entries()) {
                if (line.length > PHP_MAX_LINE || (!line.includes("(") && !line.includes("new"))) continue;
                pattern.lastIndex = 0;
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  const column = match.index + 1 + (match[0].startsWith("\\") ? 1 : 0);
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column },
                    excerpt: textAt(lines, index).trim(),
                  });
                }
              }
            }
          }
          // A Ruby call is qualified (`JSON.parse(` or `JSON::parse(`). `Parser = JSON` then `Parser.parse(` is the same call.
          // One combined regex per target (not per alias form) so a large alias table cannot multiply file scans.
          if (file.language === "ruby") {
            for (const target of matcher.targets) {
              const forms = rubyReceivers(target, rubyFileAliases);
              if (forms.length === 0) continue;
              const formKey = forms.map((parts) => parts.join("\0")).join("\n");
              let pattern = rubyReceiverPatterns.get(formKey);
              if (!pattern) {
                const alternation = forms.map((parts) => parts.map((part) => escapePattern(part)).join("\\s*(?:\\.|::)\\s*")).join("|");
                pattern = new RegExp(`(?<![\\w$:])(?:::)?(?:${alternation})\\s*\\(`, "g");
                rubyReceiverPatterns.set(formKey, pattern);
              }
              for (const [index, line] of maskedLines.entries()) {
                if (line.length > RUBY_MAX_LINE || !line.includes("(")) continue;
                pattern.lastIndex = 0;
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: textAt(lines, index).trim(),
                  });
                }
              }
            }
          }
          const matchingBindings = file.language === "swift" ? [] : bindings.filter((binding) => moduleMatches(binding.module, matcher.module, file.language));
          for (const binding of matchingBindings) {
            for (const target of matcher.targets) {
              const rust = file.language === "rust";
              const separator = rust ? "\\s*::\\s*" : "\\s*\\.\\s*";
              const escapedTarget = rust ? target.split("::").map(escapePattern).join("\\s*::\\s*") : escapePattern(target);
              const head = rust ? rustHead(target) : target;
              const callable =
                target === "default"
                  ? binding.imported === "default" || binding.imported === "*"
                    ? escapePattern(binding.local)
                    : undefined
                  : binding.imported === target
                    ? escapePattern(binding.local)
                    : rust && target.includes("::") && binding.imported === head
                      ? `${escapePattern(binding.local)}\\s*::\\s*${target.split("::").slice(1).map(escapePattern).join("\\s*::\\s*")}`
                      : binding.imported === "*" || binding.imported === "default"
                        ? `${escapePattern(binding.local)}${separator}${escapedTarget}`
                        : undefined;
              if (!callable) continue;
              // A Rust macro is called with a bang: `format_err!(…)`.
              const pattern = new RegExp(`(?<![\\w$${rust ? ":" : ""}])${callable}${rust ? "\\s*(?:!\\s*[(\\[{]|\\()" : "\\s*\\("}`, "g");
              for (const [index, line] of maskedLines.entries()) {
                for (const match of line.matchAll(pattern)) {
                  if (match.index === undefined) continue;
                  push(contract.id, {
                    kind: "call",
                    language: file.language,
                    symbol: target === "default" ? matcher.module : `${matcher.module}.${target}`,
                    location: { path: file.path, line: index + 1, column: match.index + 1 },
                    excerpt: textAt(lines, index).trim(),
                  });
                }
              }
            }
          }
        } else if (matcher.kind === "config-key") {
          for (const [index, line] of lines.entries()) {
            const column = configKeyMatch(line, matcher);
            if (column === undefined) continue;
            push(contract.id, {
              kind: "config-key",
              language: file.language,
              symbol: matcher.key,
              location: { path: file.path, line: index + 1, column },
              excerpt: line.trim(),
            });
          }
        }
      }
    }
  }

  return contracts.map((contract) => {
    const usages = requiredAt(results, contract.id).sort((left, right) => {
      const pathOrder = left.location.path.localeCompare(right.location.path);
      if (pathOrder !== 0) return pathOrder;
      const lineOrder = (left.location.line ?? 0) - (right.location.line ?? 0);
      return lineOrder !== 0 ? lineOrder : (left.location.column ?? 0) - (right.location.column ?? 0);
    });
    return { contractId: contract.id, usages, impact: impactFor(usages) };
  });
}

export { impactFor };
export * from "./usage/dynamic-references.js";
export { phpRequires } from "./usage/php.js";
export type { SourceUsageAnalysis, SourceUsageContract } from "./domain.js";
