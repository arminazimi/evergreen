import { LineCounter, isMap, isScalar, isSeq, parseDocument, visit } from "yaml";

import { isInterpolated, parseImageReference } from "../container/parse-image.js";

/**
 * Pure, bounded parser for shell and image declarations in GitHub Actions workflow files.
 *
 * Reads a literal string at `jobs.<id>.steps[].shell`, `jobs.<id>.defaults.run.shell`,
 * and `defaults.run.shell`, plus pinned PowerShell (`mcr.microsoft.com/powershell`) and
 * Bash (Docker Hub `bash`) images at `jobs.<id>.container` and `jobs.<id>.services.<name>.image`.
 * Expression values (`${{ ... }}`), matrix lists, environment keys, comments, images without
 * a tag, other images, YAML aliases, and invalid YAML return nothing. The parser never
 * evaluates contents and never executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;

export interface WorkflowShellDeclaration {
  kind: "shell";
  /** The shell exactly as written, for example `pwsh` or `bash -e {0}`. */
  value: string;
  /** The 1-based line of the value. */
  line: number;
}

export interface WorkflowImageDeclaration {
  kind: "image";
  product: "powershell" | "bash";
  /** The image tag exactly as written, for example `7.4-ubuntu-22.04`. */
  value: string;
  /** The 1-based line of the image string. */
  line: number;
}

export type WorkflowDeclaration = WorkflowShellDeclaration | WorkflowImageDeclaration;

/** Parse shell and image declarations from a workflow file without file, network, or process I/O. */
export function parseWorkflow(contents: string): WorkflowDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lineCounter = new LineCounter();
    const document = parseDocument(contents, { lineCounter, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    // Aliases would make a line point at text that is not the value; read none.
    if (containsAlias(document)) return [];

    const declarations: WorkflowDeclaration[] = [];
    readShell(document.contents.get("defaults", true), lineCounter, declarations);
    const jobs = document.contents.get("jobs", true);
    if (isMap(jobs)) {
      for (const job of jobs.items) readJob(job.value, lineCounter, declarations);
    }
    return declarations.sort((a, b) => a.line - b.line);
  } catch {
    return [];
  }
}

function containsAlias(document: ReturnType<typeof parseDocument>): boolean {
  let aliased = false;
  visit(document, {
    Alias: () => {
      aliased = true;
      return visit.BREAK;
    },
  });
  return aliased;
}

/** A non-empty literal string value with its 1-based line, or undefined for an expression, a non-string, or a missing value. */
function readLiteral(node: unknown, lineCounter: LineCounter): { value: string; line: number } | undefined {
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return undefined;
  const value = node.value.trim();
  if (value.length === 0 || value.includes("${{")) return undefined;
  return { value, line: lineCounter.linePos(node.range[0]).line };
}

/** A shell declared under `run.shell` of a `defaults` mapping. */
function readShell(defaults: unknown, lineCounter: LineCounter, out: WorkflowDeclaration[]): void {
  if (!isMap(defaults)) return;
  const run = defaults.get("run", true);
  if (!isMap(run)) return;
  pushShell(run.get("shell", true), lineCounter, out);
}

function pushShell(node: unknown, lineCounter: LineCounter, out: WorkflowDeclaration[]): void {
  const found = readLiteral(node, lineCounter);
  if (found) out.push({ kind: "shell", ...found });
}

/** A pinned PowerShell or Bash image, read from a string or a `{ image: … }` mapping. */
function readImage(node: unknown, lineCounter: LineCounter, out: WorkflowDeclaration[]): void {
  const found = readLiteral(node, lineCounter);
  if (!found || isInterpolated(found.value)) return;
  const reference = parseImageReference(found.value);
  if (!reference || reference.tag === undefined) return;
  const product = pinnedImageProduct(reference.registry, reference.repository);
  if (product) out.push({ kind: "image", product, value: reference.tag, line: found.line });
}

function pinnedImageProduct(registry: string, repository: string): "powershell" | "bash" | undefined {
  if (registry === "mcr.microsoft.com" && repository === "powershell") return "powershell";
  if (registry === "docker.io" && repository === "library/bash") return "bash";
  return undefined;
}

function readJob(job: unknown, lineCounter: LineCounter, out: WorkflowDeclaration[]): void {
  if (!isMap(job)) return;
  readShell(job.get("defaults", true), lineCounter, out);
  const container = job.get("container", true);
  readImage(isMap(container) ? container.get("image", true) : container, lineCounter, out);
  const services = job.get("services", true);
  if (isMap(services)) {
    for (const service of services.items) {
      if (isMap(service.value)) readImage(service.value.get("image", true), lineCounter, out);
    }
  }
  readSteps(job.get("steps", true), lineCounter, out);
}

function readSteps(steps: unknown, lineCounter: LineCounter, out: WorkflowDeclaration[]): void {
  if (!isSeq(steps)) return;
  for (const step of steps.items) {
    if (isMap(step)) pushShell(step.get("shell", true), lineCounter, out);
  }
}
