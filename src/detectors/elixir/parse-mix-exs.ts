import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH } from "./parse-elixir-runtime.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from `mix.exs`: the project `elixir:`
 * constraint and direct Hex deps written as `{:name, "constraint", …}`.
 *
 * Unsupported forms return nothing: git/path/in_umbrella deps, a dep without a quoted constraint,
 * interpolated strings, and dynamic values. The parser never evaluates contents or runs Mix.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface MixExsElixirDeclaration {
  kind: "elixir";
  /** The Elixir constraint after trim, such as `~> 1.14` or `1.14.5`. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export interface MixExsPackageDeclaration {
  kind: "package";
  /** The Hex package name, exactly as written in the atom. */
  name: string;
  /** The version constraint after trim. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export type MixExsDeclaration = MixExsElixirDeclaration | MixExsPackageDeclaration;

const ELIXIR_CONSTRAINT = /^\s*elixir:\s*"([^"#{]*)"\s*,?\s*$/;
const HEX_DEP = /^\s*\{:([a-z][a-z0-9_]*),\s*"([^"#{]*)"(?:\s*,|\s*\})/;

/**
 * Parse the project `elixir:` pin and direct Hex deps with a literal quoted constraint.
 * Unsupported and malformed forms return nothing for those parts.
 */
export function parseMixExs(contents: string): MixExsDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: MixExsDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;
    const withoutComment = rawLine.replace(/\s#.*$/, "");

    const elixir = ELIXIR_CONSTRAINT.exec(withoutComment);
    if (elixir) {
      const value = elixir[1]!.trim();
      if (value !== "") declarations.push({ kind: "elixir", value, line });
      continue;
    }

    const dep = HEX_DEP.exec(withoutComment);
    if (dep) {
      const value = dep[2]!.trim();
      if (value !== "") declarations.push({ kind: "package", name: dep[1]!, value, line });
    }
  }
  return declarations;
}
