import { LineCounter, isMap, isScalar, isSeq, parseDocument, visit } from "yaml";

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export type GitlabUnclassifiedReason = "dynamic" | "floating" | "gitlab-not-judged";

export interface GitlabImageReference {
  value: string;
  line: number;
}

export interface GitlabUnclassifiedReference extends GitlabImageReference {
  reason: GitlabUnclassifiedReason;
}

export interface GitlabCiParseResult {
  declarations: GitlabImageReference[];
  unclassified: GitlabUnclassifiedReference[];
}

/**
 * Pure, bounded parser for GitLab CI image and service references.
 *
 * GitLab values are always unclassified because decision 0014 approves no GitLab lifecycle source. Dynamic
 * values are classified first, then floating aliases, then literal GitLab references. Unresolved YAML aliases,
 * merge keys, malformed YAML, unrelated keys, and non-string values are ignored rather than evaluated.
 */
export function parseGitlabCi(contents: string): GitlabCiParseResult {
  const empty: GitlabCiParseResult = { declarations: [], unclassified: [] };
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return empty;

  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return empty;

    const references: GitlabImageReference[] = [];
    const root = document.contents;
    collectImage(root.get("image", true), lineCounter, references);
    collectPool(root.get("default", true), lineCounter, references);
    collectServices(root.get("services", true), lineCounter, references);

    for (const item of root.items) {
      if (!isScalar(item.key) || typeof item.key.value !== "string") continue;
      const key = item.key.value;
      if (["image", "services", "stages", "variables", "workflow", "include", "default"].includes(key)) continue;
      if (!isMap(item.value)) continue;
      collectImage(item.value.get("image", true), lineCounter, references);
      collectPool(item.value.get("default", true), lineCounter, references);
      collectServices(item.value.get("services", true), lineCounter, references);
    }

    const unclassified = references.map((reference) => ({ ...reference, reason: classify(reference.value) }));
    return { declarations: [], unclassified };
  } catch {
    return empty;
  }
}

function collectImage(node: unknown, lineCounter: LineCounter, references: GitlabImageReference[]): void {
  if (isMap(node)) {
    collectImage(node.get("name", true), lineCounter, references);
    return;
  }
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return;
  addReference(node.value, node.range[0], lineCounter, references);
}

function collectPool(node: unknown, lineCounter: LineCounter, references: GitlabImageReference[]): void {
  if (!isMap(node)) return;
  collectImage(node.get("image", true), lineCounter, references);
  collectServices(node.get("services", true), lineCounter, references);
}

function collectServices(node: unknown, lineCounter: LineCounter, references: GitlabImageReference[]): void {
  if (isScalar(node)) {
    if (typeof node.value === "string" && node.range) addReference(node.value, node.range[0], lineCounter, references);
    return;
  }
  if (!isMap(node) && !isSeq(node)) return;
  const items = isSeq(node) ? node.items : node.items.map((item) => item.value);
  for (const item of items) {
    if (isScalar(item)) {
      if (typeof item.value === "string" && item.range) addReference(item.value, item.range[0], lineCounter, references);
    } else if (isMap(item)) {
      collectImage(item.get("name", true), lineCounter, references);
    }
  }
}

function addReference(value: string, offset: number, lineCounter: LineCounter, references: GitlabImageReference[]): void {
  const line = lineCounter.linePos(offset).line;
  if (value.length <= MAXIMUM_LINE_LENGTH) references.push({ value, line });
}

function classify(value: string): GitlabUnclassifiedReason {
  if (value.includes("$") || value.includes("<<")) return "dynamic";
  if (value === "latest" || value.endsWith("-latest") || value.endsWith(":latest")) return "floating";
  return "gitlab-not-judged";
}
