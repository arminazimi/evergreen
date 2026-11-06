import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  type GoToolchainDeclaration,
  type GoVersionDeclaration,
  versionDirective,
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

/** A block that opened on an earlier line, and whether a nested block was seen. */
interface WorkState {
  block: "use" | "replace" | undefined;
  malformed: boolean;
}

/** The `use` or `replace` block a line opens, if any. */
function blockName(code: string): "use" | "replace" | undefined {
  const match = /^(use|replace)\s*\($/.exec(code);
  if (match?.[1] === "use") return "use";
  if (match?.[1] === "replace") return "replace";
  return undefined;
}

/** One go.work line as its declaration, if any; block lines only move the block state. */
function workLine(code: string, line: number, state: WorkState): GoWorkDeclaration | undefined {
  if (state.block) {
    if (code === ")") state.block = undefined;
    else if (/^(?:use|replace)\s*\($/.test(code)) state.malformed = true;
    return undefined;
  }

  const start = blockName(code);
  if (start) {
    state.block = start;
    return undefined;
  }
  if (code === ")") {
    state.malformed = true;
    return undefined;
  }

  const directive = code.match(/^(go|toolchain)\s+(\S+)$/);
  if (directive) return versionDirective(directive, line);
  return undefined;
}

/** Parse supported go.work declarations without file, network, or process I/O. */
export function parseGoWork(contents: string): GoWorkDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GoWorkDeclaration[] = [];
  const state: WorkState = { block: undefined, malformed: false };
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const code = rawLine.replace(/\/\/.*$/, "").trim();
    const declaration = workLine(code, index + 1, state);
    if (declaration) declarations.push(declaration);
  }

  if (state.block || state.malformed) return [];
  return declarations;
}
