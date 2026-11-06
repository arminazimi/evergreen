import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node, Scalar, YAMLMap, YAMLSeq } from "yaml";

/**
 * Reads the `node-version` input of `actions/setup-node` steps from one workflow file. The workflow is parsed, never
 * evaluated. A `${{ matrix.<key> }}` input is followed to the literal list under `strategy.matrix.<key>` of the same
 * job; any other expression is reported as one and left to the caller to leave unclassified. Each entry carries the
 * line of the version itself, so a list points at the row that holds the version.
 */

export interface SetupNodeVersion {
  /** One version as written (`16`, `20.x`, `18.17.0`), or an expression. */
  value: string;
  line: number;
  expression: boolean;
}

const SETUP_NODE = /^actions\/setup-node@/i;
const MATRIX_REFERENCE = /^\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}$/;

/** The text a scalar was written as: YAML reads `16.10` as the number 16.1, so numbers use their source. */
function textOf(node: Node): string | undefined {
  if (!isScalar(node)) return undefined;
  if (typeof node.value === "string") return node.value.trim();
  if (typeof node.value === "number") return (node.source ?? String(node.value)).trim();
  return undefined;
}

/** The `node-version` node of a `actions/setup-node` step, or undefined for any other step. */
export function setupNodeInput(step: unknown): Scalar | undefined {
  if (!isMap(step)) return undefined;
  const uses = step.get("uses");
  if (typeof uses !== "string" || !SETUP_NODE.test(uses)) return undefined;
  const inputs = step.get("with", true);
  if (!isMap(inputs)) return undefined;
  const version = inputs.get("node-version", true) as Node | null;
  return version && isScalar(version) ? version : undefined;
}

/** The list under `strategy.matrix.<key>` a `${{ matrix.<key> }}` input points at, if the job has one. */
export function matrixList(job: YAMLMap, version: Scalar): YAMLSeq | undefined {
  const key = typeof version.value === "string" ? MATRIX_REFERENCE.exec(version.value.trim())?.[1] : undefined;
  if (key === undefined) return undefined;
  const strategy = job.get("strategy", true);
  const matrix = isMap(strategy) ? strategy.get("matrix", true) : undefined;
  const list = isMap(matrix) ? matrix.get(key, true) : undefined;
  return isSeq(list) ? list : undefined;
}

export function setupNodeVersions(contents: string): SetupNodeVersion[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false, keepSourceTokens: true });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];

  const versions: SetupNodeVersion[] = [];
  const add = (node: Node | null | undefined): void => {
    if (!node) return;
    const value = textOf(node);
    if (value === undefined || value === "") return;
    versions.push({ value, line: lineCounter.linePos(node.range?.[0] ?? 0).line, expression: value.includes("${{") });
  };
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    const steps = job.value.get("steps", true);
    if (!isSeq(steps)) continue;
    for (const step of steps.items) {
      const version = setupNodeInput(step);
      if (!version) continue;
      const list = matrixList(job.value, version);
      if (list) for (const item of list.items) add(item as Node);
      else add(version);
    }
  }
  return versions;
}

/** The release line a `node-version` entry names, as the lowest and highest version it can stand for. */
export type NodeVersionClass =
  | { kind: "versions"; lowest: string; highest: string }
  | { kind: "unclassified"; reason: string };

const UNBOUNDED = 999_999;
const LITERAL = /^v?(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/i;

export function classifyNodeVersion(value: string): NodeVersionClass {
  const match = LITERAL.exec(value);
  if (!match)
    return { kind: "unclassified", reason: `"${value}" is not a plain version, so Evergreen does not read it` };
  const [, major, minor, patch] = match;
  const open = (part: string | undefined): boolean => part === undefined || /^[x*]$/i.test(part);
  if (open(minor)) return { kind: "versions", lowest: `${major}.0.0`, highest: `${major}.${UNBOUNDED}.${UNBOUNDED}` };
  if (open(patch))
    return { kind: "versions", lowest: `${major}.${minor}.0`, highest: `${major}.${minor}.${UNBOUNDED}` };
  return { kind: "versions", lowest: `${major}.${minor}.${patch}`, highest: `${major}.${minor}.${patch}` };
}
