/**
 * Pure, bounded parser for the Scala version declared in `build.sbt`.
 *
 * It reads a literal `scalaVersion := "…"`, `ThisBuild / scalaVersion := "…"`, or the older
 * `scalaVersion in ThisBuild := "…"` form on a single line. Comments, interpolations, and
 * multi-line forms return nothing. The parser never evaluates contents or runs sbt.
 */

import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH } from "./parse-scala-version.js";

export interface BuildSbtDeclaration {
  kind: "scala";
  /** The declared Scala version or constraint, exactly as written inside the quotes. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/**
 * A single-line `scalaVersion` assignment with a literal quoted value. Captures the quoted text
 * and rejects `${…}` interpolations by excluding `$` and `{` from the value.
 */
const SCALA_VERSION_SETTING =
  /^\s*(?:(?:ThisBuild\s*\/\s*)?scalaVersion|scalaVersion\s+in\s+ThisBuild)\s*:=\s*"([^"${]*)"\s*,?\s*$/;

/**
 * Parse every literal `scalaVersion` pin in a `build.sbt` file. A line whose value is empty or
 * contains an interpolation produces nothing for that line.
 */
export function parseBuildSbt(contents: string): BuildSbtDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: BuildSbtDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const withoutComment = rawLine.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    const match = SCALA_VERSION_SETTING.exec(withoutComment);
    if (!match) continue;
    const value = match[1]!.trim();
    if (value === "") continue;
    declarations.push({ kind: "scala", value, line: index + 1 });
  }
  return declarations;
}
