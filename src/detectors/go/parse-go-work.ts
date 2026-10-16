import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
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

const GO_VERSION = /^[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?$/;
const TOOLCHAIN_VERSION = /^go[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?(?:rc[1-9][0-9]*)?$/;

/** Parse supported go.work declarations without file, network, or process I/O. */
export function parseGoWork(contents: string): GoWorkDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GoWorkDeclaration[] = [];
  let block: "use" | "replace" | undefined;
  let malformed = false;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const code = rawLine.split("//", 1)[0]!.trim();
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

    const directive = code.match(/^(go|toolchain)\s+(\S+)$/);
    if (!directive) continue;
    const [, kind, value] = directive;
    if (kind === "go" && value && GO_VERSION.test(value)) declarations.push({ kind, value, line });
    if (kind === "toolchain" && value && TOOLCHAIN_VERSION.test(value)) declarations.push({ kind, value, line });
  }

  return block || malformed ? [] : declarations;
}

