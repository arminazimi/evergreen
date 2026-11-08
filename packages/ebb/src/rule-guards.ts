import { sourceLanguageValues, symbolShapeValues } from "./domain.js";
import type { MigrationGuidance, UsageMatcher } from "./domain.js";

/** Ties a registry schema version to the guard that recognizes its rules. */
export interface RegistryDefinition<Rule> {
  readonly schemaVersion: string;
  readonly isRule: (value: unknown) => value is Rule;
}

/** A validated registry document and the schema version it was read as. */
export interface Registry<Rule> {
  readonly schemaVersion: string;
  readonly rules: readonly Rule[];
}

/** Thrown when a registry document is malformed or has the wrong schema version. */
export class RegistryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Narrows an unknown value to reviewed migration guidance with steps and verification. */
export function isMigrationGuidance(value: unknown): value is MigrationGuidance {
  if (
    !isRecord(value) ||
    !Array.isArray(value.constraints) ||
    value.constraints.length === 0 ||
    !value.constraints.every(isNonEmptyString) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    !Array.isArray(value.verification) ||
    value.verification.length === 0
  ) {
    return false;
  }
  const ids = new Set<string>();
  const validSteps = value.steps.every((step) => {
    if (
      !isRecord(step) ||
      !isNonEmptyString(step.id) ||
      !isNonEmptyString(step.title) ||
      !isNonEmptyString(step.instructions) ||
      !["declaration", "usages", "all"].includes(step.targets as string) ||
      ids.has(step.id)
    ) {
      return false;
    }
    ids.add(step.id);
    return true;
  });
  return (
    validSteps &&
    value.verification.every(
      (command) => isRecord(command) && isNonEmptyString(command.command) && isNonEmptyString(command.purpose),
    )
  );
}

const SYMBOL_FIELDS = new Set(["kind", "language", "module", "symbol", "shape", "option", "argument", "replacement"]);
const SYMBOL_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

/** Languages the source-usage scanner reads a plain import or require statement for. */
const IMPORT_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "python",
  "go",
  "java",
  "kotlin",
  "rust",
  "csharp",
  "ruby",
  "php",
  "swift",
  "dart",
]);

/** Languages the source-usage scanner reads a call site for; Java and Kotlin bind only through imports. */
const CALL_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "python",
  "go",
  "rust",
  "csharp",
  "ruby",
  "php",
  "swift",
  "dart",
]);

/** Languages the symbol matcher, which reads one expression path, supports. */
const SYMBOL_LANGUAGES = new Set(["javascript", "typescript", "python"]);

function isImportMatcher(value: Record<string, unknown>): boolean {
  return IMPORT_LANGUAGES.has(value.language as string) && isNonEmptyString(value.module);
}

function isCallMatcher(value: Record<string, unknown>): boolean {
  return (
    CALL_LANGUAGES.has(value.language as string) &&
    isNonEmptyString(value.module) &&
    Array.isArray(value.targets) &&
    value.targets.length > 0 &&
    value.targets.every(isNonEmptyString)
  );
}

function isConfigKeyMatcher(value: Record<string, unknown>): boolean {
  return isNonEmptyString(value.key) && (value.valueIncludes === undefined || isNonEmptyString(value.valueIncludes));
}

/** A symbol matcher names exactly its own fields and nothing else. */
function hasOnlySymbolFields(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => SYMBOL_FIELDS.has(key));
}

/** Python has no constructors to reach as free functions and always names the receiver of a method. */
function isSymbolShapeForLanguage(value: Record<string, unknown>): boolean {
  if (value.shape === "construct") return value.language !== "python";
  if (value.shape === "method") return value.language === "python";
  return true;
}

/** Only an option-shaped symbol carries an option name, and only a call-shaped one an argument index. */
function isSymbolOptionFieldsForShape(value: Record<string, unknown>): boolean {
  if (value.shape === "option") return isNonEmptyString(value.option);
  return value.option === undefined && value.argument === undefined;
}

function isSymbolArgument(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && (value as number) >= 0);
}

function isSymbolMatcher(value: Record<string, unknown>): boolean {
  if (!hasOnlySymbolFields(value)) return false;
  if (!SYMBOL_LANGUAGES.has(value.language as string)) return false;
  if (value.module !== undefined && !isNonEmptyString(value.module)) return false;
  if (typeof value.symbol !== "string" || !SYMBOL_PATH.test(value.symbol)) return false;
  if (!symbolShapeValues.includes(value.shape as never)) return false;
  if (!isSymbolShapeForLanguage(value)) return false;
  if (!isSymbolOptionFieldsForShape(value)) return false;
  if (!isSymbolArgument(value.argument)) return false;
  return value.replacement === undefined || isNonEmptyString(value.replacement);
}

/** Narrows an unknown value to one of the supported source-usage matchers. */
export function isUsageMatcher(value: unknown): value is UsageMatcher {
  if (!isRecord(value) || !sourceLanguageValues.includes(value.language as never)) return false;
  if (value.kind === "import") return isImportMatcher(value);
  if (value.kind === "call") return isCallMatcher(value);
  if (value.kind === "symbol") return isSymbolMatcher(value);
  if (value.kind === "config-key") return isConfigKeyMatcher(value);
  return false;
}

/** Validates a decoded registry against its definition and returns its rules. */
export function validateRegistry<Rule>(value: unknown, definition: RegistryDefinition<Rule>): Registry<Rule> {
  if (!isRecord(value)) {
    throw new RegistryValidationError("Registry must be a JSON object.");
  }
  if (value.schemaVersion !== definition.schemaVersion) {
    throw new RegistryValidationError(
      `Unsupported registry schema: ${String(value.schemaVersion ?? "missing")}; expected ${definition.schemaVersion}.`,
    );
  }
  if (!Array.isArray(value.rules)) {
    throw new RegistryValidationError("Registry rules must be an array.");
  }

  for (const [index, rule] of value.rules.entries()) {
    if (!definition.isRule(rule)) {
      throw new RegistryValidationError(`Invalid registry rule at index ${index}.`);
    }
  }

  return { schemaVersion: definition.schemaVersion, rules: value.rules };
}
