import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export type AzureUnclassifiedReason = "dynamic" | "floating";

export interface AzureImageReference {
  value: string;
  line: number;
}

export interface AzureUnclassifiedReference extends AzureImageReference {
  reason: AzureUnclassifiedReason;
}

export interface AzurePipelinesParseResult {
  declarations: AzureImageReference[];
  unclassified: AzureUnclassifiedReference[];
}

/**
 * Pure, bounded parser for Azure Pipelines `pool.vmImage`.
 *
 * Only pipeline-, stage-, and job-level `pool` objects are read. A pool written as a plain string, a pool
 * `name:` without `vmImage`, containers, resources, and `strategy.matrix` `vmImage` entries are deliberately not
 * read in this version. Dynamic variables and floating aliases are unclassified; literal image labels are
 * declarations for future reviewed rules. Aliases, merge keys, non-string values, comments, malformed YAML, and
 * oversized input are ignored rather than evaluated.
 */
export function parseAzurePipelines(contents: string): AzurePipelinesParseResult {
  const empty: AzurePipelinesParseResult = { declarations: [], unclassified: [] };
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return empty;

  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return empty;

    const declarations: AzureImageReference[] = [];
    const unclassified: AzureUnclassifiedReference[] = [];
    const root = document.contents;

    collectPool(root.get("pool", true), lineCounter, declarations, unclassified);
    collectJobs(root.get("jobs", true), lineCounter, declarations, unclassified);

    const stages = root.get("stages", true);
    if (isSeq(stages)) {
      for (const stage of stages.items) {
        if (!isMap(stage)) continue;
        collectPool(stage.get("pool", true), lineCounter, declarations, unclassified);
        collectJobs(stage.get("jobs", true), lineCounter, declarations, unclassified);
      }
    }

    return { declarations, unclassified };
  } catch {
    return empty;
  }
}

function collectJobs(node: unknown, lineCounter: LineCounter, declarations: AzureImageReference[], unclassified: AzureUnclassifiedReference[]): void {
  if (!isSeq(node)) return;
  for (const job of node.items) {
    if (!isMap(job)) continue;
    collectPool(job.get("pool", true), lineCounter, declarations, unclassified);
  }
}

function collectPool(node: unknown, lineCounter: LineCounter, declarations: AzureImageReference[], unclassified: AzureUnclassifiedReference[]): void {
  if (!isMap(node)) return;
  collectImage(node.get("vmImage", true), lineCounter, declarations, unclassified);
}

function collectImage(node: unknown, lineCounter: LineCounter, declarations: AzureImageReference[], unclassified: AzureUnclassifiedReference[]): void {
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return;
  const value = node.value;
  if (value.length > MAXIMUM_LINE_LENGTH) return;
  const line = lineCounter.linePos(node.range[0]).line;
  const reason = classify(value);
  if (reason) unclassified.push({ value, line, reason });
  else declarations.push({ value, line });
}

function classify(value: string): AzureUnclassifiedReason | undefined {
  if (value.includes("$")) return "dynamic";
  if (value === "latest" || value.endsWith("-latest")) return "floating";
  return undefined;
}
