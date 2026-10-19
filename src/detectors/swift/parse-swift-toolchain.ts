/**
 * Pure, bounded parsers for the toolchain a project pins in `.swift-version` and `.xcode-version`.
 *
 * Both return the pin exactly as written with its 1-based line. Moving names (`latest`, `stable`),
 * non-numeric tokens, comments, blank files, more than one pin in a file, and malformed input return
 * nothing. The parsers never evaluate contents or run Swift / Xcode tooling.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

/** A release-style pin such as `5.9`, `5.9.2`, or `15.4`. */
export const PINNED_TOOLCHAIN_VERSION = /^[0-9]+\.[0-9]+(?:\.[0-9]+)*$/;

export interface SwiftToolchainDeclaration {
  /** The pinned version, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

function parseSinglePin(contents: string): SwiftToolchainDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: SwiftToolchainDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const value = rawLine.trim();
    if (value === "" || value.startsWith("#")) continue;
    if (!PINNED_TOOLCHAIN_VERSION.test(value)) return [];
    declarations.push({ value, line: index + 1 });
  }
  return declarations.length === 1 ? declarations : [];
}

/** Parse the one Swift version pinned by a `.swift-version` file. */
export function parseSwiftVersion(contents: string): SwiftToolchainDeclaration[] {
  return parseSinglePin(contents);
}

/** Parse the one Xcode version pinned by a `.xcode-version` file. */
export function parseXcodeVersion(contents: string): SwiftToolchainDeclaration[] {
  return parseSinglePin(contents);
}
