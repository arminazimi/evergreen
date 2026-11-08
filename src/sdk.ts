import { isMigrationGuidance } from "@velella/ebb/rule-guards";
import { severityValues } from "./domain.js";
import type { DeprecationRule, Finding, UnclassifiedReference } from "./domain.js";

export {
  isMigrationGuidance,
  isUsageMatcher,
  RegistryValidationError,
  validateRegistry,
} from "@velella/ebb/rule-guards";
export type { Registry, RegistryDefinition } from "@velella/ebb/rule-guards";

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

/** Thrown when a detector does not satisfy the current API contract. */
export class DetectorCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DetectorCompatibilityError";
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
