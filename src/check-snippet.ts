import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { builtInDetectors } from "./detectors/index.js";
import type { Finding } from "./domain.js";
import { scanRepository } from "./engine/index.js";

export const CHECK_SNIPPET_SCHEMA_VERSION = "evergreen.check-snippet.v1" as const;

/** The longest repository-relative path a snippet may claim. */
export const MAX_SNIPPET_PATH_LENGTH = 256;
/** The largest snippet content, in bytes, that a single check accepts. */
export const MAX_SNIPPET_CONTENT_BYTES = 1_000_000;

/** The message a clean snippet carries, so a caller can show why nothing was flagged. */
export const NO_FINDINGS_MESSAGE = "No lifecycle findings in this snippet. Evergreen only checks what its rules cover.";

export interface SnippetCheck {
  schemaVersion: typeof CHECK_SNIPPET_SCHEMA_VERSION;
  /** The repository-relative path the snippet was checked as. */
  path: string;
  /** The same finding shape `scan_repository` returns, with paths and lines relative to the snippet. */
  findings: Finding[];
  /** One sentence a person or an agent can show as is. */
  message: string;
}

export class SnippetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnippetInputError";
  }
}

/** Why the snippet input cannot be checked, or undefined when it is well-formed. */
export function snippetInputProblem(path: string, content: string): string | undefined {
  if (path.length === 0) return "path must be a non-empty repository-relative path.";
  if (path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(path)) {
    return `path must be relative to the repository root, not absolute: ${path}`;
  }
  if (path.split(/[\\/]/).includes("..")) {
    return `path must stay inside the repository: ${path}`;
  }
  if (path.length > MAX_SNIPPET_PATH_LENGTH) {
    return `path is longer than ${MAX_SNIPPET_PATH_LENGTH} characters.`;
  }
  if (Buffer.byteLength(content, "utf8") > MAX_SNIPPET_CONTENT_BYTES) {
    return `content is larger than ${MAX_SNIPPET_CONTENT_BYTES} bytes.`;
  }
  return undefined;
}

/**
 * Checks one file snippet in isolation: the content is written as the only file of a temporary
 * directory, at the intended repository-relative path, and every built-in detector reads it there.
 * The real repository is never read or written, and the temporary directory is removed even when
 * the scan throws.
 */
export async function checkSnippet(
  input: { path: string; content: string },
  options: { scan?: typeof scanRepository } = {},
): Promise<SnippetCheck> {
  const { path, content } = input;
  const problem = snippetInputProblem(path, content);
  if (problem) throw new SnippetInputError(problem);

  const scan = options.scan ?? scanRepository;
  const directory = await mkdtemp(join(tmpdir(), "evergreen-snippet-"));
  try {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), content, "utf8");
    const result = await scan(directory, builtInDetectors);
    const findings = result.findings;
    return {
      schemaVersion: CHECK_SNIPPET_SCHEMA_VERSION,
      path,
      findings,
      message:
        findings.length === 0
          ? NO_FINDINGS_MESSAGE
          : `${findings.length} lifecycle finding${findings.length === 1 ? "" : "s"} in this snippet.`,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
