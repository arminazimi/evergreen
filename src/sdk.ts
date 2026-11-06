import { severityValues, sourceLanguageValues, symbolShapeValues } from "./domain.js";
import type { DeprecationRule, Finding, MigrationGuidance, UnclassifiedReference, UsageMatcher } from "./domain.js";

/** The detector interface version an adapter must declare to run. */
export const DETECTOR_API_VERSION = "evergreen.detector.v1" as const;

/** The repository and scan time a detector receives when it runs. */
export interface DetectorContext {
  /** Absolute path to the repository being scanned. */
  readonly root: string;
  /**
   * ISO-8601 timestamp for this scan. The engine always sets it before detectors run.
   * Detectors that classify announced-but-future dates (decision 0010) must use this
   * instead of reading the clock, so the same repository stays deterministic for a given scan.
   * Optional only so direct detector calls in tests can omit it.
   */
  readonly scannedAt?: string;
}

/** A detector may state `confidence`; when it does not, the engine derives it from where the finding was read. */
export type DetectorFinding = Omit<Finding, "detector" | "confidence"> & { confidence?: Finding["confidence"] };
/** A reference a detector could not classify; the engine fills in which detector reported it. */
export type DetectorUnclassifiedReference = Omit<UnclassifiedReference, "detector">;

/** Findings plus unclassified references, for detectors that report both. */
export interface DetectorAnalysis {
  findings: readonly DetectorFinding[];
  unclassified: readonly DetectorUnclassifiedReference[];
}

/**
 * The files a detector may read from the repository it scans. A file is declared when any field matches it.
 * Paths are relative to the scanned root and written with forward slashes.
 */
export interface DetectorInputs {
  /** Exact base names matched at any depth, case-insensitively. `*` matches any run of characters: `requirements*.txt`. */
  readonly fileNames?: readonly string[];
  /** Base-name endings matched case-insensitively, including the dot: `.csproj`. */
  readonly extensions?: readonly string[];
  /** Directories, relative to the root or to any directory below it, whose files may all be read: `.github/workflows`. */
  readonly directories?: readonly string[];
  /** Extensions of source files read to map usage of a deprecated API, including the dot: `.ts`. */
  readonly sourceExtensions?: readonly string[];
}

/** The bounds every detector keeps while it discovers and reads repository files. */
export interface DetectorLimits {
  /** A finding must not come from a file larger than this many bytes. */
  readonly maximumFileBytes: number;
  /** A finding must not come from a file nested in more directories than this, counted from the scanned root. */
  readonly maximumDirectoryDepth: number;
  /** Directory names whose contents are third-party or generated and never produce findings. */
  readonly vendoredDirectories: readonly string[];
}

/** The limits of `evergreen.detector.v1`. Conformance enforces them; a detector may be stricter, never looser. */
export const DETECTOR_LIMITS: DetectorLimits = Object.freeze({
  maximumFileBytes: 1_000_000,
  maximumDirectoryDepth: 32,
  vendoredDirectories: Object.freeze([".venv", "build", "dist", "node_modules", "target", "vendor", "venv"]),
});

/** The stable interface an ecosystem detector implements. */
export interface Detector {
  readonly apiVersion: typeof DETECTOR_API_VERSION;
  readonly id: string;
  /**
   * Optional and additive: the files `scan` may read. Conformance fails a scan that reads a file outside it,
   * so tools can fetch only these files. A detector that omits it makes no promise.
   */
  readonly inputs?: DetectorInputs;
  scan(context: DetectorContext): Promise<readonly DetectorFinding[]>;
  /** Optional richer result. Engines use it when present; scan remains the stable v1 seam. */
  analyze?(context: DetectorContext): Promise<DetectorAnalysis>;
}

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

/** Thrown when a detector does not satisfy the current API contract. */
export class DetectorCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetectorCompatibilityError";
  }
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

/** Narrows an unknown value to a lifecycle rule that carries the required evidence. */
export function isDeprecationRule(value: unknown): value is DeprecationRule {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.ecosystem) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.summary) ||
    !severityValues.includes(value.severity as (typeof severityValues)[number]) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0
  ) {
    return false;
  }

  if (value.replacement !== undefined && !isNonEmptyString(value.replacement)) return false;
  if (value.deadline !== undefined && !isNonEmptyString(value.deadline)) return false;
  if (value.migration !== undefined && !isMigrationGuidance(value.migration)) return false;

  return value.sources.every(
    (source) =>
      isRecord(source) &&
      isNonEmptyString(source.title) &&
      isNonEmptyString(source.url) &&
      (source.accessedAt === undefined || isNonEmptyString(source.accessedAt)),
  );
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

/** Throws unless the value declares the current API version and a valid id and scan function. */
export function assertDetectorCompatible(value: unknown): asserts value is Detector {
  if (!isRecord(value)) {
    throw new DetectorCompatibilityError("Detector must be an object.");
  }
  if (value.apiVersion !== DETECTOR_API_VERSION) {
    throw new DetectorCompatibilityError(
      `Unsupported detector API: ${String(value.apiVersion ?? "missing")}; expected ${DETECTOR_API_VERSION}.`,
    );
  }
  if (!isNonEmptyString(value.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    throw new DetectorCompatibilityError("Detector id must contain lowercase letters, numbers, and single hyphens.");
  }
  if (typeof value.scan !== "function") {
    throw new DetectorCompatibilityError("Detector scan must be a function.");
  }
}

/** Checks a detector at definition time and returns it with its literal type preserved. */
export function defineDetector<const Adapter extends Detector>(adapter: Adapter): Adapter {
  assertDetectorCompatible(adapter);
  return adapter;
}

export { analyzeSourceUsage } from "./source-usage.js";

export type {
  DeprecationRule,
  EvidenceSource,
  Finding,
  MigrationImpact,
  MigrationGuidance,
  MigrationGuidanceStep,
  ScanResult,
  Severity,
  SourceLanguage,
  SourceLocation,
  SourceUsage,
  SourceUsageAnalysis,
  SourceUsageContract,
  UnclassifiedReference,
  UnclassifiedSummary,
  UsageMatcher,
  VerificationCommand,
} from "./domain.js";
