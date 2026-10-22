import { LineCounter, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node } from "yaml";

/**
 * Reads the `dotnet-version` input of `actions/setup-dotnet` steps from one workflow file. The workflow is parsed,
 * never evaluated: an expression such as `${{ matrix.dotnet }}` is reported as one and left to the caller to leave
 * unclassified. Each entry carries the line of the version itself, so a multi-line value points at the right row.
 */

export interface SetupDotnetVersion {
  /** One version as written (`6.0.x`, `8.0.100`), or an expression. */
  value: string;
  line: number;
  expression: boolean;
}

const SETUP_DOTNET = /^actions\/setup-dotnet@/i;

function entriesOf(node: Node, lineOf: (offset: number) => number): SetupDotnetVersion[] {
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return [];
  const first = lineOf(node.range[0]);
  // A block scalar (`|`) starts on the line after its header; any other scalar is on its own line.
  const block = node.type === "BLOCK_LITERAL";
  if (node.type === "BLOCK_FOLDED") return [{ value: node.value.trim(), line: first, expression: true }];
  const entries: SetupDotnetVersion[] = [];
  for (const [index, raw] of node.value.split("\n").entries()) {
    const value = raw.trim();
    if (value === "") continue;
    entries.push({ value, line: block ? first + 1 + index : first, expression: value.includes("${{") });
  }
  return entries;
}

export function setupDotnetVersions(contents: string): SetupDotnetVersion[] {
  const lineCounter = new LineCounter();
  const document = parseDocument(contents, { lineCounter, prettyErrors: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return [];
  const lineOf = (offset: number): number => lineCounter.linePos(offset).line;

  const jobs = document.contents.get("jobs", true);
  if (!isMap(jobs)) return [];
  const versions: SetupDotnetVersion[] = [];
  for (const job of jobs.items) {
    if (!isMap(job.value)) continue;
    const steps = job.value.get("steps", true);
    if (!isSeq(steps)) continue;
    for (const step of steps.items) {
      if (!isMap(step)) continue;
      const uses = step.get("uses");
      if (typeof uses !== "string" || !SETUP_DOTNET.test(uses)) continue;
      const inputs = step.get("with", true);
      if (!isMap(inputs)) continue;
      const version = inputs.get("dotnet-version", true);
      if (version && isScalar(version)) versions.push(...entriesOf(version as Node, lineOf));
    }
  }
  return versions;
}

/** The release line a `dotnet-version` entry names, as the lowest and highest version it can stand for. */
export type DotnetVersionClass =
  | { kind: "versions"; lowest: string; highest: string }
  | { kind: "unclassified"; reason: string };

const UNBOUNDED = 999_999;
const LITERAL = /^(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*|\dxx))?$/i;

export function classifyDotnetVersion(value: string): DotnetVersionClass {
  const match = LITERAL.exec(value);
  if (!match) return { kind: "unclassified", reason: `"${value}" is not a plain version, so Evergreen does not read it` };
  const [, major, minor] = match;
  if (minor === undefined || /^[x*]$/i.test(minor)) {
    return { kind: "versions", lowest: `${major}.0.0`, highest: `${major}.${UNBOUNDED}.${UNBOUNDED}` };
  }
  // 6.0.x, 6.0.4xx (an SDK band), 6.0.100, and 6.0 all name the 6.0 line.
  return { kind: "versions", lowest: `${major}.${minor}.0`, highest: `${major}.${minor}.${UNBOUNDED}` };
}
