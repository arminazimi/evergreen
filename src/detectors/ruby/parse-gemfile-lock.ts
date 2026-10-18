import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, PINNED_RUBY_VERSION } from "./parse-ruby-runtime.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from a Gemfile.lock.
 *
 * It returns resolved gems from the `GEM` specs and the runtime in `RUBY VERSION`. `DEPENDENCIES`
 * requirements, `BUNDLED WITH`, and `GIT`/`PATH` specs are not RubyGems versions and return nothing. The
 * parenthesized resolved value is returned exactly as written, including a Bundler platform suffix when
 * present. A truncated spec returns nothing rather than a partial result. The parser never evaluates contents
 * or runs Bundler.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface GemfileLockGemDeclaration {
  kind: "gem";
  /** The gem name, exactly as written. */
  name: string;
  /** The resolved value in parentheses, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export interface GemfileLockRubyDeclaration {
  kind: "ruby";
  /** The runtime from `RUBY VERSION`, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

export type GemfileLockDeclaration = GemfileLockGemDeclaration | GemfileLockRubyDeclaration;

const RESOLVED_GEM = /^ {4}([A-Za-z0-9_.-]+) \(([^()]*)\)$/;

/** Parse supported Gemfile.lock declarations without file, network, or process I/O. */
export function parseGemfileLock(contents: string): GemfileLockDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: GemfileLockDeclaration[] = [];
  let section = "";
  let specs = false;
  let malformed = false;

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;

    if (rawLine !== "" && !/^\s/.test(rawLine)) {
      section = rawLine.trim();
      specs = false;
      continue;
    }

    if (section === "GEM" && rawLine.trim() === "specs:") {
      specs = true;
      continue;
    }

    if (section === "GEM" && specs) {
      const gem = RESOLVED_GEM.exec(rawLine.trimEnd());
      if (gem) {
        if (gem[2] === "") malformed = true;
        else declarations.push({ kind: "gem", name: gem[1]!, value: gem[2]!, line });
        continue;
      }
      if (/^ {4}\S+ \(/.test(rawLine)) malformed = true;
      continue;
    }

    if (section === "RUBY VERSION") {
      const ruby = /^\s*ruby\s+(\S+)\s*$/.exec(rawLine);
      if (ruby && PINNED_RUBY_VERSION.test(ruby[1]!)) declarations.push({ kind: "ruby", value: ruby[1]!, line });
    }
  }

  return malformed ? [] : declarations;
}
