export const severityValues = ["info", "low", "medium", "high", "critical"] as const;

export type Severity = (typeof severityValues)[number];

export interface EvidenceSource {
  title: string;
  url: string;
  accessedAt?: string;
}

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface Finding {
  id: string;
  ruleId: string;
  detector: string;
  title: string;
  summary: string;
  severity: Severity;
  location: SourceLocation;
  replacement?: string;
  deadline?: string;
  sources: EvidenceSource[];
}

export interface ScanResult {
  schemaVersion: "evergreen.scan.v1";
  root: string;
  scannedAt: string;
  findings: Finding[];
  diagnostics: string[];
  [key: string]: unknown;
}

export const CLI_MISSING_MESSAGE =
  "Evergreen CLI not found. Install it with: npm install -g evergreen-deprecation";

const WINDOWS_UNSAFE = /["&|<>^%!\r\n]/;

export function isSafeForWindowsShell(value: string): boolean {
  return !WINDOWS_UNSAFE.test(value);
}

export function buildScanArgs(root: string): string[] {
  return ["scan", "--json", root];
}

export function buildContextArgs(findingId: string, root: string): string[] {
  return ["context", findingId, root];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseScanResult(text: string): ScanResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Evergreen returned invalid JSON: ${message}`);
  }
  if (!isRecord(value)) {
    throw new Error("Evergreen returned a non-object scan result.");
  }
  if (value["schemaVersion"] !== "evergreen.scan.v1") {
    throw new Error(`Unsupported Evergreen scan schema: ${String(value["schemaVersion"])}`);
  }
  if (!Array.isArray(value["findings"])) {
    throw new Error("Evergreen scan result has no findings array.");
  }
  return value as unknown as ScanResult;
}
