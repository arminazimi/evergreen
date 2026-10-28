import { accessSync } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function findPackageFile(path: string, moduleUrl: string): Promise<string> {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const candidate = resolve(directory, path);
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Evergreen package file not found: ${path}`);
    directory = parent;
  }
}

/** Synchronous form of findPackageFile, for module initialisation. */
export function findPackageFileSync(path: string, moduleUrl: string): string {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const candidate = resolve(directory, path);
    try {
      accessSync(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Evergreen package file not found: ${path}`);
    directory = parent;
  }
}

/** The most bytes of one repository file this module reads, so an oversized manifest costs one stat, never a read of the whole file. Mirrors MAXIMUM_INPUT_BYTES in detectors/json-lines.ts, which this root module must not import. */
export const MAXIMUM_READ_BYTES = 1024 * 1024;

/** The deepest object or array nesting this module parses from repository JSON. Deeper input is skipped rather than parsed, because recursive walkers of a too-deep value exhaust the stack (verified: a 500,000-deep parsed array kills JSON.stringify and any visit()-style walk with RangeError). Mirrors MAXIMUM_DEPTH in detectors/json-lines.ts. */
export const MAXIMUM_JSON_DEPTH = 64;

/** The limit a piece of repository input crossed, as a value callers can assert on and report. */
export type InputLimitReason = "file-too-large" | "nesting-too-deep";

/** Input that crossed a limit and was left unread or unparsed. `detail` names the measured size and the limit for people. */
export interface SkippedInput {
  reason: InputLimitReason;
  detail: string;
}

/** Either the text that was read, or the limit crossing that stopped the read. */
export type BoundedReadResult =
  | { contents: string; skipped: undefined }
  | { contents: undefined; skipped: SkippedInput };

/** Either the parsed JSON value, or the limit crossing that stopped the parse. */
export type BoundedParseResult =
  | { value: unknown; skipped: undefined }
  | { value: undefined; skipped: SkippedInput };

/**
 * Reads one repository file, stopping at MAXIMUM_READ_BYTES: the file is statted first, so an oversized
 * file is never read whole. Repository contents are untrusted input, returned for parsing only. A missing
 * file reads as undefined, as it does for the npm detector's readOptional; other errors propagate.
 */
export async function readBoundedFile(path: string): Promise<BoundedReadResult | undefined> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  if (size > MAXIMUM_READ_BYTES) {
    return {
      contents: undefined,
      skipped: {
        reason: "file-too-large",
        detail: `file is ${size} bytes, above the ${MAXIMUM_READ_BYTES}-byte limit`,
      },
    };
  }

  return { contents: await readFile(path, "utf8"), skipped: undefined };
}

/**
 * The deepest object or array nesting in JSON text. Brackets inside strings do not count, and an escaped
 * character never ends a string. Iterative, so measuring hostile input cannot itself exhaust the stack.
 * (private helper, not exported — same role as the token scan inside declarationLine in detectors/npm.ts)
 */
function jsonNestingDepth(contents: string): number {
  let depth = 0;
  let maximum = 0;
  let inString = false;

  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index]!;
    if (inString) {
      if (char === "\\") {
        index += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
      if (depth > maximum) maximum = depth;
    } else if (char === "}" || char === "]") {
      depth -= 1;
    }
  }

  return maximum;
}

/**
 * Parses untrusted JSON after measuring its nesting, so a document deeper than MAXIMUM_JSON_DEPTH is
 * returned as a skip instead of a value that recursive walkers cannot walk. Expects text from
 * readBoundedFile, which has already bounded its size (the parse itself does not re-measure bytes).
 * Returns undefined when the text is not valid JSON, as readJsonLines does for the detectors.
 */
export function parseBoundedJson(contents: string): BoundedParseResult | undefined {
  const depth = jsonNestingDepth(contents);
  if (depth > MAXIMUM_JSON_DEPTH) {
    return {
      value: undefined,
      skipped: {
        reason: "nesting-too-deep",
        detail: `JSON nesting is ${depth} levels deep, above the ${MAXIMUM_JSON_DEPTH}-level limit`,
      },
    };
  }

  try {
    return { value: JSON.parse(contents), skipped: undefined };
  } catch {
    return undefined;
  }
}
