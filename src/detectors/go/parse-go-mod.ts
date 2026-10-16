/**
 * Pure, bounded parser for the declarations Evergreen reads from go.mod.
 *
 * Unsupported forms produce no declaration: dynamic values, indirect
 * requirements, non-version toolchains, and malformed require blocks. The
 * parser never evaluates contents or executes Go tooling.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

interface LocatedDeclaration {
  /** The declared value, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export interface GoVersionDeclaration extends LocatedDeclaration {
  kind: "go";
}

export interface GoToolchainDeclaration extends LocatedDeclaration {
  kind: "toolchain";
}

export interface GoRequirementDeclaration extends LocatedDeclaration {
  kind: "require";
  /** The required module path, exactly as written. */
  module: string;
}

export type GoModDeclaration = GoVersionDeclaration | GoToolchainDeclaration | GoRequirementDeclaration;

const GO_VERSION = /^[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?$/;
const TOOLCHAIN_VERSION = /^go[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?(?:rc[1-9][0-9]*)?$/;
const MODULE_PATH = /^[^\s(){}$]+$/;
const MODULE_VERSION = /^v[0-9][0-9A-Za-z.+-]*$/;

function requirement(line: string, lineNumber: number, comment: string): GoRequirementDeclaration | undefined {
  if (/\bindirect\b/.test(comment)) return undefined;
  const parts = line.split(/\s+/);
  if (parts.length !== 2) return undefined;
  const [module, value] = parts;
  if (!module || !value || !MODULE_PATH.test(module) || !MODULE_VERSION.test(value)) return undefined;
  return { kind: "require", module, value, line: lineNumber };
}

/** Parse supported go.mod declarations without file, network, or process I/O. */
export function parseGoMod(contents: string): GoModDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GoModDeclaration[] = [];
  let requireBlock = false;
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const [rawCode = "", ...commentParts] = rawLine.split("//");
    const code = rawCode.trim();
    const comment = commentParts.join("//");
    const line = index + 1;

    if (requireBlock) {
      if (code === ")") {
        requireBlock = false;
        continue;
      }
      if (code === "") continue;
      const parsed = requirement(code, line, comment);
      if (parsed) declarations.push(parsed);
      continue;
    }

    if (code === "require (") {
      requireBlock = true;
      continue;
    }

    const directive = code.match(/^(go|toolchain)\s+(\S+)$/);
    if (directive) {
      const [, kind, value] = directive;
      if (kind === "go" && value && GO_VERSION.test(value)) declarations.push({ kind, value, line });
      if (kind === "toolchain" && value && TOOLCHAIN_VERSION.test(value)) declarations.push({ kind, value, line });
      continue;
    }

    if (code.startsWith("require ")) {
      const parsed = requirement(code.slice("require ".length).trim(), line, comment);
      if (parsed) declarations.push(parsed);
    }
  }

  return requireBlock ? [] : declarations;
}

