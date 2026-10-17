import { jdkDeclaration } from "./jdk-version.js";
import type { DynamicJdkDeclaration, JdkDeclaration } from "./jdk-version.js";

/**
 * Pure, bounded parsers for the files that pin a JDK: `.java-version` (jenv), `.sdkmanrc` (SDKMAN), and
 * `.tool-versions` (asdf, mise). Only the Java entry is read; other tools are ignored.
 *
 * The vendor in the value (`temurin-`, `-tem`) is ignored and never used to decide support. `latest`,
 * `system`, and `lts` are dynamic, a `path:` or `ref:` entry is skipped, and a value that does not start with
 * a feature release, a binary file, and a missing value produce nothing. Nothing is installed or run.
 */

export const MAXIMUM_INPUT_BYTES = 64 * 1024;
export const MAXIMUM_LINE_LENGTH = 256;

export type PinDeclaration = JdkDeclaration | DynamicJdkDeclaration;

function logicalLines(contents: string): Array<{ text: string; line: number }> {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  return text
    .split(/\r\n|\n|\r/)
    .map((value, index) => ({ text: value.trim(), line: index + 1 }))
    .filter(({ text }) => text !== "" && !text.startsWith("#") && text.length <= MAXIMUM_LINE_LENGTH);
}

/** The first non-comment line of a `.java-version` file. */
export function parseJavaVersion(contents: string): PinDeclaration[] {
  const first = logicalLines(contents)[0];
  const declaration = first && jdkDeclaration("pin", first.text, first.line);
  return declaration ? [declaration] : [];
}

/** The `java=` entry of a `.sdkmanrc` file. */
export function parseSdkmanrc(contents: string): PinDeclaration[] {
  for (const { text, line } of logicalLines(contents)) {
    const match = /^java\s*=\s*(\S+)$/.exec(text);
    if (!match) continue;
    const declaration = jdkDeclaration("pin", match[1]!, line);
    return declaration ? [declaration] : [];
  }
  return [];
}

/** The first version of the `java` entry of a `.tool-versions` file. */
export function parseToolVersions(contents: string): PinDeclaration[] {
  for (const { text, line } of logicalLines(contents)) {
    const [tool, version] = text.replace(/\s+#.*$/, "").split(/\s+/);
    if (tool !== "java" || !version || /^(?:path|ref):/.test(version)) continue;
    const declaration = jdkDeclaration("pin", version, line);
    return declaration ? [declaration] : [];
  }
  return [];
}
