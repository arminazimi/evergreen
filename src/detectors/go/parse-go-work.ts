import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseVersionDirective,
  type GoToolchainDeclaration,
  type GoVersionDeclaration,
} from "./parse-go-mod.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from go.work.
 *
 * Unsupported forms produce no declaration: dynamic values, non-version
 * toolchains, unknown directives, and malformed use or replace blocks. The
 * parser never evaluates contents or executes Go tooling.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export type GoWorkDeclaration = GoVersionDeclaration | GoToolchainDeclaration;

/** Parse supported go.work declarations without file, network, or process I/O. */
export function parseGoWork(contents: string): GoWorkDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GoWorkDeclaration[] = [];
  let block: "use" | "replace" | undefined;
  let malformed = false;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const code = rawLine.replace(/\/\/.*$/, "").trim();
    const line = index + 1;

    if (block) {
      if (code === ")") block = undefined;
      else if (/^(?:use|replace)\s*\($/.test(code)) malformed = true;
      continue;
    }

    const blockStart = code.match(/^(use|replace)\s*\($/);
    if (blockStart?.[1] === "use" || blockStart?.[1] === "replace") {
      block = blockStart[1];
      continue;
    }
    if (code === ")") {
      malformed = true;
      continue;
    }

    const directive = parseVersionDirective(code, line);
    if (directive) declarations.push(directive);
  }

  return block || malformed ? [] : declarations;
}
