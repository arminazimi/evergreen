import { required } from "../../required.js";
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

/** What the parser carries from one line to the next. */
interface LockState {
  declarations: GemfileLockDeclaration[];
  /** The current top-level section, such as `GEM`, `RUBY VERSION`, or `PLATFORMS`. */
  section: string;
  /** True between `specs:` and the next top-level section. */
  specs: boolean;
  /** Set by a spec line that cannot be read; the whole file then yields nothing. */
  malformed: boolean;
}

/** One resolved gem under `GEM` `specs:`. A line that looks like a spec but cannot be read marks the file malformed. */
function readSpec(state: LockState, rawLine: string, line: number): void {
  const gem = RESOLVED_GEM.exec(rawLine.trimEnd());
  if (!gem) {
    if (/^ {4}\S+ \(/.test(rawLine)) state.malformed = true;
    return;
  }
  const name = required(gem[1], "gem name");
  const value = required(gem[2], "gem version");
  if (value === "") state.malformed = true;
  else state.declarations.push({ kind: "gem", name, value, line });
}

/** The `ruby X.Y.Z` line under `RUBY VERSION`, kept only when it is a pinned release. */
function readRubyVersion(state: LockState, rawLine: string, line: number): void {
  const ruby = /^\s*ruby\s+(\S+)\s*$/.exec(rawLine);
  if (!ruby) return;
  const pinned = required(ruby[1], "ruby version");
  if (PINNED_RUBY_VERSION.test(pinned)) state.declarations.push({ kind: "ruby", value: pinned, line });
}

/** Parse supported Gemfile.lock declarations without file, network, or process I/O. */
export function parseGemfileLock(contents: string): GemfileLockDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const state: LockState = {
    declarations: [],
    section: "",
    specs: false,
    malformed: false,
  };
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const line = index + 1;

    if (rawLine !== "" && !/^\s/.test(rawLine)) {
      state.section = rawLine.trim();
      state.specs = false;
    } else if (state.section === "GEM" && rawLine.trim() === "specs:") {
      state.specs = true;
    } else if (state.section === "GEM" && state.specs) {
      readSpec(state, rawLine, line);
    } else if (state.section === "RUBY VERSION") {
      readRubyVersion(state, rawLine, line);
    }
  }

  return state.malformed ? [] : state.declarations;
}
