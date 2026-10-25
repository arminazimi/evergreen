import { severityValues, sourceLanguageValues } from "./domain.js";
import type {
  EvidenceSource,
  Finding,
  MigrationGuidance,
  MigrationGuidanceStep,
  ScanResult,
  SourceLocation,
  SourceUsage,
  VerificationCommand,
} from "./domain.js";
import { runtimeConflicts } from "./runtime-pin.js";
import type { PinnedRuntimes } from "./runtime-pin.js";

export type { VerificationCommand } from "./domain.js";

export interface MigrationStep extends MigrationGuidanceStep {
  paths: string[];
}

export interface MigrationPacket {
  schemaVersion: "evergreen.context.v1";
  generatedAt: string;
  repositoryRoot: string;
  finding: Finding;
  affectedFiles: string[];
  usages: SourceUsage[];
  constraints: string[];
  steps: MigrationStep[];
  sources: EvidenceSource[];
  verification: VerificationCommand[];
}

export class MigrationPacketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationPacketValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isLocation(value: unknown): value is SourceLocation {
  if (!isRecord(value) || !isNonEmptyString(value.path)) return false;
  return [value.line, value.column].every(
    (item) => item === undefined || (Number.isInteger(item) && Number(item) >= 1),
  );
}

function isSource(value: unknown): value is EvidenceSource {
  return (
    isRecord(value) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.url) &&
    (value.accessedAt === undefined || isNonEmptyString(value.accessedAt))
  );
}

function isUsage(value: unknown): value is SourceUsage {
  return (
    isRecord(value) &&
    ["import", "call", "config-key", "symbol"].includes(value.kind as string) &&
    sourceLanguageValues.includes(value.language as never) &&
    isNonEmptyString(value.symbol) &&
    isLocation(value.location) &&
    typeof value.excerpt === "string"
  );
}

function isGuidance(value: unknown): value is MigrationGuidance {
  if (
    !isRecord(value) ||
    !Array.isArray(value.constraints) ||
    value.constraints.length === 0 ||
    !value.constraints.every(isNonEmptyString) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    !Array.isArray(value.verification) ||
    value.verification.length === 0
  ) return false;
  const ids = new Set<string>();
  return (
    value.steps.every((step) => {
      if (
        !isRecord(step) ||
        ![step.id, step.title, step.instructions].every(isNonEmptyString) ||
        !["declaration", "usages", "all"].includes(step.targets as string) ||
        ids.has(step.id as string)
      ) return false;
      ids.add(step.id as string);
      return true;
    }) &&
    value.verification.every(
      (command) =>
        isRecord(command) &&
        isNonEmptyString(command.command) &&
        isNonEmptyString(command.purpose),
    )
  );
}

function isFinding(value: unknown): value is Finding {
  return (
    isRecord(value) &&
    [value.id, value.ruleId, value.detector, value.title, value.summary].every(isNonEmptyString) &&
    severityValues.includes(value.severity as never) &&
    isLocation(value.location) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.every(isSource) &&
    (value.usages === undefined || (Array.isArray(value.usages) && value.usages.every(isUsage))) &&
    (value.migration === undefined || isGuidance(value.migration))
  );
}

export function validateMigrationPacket(value: unknown): MigrationPacket {
  if (!isRecord(value) || value.schemaVersion !== "evergreen.context.v1") {
    throw new MigrationPacketValidationError("Unsupported migration packet schema.");
  }
  if (
    !isNonEmptyString(value.generatedAt) ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !isNonEmptyString(value.repositoryRoot) ||
    !isFinding(value.finding)
  ) {
    throw new MigrationPacketValidationError("Invalid migration packet metadata or finding.");
  }
  if (
    !Array.isArray(value.affectedFiles) ||
    value.affectedFiles.length === 0 ||
    !value.affectedFiles.every(isNonEmptyString) ||
    new Set(value.affectedFiles).size !== value.affectedFiles.length ||
    !Array.isArray(value.usages) ||
    !value.usages.every(isUsage) ||
    !Array.isArray(value.constraints) ||
    value.constraints.length === 0 ||
    !value.constraints.every(isNonEmptyString) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every(isSource)
  ) {
    throw new MigrationPacketValidationError("Invalid migration packet scope or evidence.");
  }
  const expectedFiles = [
    ...new Set([
      value.finding.location.path,
      ...value.usages.map((usage) => usage.location.path),
    ]),
  ].sort((left, right) => left.localeCompare(right));
  if (
    JSON.stringify(value.usages) !== JSON.stringify(value.finding.usages ?? []) ||
    JSON.stringify(value.sources) !== JSON.stringify(value.finding.sources) ||
    JSON.stringify(value.affectedFiles) !== JSON.stringify(expectedFiles)
  ) {
    throw new MigrationPacketValidationError("Migration packet evidence is inconsistent with its finding.");
  }
  const stepIds = new Set<string>();
  const affected = new Set(value.affectedFiles);
  const validStep = (step: unknown): boolean =>
    isRecord(step) &&
    [step.id, step.title, step.instructions].every(isNonEmptyString) &&
    ["declaration", "usages", "all"].includes(step.targets as string) &&
    !stepIds.has(step.id as string) &&
    Array.isArray(step.paths) &&
    step.paths.length > 0 &&
    step.paths.every((path) => isNonEmptyString(path) && affected.has(path)) &&
    Boolean(stepIds.add(step.id as string));
  const commands = new Set<string>();
  const validVerification = (verification: unknown): boolean =>
    isRecord(verification) &&
    isNonEmptyString(verification.command) &&
    !commands.has(verification.command) &&
    isNonEmptyString(verification.purpose) &&
    Boolean(commands.add(verification.command));
  if (
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    !value.steps.every(validStep) ||
    !Array.isArray(value.verification) ||
    value.verification.length === 0 ||
    !value.verification.every(validVerification)
  ) {
    throw new MigrationPacketValidationError("Invalid migration steps or verification commands.");
  }
  return value as unknown as MigrationPacket;
}

