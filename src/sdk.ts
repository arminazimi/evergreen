import { severityValues, sourceLanguageValues, symbolShapeValues } from "./domain.js";
import type {
  DeprecationRule,
  Finding,
  MigrationGuidance,
  UnclassifiedReference,
  UsageMatcher,
} from "./domain.js";

export const DETECTOR_API_VERSION = "evergreen.detector.v1" as const;

export interface DetectorContext {
  /** Absolute path to the repository being scanned. */
  readonly root: string;
}

export type DetectorFinding = Omit<Finding, "detector">;
export type DetectorUnclassifiedReference = Omit<UnclassifiedReference, "detector">;

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

export interface RegistryDefinition<Rule> {
  readonly schemaVersion: string;
  readonly isRule: (value: unknown) => value is Rule;
}

export interface Registry<Rule> {
  readonly schemaVersion: string;
  readonly rules: readonly Rule[];
}

export class DetectorCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetectorCompatibilityError";
  }
}

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
      (command) =>
        isRecord(command) &&
        isNonEmptyString(command.command) &&
        isNonEmptyString(command.purpose),
    )
  );
}

const SYMBOL_FIELDS = ["kind", "language", "module", "symbol", "shape", "option", "argument", "replacement"];
const SYMBOL_PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

export function isUsageMatcher(value: unknown): value is UsageMatcher {
  if (!isRecord(value) || !sourceLanguageValues.includes(value.language as never)) return false;
  if (value.kind === "import") {
    return (
      ["javascript", "typescript", "python", "go", "java", "kotlin", "rust", "csharp", "ruby", "php", "swift", "dart"].includes(value.language as string) &&
      isNonEmptyString(value.module)
    );
  }
  if (value.kind === "call") {
    return (
      ["javascript", "typescript", "python", "go", "rust", "csharp", "ruby", "php", "swift", "dart"].includes(value.language as string) &&
      isNonEmptyString(value.module) &&
      Array.isArray(value.targets) &&
      value.targets.length > 0 &&
      value.targets.every(isNonEmptyString)
    );
  }
  if (value.kind === "symbol") {
    const hasOption = value.shape === "option";
    return (
      Object.keys(value).every((key) => SYMBOL_FIELDS.includes(key)) &&
      ["javascript", "typescript", "python"].includes(value.language as string) &&
      (value.module === undefined || isNonEmptyString(value.module)) &&
      typeof value.symbol === "string" &&
      SYMBOL_PATH.test(value.symbol) &&
      symbolShapeValues.includes(value.shape as never) &&
      (value.shape !== "construct" || value.language !== "python") &&
      (hasOption ? isNonEmptyString(value.option) : value.option === undefined && value.argument === undefined) &&
      (value.argument === undefined || (Number.isInteger(value.argument) && (value.argument as number) >= 0)) &&
      (value.replacement === undefined || isNonEmptyString(value.replacement))
    );
  }
  if (value.kind === "config-key") {
    return (
      isNonEmptyString(value.key) &&
      (value.valueIncludes === undefined || isNonEmptyString(value.valueIncludes))
    );
  }
  return false;
}

export function validateRegistry<Rule>(
  value: unknown,
  definition: RegistryDefinition<Rule>,
): Registry<Rule> {
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
    throw new DetectorCompatibilityError(
      "Detector id must contain lowercase letters, numbers, and single hyphens.",
    );
  }
  if (typeof value.scan !== "function") {
    throw new DetectorCompatibilityError("Detector scan must be a function.");
  }
}

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
