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
    let aliased = false;
    visit(document, { Alias: () => { aliased = true; return visit.BREAK; } });
    if (aliased) return [];

    const declarations: WorkflowDeclaration[] = [];
    const literal = (node: unknown): { value: string; line: number } | undefined => {
      if (!isScalar(node) || typeof node.value !== "string" || !node.range) return undefined;
      const value = node.value.trim();
      if (value.length === 0 || value.includes("${{")) return undefined;
      return { value, line: lineCounter.linePos(node.range[0]).line };
    };
    const shell = (defaults: unknown): void => {
      if (!isMap(defaults)) return;
      const run = defaults.get("run", true);
      if (!isMap(run)) return;
      const found = literal(run.get("shell", true));
      if (found) declarations.push({ kind: "shell", ...found });
    };
    const image = (node: unknown): void => {
      const found = literal(node);
      if (!found || isInterpolated(found.value)) return;
      const reference = parseImageReference(found.value);
      if (!reference || reference.tag === undefined) return;
      const product =
        reference.registry === "mcr.microsoft.com" && reference.repository === "powershell"
          ? "powershell"
          : reference.registry === "docker.io" && reference.repository === "library/bash"
            ? "bash"
            : undefined;
      if (product) declarations.push({ kind: "image", product, value: reference.tag, line: found.line });
    };

    shell(document.contents.get("defaults", true));
    const jobs = document.contents.get("jobs", true);
    if (!isMap(jobs)) return declarations;
    for (const job of jobs.items) {
      if (!isMap(job.value)) continue;
      shell(job.value.get("defaults", true));
      const container = job.value.get("container", true);
      image(isMap(container) ? container.get("image", true) : container);
      const services = job.value.get("services", true);
      if (isMap(services)) {
        for (const service of services.items) if (isMap(service.value)) image(service.value.get("image", true));
      }
      const steps = job.value.get("steps", true);
      if (isSeq(steps)) {
        for (const step of steps.items) {
          if (!isMap(step)) continue;
          const found = literal(step.get("shell", true));
          if (found) declarations.push({ kind: "shell", ...found });
        }
      }
    }
    return declarations.sort((a, b) => a.line - b.line);
  } catch {
    return [];
  }
}
