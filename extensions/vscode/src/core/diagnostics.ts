import { isAbsolute, relative, resolve, sep } from "node:path";

import type { Finding, ScanResult, SourceLocation } from "./scan.js";

export type DiagnosticSeverityName = "error" | "warning" | "information";

export interface MappedDiagnostic {
  path: string;
  line: number;
  character: number;
  endCharacter: number;
  severity: DiagnosticSeverityName;
  code: string;
  codeTarget?: string;
  message: string;
  findingId: string;
  root: string;
}

export interface FindingRef {
  findingId: string;
  root: string;
}

const severityMap: Record<string, DiagnosticSeverityName> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "information",
  info: "information",
};

export function mapSeverity(severity: string): DiagnosticSeverityName {
  return severityMap[severity] ?? "warning";
}

export function locationToRange(location: SourceLocation): {
  line: number;
  character: number;
  endCharacter: number;
} {
  const line = Math.max((location.line ?? 1) - 1, 0);
  const character = Math.max((location.column ?? 1) - 1, 0);
  return { line, character, endCharacter: character + 1 };
}

function findingPath(location: SourceLocation, root: string): string | undefined {
  if (typeof location.path !== "string" || location.path.length === 0) {
    return undefined;
  }
  if (isAbsolute(location.path)) {
    return location.path;
  }
  const resolved = resolve(root, location.path);
  const relativePath = relative(root, resolved);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return undefined;
  }
  return resolved;
}

function firstSourceUrl(finding: Finding): string | undefined {
  const url = finding.sources?.[0]?.url;
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : undefined;
}

export function findingsToDiagnostics(
  scan: ScanResult,
  root: string,
): MappedDiagnostic[] {
  const diagnostics: MappedDiagnostic[] = [];
  for (const finding of scan.findings) {
    if (typeof finding.id !== "string" || typeof finding.ruleId !== "string") {
      continue;
    }
    const path = findingPath(finding.location, root);
    if (!path) {
      continue;
    }
    const range = locationToRange(finding.location);
    const codeTarget = firstSourceUrl(finding);
    const title =
      typeof finding.title === "string" && finding.title.length > 0
        ? finding.title
        : finding.ruleId;
    const summary = typeof finding.summary === "string" ? finding.summary : "";
    diagnostics.push({
      path,
      ...range,
      severity: mapSeverity(finding.severity),
      code: finding.ruleId,
      ...(codeTarget ? { codeTarget } : {}),
      message: summary ? `${title}\n\n${summary}` : title,
      findingId: finding.id,
      root,
    });
  }
  return diagnostics;
}

export function asFindingRef(value: unknown): FindingRef | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const findingId = record["findingId"];
  const root = record["root"];
  if (typeof findingId === "string" && typeof root === "string") {
    return { findingId, root };
  }
  return undefined;
}
