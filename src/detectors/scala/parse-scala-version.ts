/**
 * Pure, bounded parser for the Scala version a project pins in `.scala-version`.
 *
 * Comments, blank lines, and unsupported tokens return nothing. The parser never evaluates contents
 * or runs Scala, sbt, or a version manager.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface ScalaRuntimeDeclaration {
  /** The pinned Scala version, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/** `2.11.12`, `2.13.14`, `3.3.3`. */
export const PINNED_SCALA_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Parse the single pinned Scala version in a `.scala-version` file. A file with more than one
 * version line, or any unsupported token, produces nothing rather than a partial result.
 */
export function parseScalaVersion(contents: string): ScalaRuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: ScalaRuntimeDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const text = rawLine.split("#", 1)[0]!.trim();
    if (text === "") continue;
    if (!PINNED_SCALA_VERSION.test(text)) return [];
    declarations.push({ value: text, line: index + 1 });
  }
  return declarations.length === 1 ? declarations : [];
}
