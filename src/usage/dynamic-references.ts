import { resolve } from "node:path";

import type { ScanFileSystem } from "../file-system.js";
import { nodeFileSystem } from "../node-file-system.js";
import { sourceFiles } from "../source-files.js";
import { phpRequires } from "./php.js";
import { rubyInvocations } from "./ruby-invocations.js";
import { checkoutSourceIgnored } from "./checkout.js";
import { maskCodeLine, type MaskState } from "./masking.js";
import { PHP_DYNAMIC_ARGUMENT_REASON, phpVariableCalls } from "./php.js";

export interface RubyDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

const RUBY_DYNAMIC_REASON = "the argument is not a string literal, so Evergreen does not attribute it to a gem";

/**
 * `require`, `load`, `gem`, and `autoload` whose argument is not a string literal, plus invocations
 * that were not scanned because a line or repository bound was hit.
 * `require_relative` is never unclassified: it names a local file, not a gem.
 */
export async function findRubyDynamicReferences(
  root: string,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<RubyDynamicReference[]> {
  const found: RubyDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root), { include: (language) => language === "ruby" }, fileSystem)) {
    if (checkoutSourceIgnored(file.path)) continue;
    const lines = (await fileSystem.readText(file.absolutePath)).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "ruby", maskState));
    const { invocations, skips } = rubyInvocations(lines, maskedLines);
    for (const skip of skips) {
      found.push({
        path: file.path,
        line: skip.line,
        column: skip.column,
        reference: skip.reference,
        reason: skip.reason,
      });
    }
    for (const invocation of invocations) {
      if (invocation.kind === "require_relative" || invocation.argument.kind !== "dynamic") continue;
      found.push({
        path: file.path,
        line: invocation.line,
        column: invocation.keywordColumn,
        reference: invocation.reference,
        reason: RUBY_DYNAMIC_REASON,
      });
    }
  }
  return found.sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.line - right.line ||
      left.column - right.column ||
      left.reference.localeCompare(right.reference),
  );
}

export interface PhpDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

/**
 * `require`, `require_once`, `include`, and `include_once` whose argument is not a string literal, plus
 * `new $class` and `$class::method()`. A quoted path and a static `use` are never unclassified. PHP has no
 * `require_relative`. Reported only for files this scanner reads; the detector calls it when a finding has usage matchers.
 */
export async function findPhpDynamicReferences(
  root: string,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<PhpDynamicReference[]> {
  const found: PhpDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root), { include: (language) => language === "php" }, fileSystem)) {
    if (checkoutSourceIgnored(file.path)) continue;
    const lines = (await fileSystem.readText(file.absolutePath)).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "php", maskState));
    const { requires, skips } = phpRequires(lines, maskedLines);
    for (const skip of skips) {
      found.push({
        path: file.path,
        line: skip.line,
        column: skip.column,
        reference: skip.reference,
        reason: skip.reason,
      });
    }
    for (const invocation of requires) {
      if (invocation.argument.kind !== "dynamic") continue;
      found.push({
        path: file.path,
        line: invocation.line,
        column: invocation.keywordColumn,
        reference: invocation.reference,
        reason: PHP_DYNAMIC_ARGUMENT_REASON,
      });
    }
    for (const call of phpVariableCalls(lines, maskedLines)) {
      found.push({
        path: file.path,
        line: call.line,
        column: call.column,
        reference: call.reference,
        reason: call.reason,
      });
    }
  }
  return uniquePhpDynamicReferences(found);
}

/** One hit per path, line, column, reference, and reason, sorted so output is stable. */
function uniquePhpDynamicReferences(found: readonly PhpDynamicReference[]): PhpDynamicReference[] {
  const unique = new Map<string, PhpDynamicReference>();
  for (const hit of found) {
    const key = `${hit.path}:${hit.line}:${hit.column}:${hit.reference}:${hit.reason}`;
    if (!unique.has(key)) unique.set(key, hit);
  }
  return [...unique.values()].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.line - right.line ||
      left.column - right.column ||
      left.reference.localeCompare(right.reference),
  );
}

export interface DartDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

const DART_DYNAMIC_REASON = "the runtime lookup cannot be attributed statically to a Dart package or API";
const DART_DYNAMIC_LOOKUP = /\bFunction\s*\.\s*apply\s*\(/g;
const DART_MIRROR_LOOKUP = /\b(?:reflect|reflectClass|reflectType|currentMirrorSystem)\s*\(/g;

/** Runtime lookup forms in Dart source that cannot be assigned to a package safely: `Function.apply`, and `dart:mirrors` reflection. */
export async function findDartDynamicReferences(
  root: string,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<DartDynamicReference[]> {
  const found: DartDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root), { include: (language) => language === "dart" }, fileSystem)) {
    if (checkoutSourceIgnored(file.path)) continue;
    const lines = (await fileSystem.readText(file.absolutePath)).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "dart", maskState));
    const mirrors = lines.some(
      (line, index) => /^\s*import\b/.test(maskedLines[index] ?? "") && /^\s*import\s*['"]dart:mirrors['"]/.test(line),
    );
    for (const [index, masked] of maskedLines.entries()) {
      for (const pattern of mirrors ? [DART_DYNAMIC_LOOKUP, DART_MIRROR_LOOKUP] : [DART_DYNAMIC_LOOKUP]) {
        pattern.lastIndex = 0;
        for (const match of masked.matchAll(pattern)) {
          if (match.index === undefined) continue;
          found.push({
            path: file.path,
            line: index + 1,
            column: match.index + 1,
            reference: (lines[index] ?? "").trim(),
            reason: DART_DYNAMIC_REASON,
          });
        }
      }
    }
  }
  return found.sort(
    (left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column,
  );
}

export interface SwiftDynamicReference {
  path: string;
  line: number;
  column: number;
  reference: string;
  reason: string;
}

const SWIFT_DYNAMIC_REASON = "the runtime lookup cannot be attributed statically to a Swift package or API";
const SWIFT_DYNAMIC_LOOKUP =
  /\b(?:NSClassFromString|NSProtocolFromString|NSSelectorFromString|Selector|objc_getClass|sel_registerName|dlsym)\s*\(/g;

/** Runtime Objective-C lookup forms in Swift source that cannot be assigned to a package safely. */
export async function findSwiftDynamicReferences(
  root: string,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<SwiftDynamicReference[]> {
  const found: SwiftDynamicReference[] = [];
  for (const file of await sourceFiles(resolve(root), { include: (language) => language === "swift" }, fileSystem)) {
    if (checkoutSourceIgnored(file.path)) continue;
    const lines = (await fileSystem.readText(file.absolutePath)).split(/\r?\n/);
    const maskedLines: string[] = [];
    const maskState: MaskState = { blockComment: false };
    for (const line of lines) maskedLines.push(maskCodeLine(line, "swift", maskState));
    for (const [index, masked] of maskedLines.entries()) {
      SWIFT_DYNAMIC_LOOKUP.lastIndex = 0;
      for (const match of masked.matchAll(SWIFT_DYNAMIC_LOOKUP)) {
        if (match.index === undefined) continue;
        found.push({
          path: file.path,
          line: index + 1,
          column: match.index + 1,
          reference: (lines[index] ?? "").trim(),
          reason: SWIFT_DYNAMIC_REASON,
        });
      }
    }
  }
  return found.sort(
    (left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column,
  );
}