function affectedFiles(finding: Finding): string[] {
  return [...new Set([finding.location.path, ...(finding.usages ?? []).map((usage) => usage.location.path)])]
    .sort((left, right) => left.localeCompare(right));
}

function constraintsFor(finding: Finding, pinned: PinnedRuntimes): string[] {
  return [...new Set([
    finding.replacement ? `Target replacement: ${finding.replacement}.` : undefined,
    ...(finding.replacement && finding.requires ? runtimeConflicts(finding.replacement, finding.requires, pinned) : []),
    finding.deadline ? `Migration deadline: ${finding.deadline}.` : undefined,
    ...(finding.migration?.constraints ?? []),
    finding.usages?.length
      ? `Preserve behavior across ${finding.usages.length} identified source usage${finding.usages.length === 1 ? "" : "s"}.`
      : "No additional source usages were identified beyond the declaration; verify dynamic and generated references manually.",
    "Keep the migration within the evidence and affected files in this packet unless verification reveals additional scope.",
  ].filter((value): value is string => value !== undefined))];
}

function stepsFor(finding: Finding, paths: string[]): MigrationStep[] {
  const primary: SourceLocation = finding.location;
  const usagePaths = [...new Set((finding.usages ?? []).map((usage) => usage.location.path))]
    .sort((left, right) => left.localeCompare(right));
  const steps: MigrationStep[] = [
    {
      id: "review-evidence",
      title: "Review lifecycle evidence",
      instructions: `Confirm the reported lifecycle state for ${finding.title} against the authoritative sources.`,
      targets: "declaration",
      paths: [primary.path],
    },
  ];
  if (finding.migration) {
    steps.push(
      ...finding.migration.steps.map((step): MigrationStep => ({
        ...step,
        paths:
          step.targets === "declaration"
            ? [primary.path]
            : step.targets === "usages"
              ? (usagePaths.length > 0 ? usagePaths : [primary.path])
              : paths,
      })),
    );
  } else {
    steps.push({
      id: "update-declaration",
      title: "Update the deprecated declaration",
      instructions: finding.replacement
        ? `Replace the deprecated declaration with ${finding.replacement}.`
        : "Remove or update the deprecated declaration using the cited ecosystem guidance.",
      targets: "declaration",
      paths: [primary.path],
    });
    if (finding.usages?.length) {
      steps.push({
        id: "migrate-usages",
        title: "Migrate affected usages",
        instructions: "Update the listed imports, calls, and configuration keys while preserving behavior.",
        targets: "usages",
        paths: usagePaths,
      });
    }
  }
  steps.push({
    id: "verify-migration",
    title: "Verify the migration",
    instructions: "Run the suggested verification commands and re-scan the repository.",
    targets: "all",
    paths,
  });
  return steps;
}

function verificationFor(finding: Finding): VerificationCommand[] {
  const ecosystemCommands: Record<string, VerificationCommand[]> = {
    npm: [
      { command: "npm run test --if-present", purpose: "Run the repository test suite when configured." },
      { command: "npm run build --if-present", purpose: "Verify the project still builds." },
    ],
    python: [
      { command: "python -m pytest", purpose: "Run the Python test suite." },
    ],
    "github-actions": [
      { command: "git diff --check", purpose: "Validate the edited workflow diff." },
    ],
  };
  const commands = [
    ...(finding.migration?.verification ?? ecosystemCommands[finding.detector] ?? []),
    {
      command: "evergreen scan . --json",
      purpose: "Confirm the lifecycle finding no longer appears.",
    },
  ];
  return [...new Map(commands.map((command) => [command.command, command])).values()];
}

/** `pinned` is what the repository pins; pass it so the packet can warn when a replacement needs a newer runtime. */
export function createMigrationPacket(result: ScanResult, findingId: string, pinned: PinnedRuntimes = {}): MigrationPacket {
  const finding = result.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new Error(`Finding not found: ${findingId}`);
  const paths = affectedFiles(finding);
  return validateMigrationPacket({
    schemaVersion: "evergreen.context.v1",
    generatedAt: result.scannedAt,
    repositoryRoot: result.root,
    finding,
    affectedFiles: paths,
    usages: finding.usages ?? [],
    constraints: constraintsFor(finding, pinned),
    steps: stepsFor(finding, paths),
    sources: finding.sources,
    verification: verificationFor(finding),
  });
}
