import type { GradleWrapperDeclaration } from "./jdk-version.js";

/**
 * Pure, bounded parser for `gradle/wrapper/gradle-wrapper.properties`.
 *
 * Reads the Gradle version from the file name in `distributionUrl`
 * (`gradle-8.5-bin.zip`). The file is a Java properties file: `key=value` or `key: value`, `#` and `!`
 * comments, `\` line continuations, and `\:` escapes; the last value of a key wins. A URL whose file
 * name does not carry a version, a binary file, and a missing value produce nothing. Nothing is downloaded.
 */

export const MAXIMUM_INPUT_BYTES = 64 * 1024;
export const MAXIMUM_VALUE_LENGTH = 2048;

const DISTRIBUTION = /(?:^|\/)gradle-(\d+(?:\.\d+){1,2}(?:-[A-Za-z0-9.]+)*)-(?:bin|all)\.zip$/;

/** Parse the wrapper properties without file, network, or process I/O. */
export function parseWrapper(contents: string): GradleWrapperDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES || contents.includes("\0")) return [];

  try {
    const lines = contents.split(/\r\n|\n|\r/);
    let found: { value: string; line: number } | undefined;
    for (let index = 0; index < lines.length; index++) {
      const start = index + 1;
      let text = lines[index]!.trimStart();
      if (text === "" || text.startsWith("#") || text.startsWith("!")) continue;
      // A line ending in an odd number of backslashes continues on the next line.
      while (/(?:^|[^\\])(?:\\\\)*\\$/.test(text) && index + 1 < lines.length) {
        text = text.slice(0, -1) + lines[++index]!.trimStart();
      }
      const separator = /^((?:[^=:\s\\]|\\.)+)\s*[=:\s]\s*(.*)$/.exec(text);
      if (separator?.[1] === "distributionUrl") found = { value: separator[2]!.trimEnd(), line: start };
    }
    if (!found || found.value.length === 0 || found.value.length > MAXIMUM_VALUE_LENGTH) return [];
    const url = found.value.replace(/\\(.)/g, "$1");
    const version = DISTRIBUTION.exec(url)?.[1];
    return version ? [{ kind: "gradle-wrapper", value: version, url, line: found.line }] : [];
  } catch {
    return [];
  }
}
