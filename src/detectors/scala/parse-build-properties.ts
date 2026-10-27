/**
 * Pure, bounded parser for the sbt version pinned in `project/build.properties`.
 *
 * It reads `sbt.version=…` on a single line. Comments, blank lines, and other keys are ignored.
 * The parser never evaluates contents or runs sbt.
 */

import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH } from "./parse-scala-version.js";

export interface BuildPropertiesDeclaration {
  kind: "sbt";
  /** The pinned sbt version, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/** `1.9.7`, `0.13.18`, `2.0.0`. */
export const PINNED_SBT_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;

const SBT_VERSION = /^\s*sbt\.version\s*=\s*(\S+)\s*$/;

/**
 * Parse every `sbt.version` pin in a `project/build.properties` file. A line whose value is not an
 * exact version produces nothing for that line.
 */
export function parseBuildProperties(contents: string): BuildPropertiesDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: BuildPropertiesDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const text = rawLine.split("#", 1)[0]!.trim();
    if (text === "") continue;
    const match = SBT_VERSION.exec(text);
    if (!match) continue;
    const value = match[1]!;
    if (!PINNED_SBT_VERSION.test(value)) continue;
    declarations.push({ kind: "sbt", value, line: index + 1 });
  }
  return declarations;
}
