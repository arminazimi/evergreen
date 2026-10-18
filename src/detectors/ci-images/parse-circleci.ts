import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export type CircleciUnclassifiedReason = "dynamic" | "floating" | "orb-not-resolved";

export interface CircleciImageReference {
  value: string;
  line: number;
}

export interface CircleciUnclassifiedReference extends CircleciImageReference {
  reason: CircleciUnclassifiedReason;
}

export interface CircleciParseResult {
  declarations: CircleciImageReference[];
  unclassified: CircleciUnclassifiedReference[];
}

/**
 * Pure, bounded parser for local CircleCI executor images and orb references.
 *
 * Only images under jobs and executors are read. Workflow executor references, resource classes, descriptions,
 * non-string values, aliases, merge keys, malformed YAML, and parameter maps are ignored. Orb references are
 * unclassified because their remote contents are never resolved. Dynamic values are classified before floating
 * aliases; literal local images are declarations for future reviewed rules.
 */
export function parseCircleci(contents: string): CircleciParseResult {
  const empty: CircleciParseResult = { declarations: [], unclassified: [] };
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return empty;

  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return empty;

    const declarations: CircleciImageReference[] = [];
    const unclassified: CircleciUnclassifiedReference[] = [];
    const root = document.contents;
    collectOrbs(root.get("orbs", true), lineCounter, unclassified);
    collectExecutors(root.get("jobs", true), lineCounter, declarations, unclassified);
    collectExecutors(root.get("executors", true), lineCounter, declarations, unclassified);
    return { declarations, unclassified };
  } catch {
    return empty;
  }
}

function collectOrbs(node: unknown, lineCounter: LineCounter, unclassified: CircleciUnclassifiedReference[]): void {
  if (!isMap(node)) return;
  for (const item of node.items) {
    if (!isScalar(item.value) || typeof item.value.value !== "string" || !item.value.range) continue;
    addReference(item.value.value, item.value.range[0], lineCounter, "orb-not-resolved", unclassified);
  }
}

function collectExecutors(node: unknown, lineCounter: LineCounter, declarations: CircleciImageReference[], unclassified: CircleciUnclassifiedReference[]): void {
  if (!isMap(node)) return;
  for (const item of node.items) {
    if (!isMap(item.value)) continue;
    collectDocker(item.value.get("docker", true), lineCounter, declarations, unclassified);
    collectMachine(item.value.get("machine", true), lineCounter, declarations, unclassified);
  }
}

function collectDocker(node: unknown, lineCounter: LineCounter, declarations: CircleciImageReference[], unclassified: CircleciUnclassifiedReference[]): void {
  if (!isSeq(node)) return;
  for (const item of node.items) {
    if (!isMap(item)) continue;
    collectImage(item.get("image", true), lineCounter, declarations, unclassified);
  }
}

function collectMachine(node: unknown, lineCounter: LineCounter, declarations: CircleciImageReference[], unclassified: CircleciUnclassifiedReference[]): void {
  if (!isMap(node)) return;
  collectImage(node.get("image", true), lineCounter, declarations, unclassified);
}

function collectImage(node: unknown, lineCounter: LineCounter, declarations: CircleciImageReference[], unclassified: CircleciUnclassifiedReference[]): void {
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return;
  const value = node.value;
  const line = lineCounter.linePos(node.range[0]).line;
  if (value.length > MAXIMUM_LINE_LENGTH) return;
  const reason = classify(value);
  if (reason) unclassified.push({ value, line, reason });
  else declarations.push({ value, line });
}

function addReference(value: string, offset: number, lineCounter: LineCounter, reason: "orb-not-resolved", unclassified: CircleciUnclassifiedReference[]): void {
  if (value.length <= MAXIMUM_LINE_LENGTH) unclassified.push({ value, line: lineCounter.linePos(offset).line, reason });
}

function classify(value: string): "dynamic" | "floating" | undefined {
  if (value.includes("$") || value.includes("<<")) return "dynamic";
  if (value === "latest" || value.endsWith("-latest") || value.endsWith(":latest") || /^cimg\/[^:]+:current$/.test(value)) return "floating";
  return undefined;
}
