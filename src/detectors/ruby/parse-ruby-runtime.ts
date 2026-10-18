/**
 * Pure, bounded parsers for the Ruby runtime a project pins in `.ruby-version` and `.tool-versions`.
 *
 * Both return the runtime exactly as written with its 1-based line. Moving names (`system`, `latest`), dynamic
 * values, comments, unrelated tools, and malformed input return nothing. The parsers never evaluate contents or
 * run Ruby, rbenv, or asdf.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface RubyRuntimeDeclaration {
  /** The pinned runtime, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/** `3.2` (a release line), `3.2.2`, `3.2.2p53`, and the rbenv `ruby-3.2.2` form. `system`, `latest`, and templates do not match. */
export const PINNED_RUBY_VERSION = /^(?:ruby-)?[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)*(?:p[0-9]+)?$/;

/**
 * Parse the one runtime pinned by a `.ruby-version` file. Blank lines and full-line comments are ignored; a file
 * with no supported version, more than one version, or an unsupported line returns nothing.
 */
export function parseRubyVersion(contents: string): RubyRuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: RubyRuntimeDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const value = rawLine.trim();
    if (value === "" || value.startsWith("#")) continue;
    if (!PINNED_RUBY_VERSION.test(value)) return [];
    declarations.push({ value, line: index + 1 });
  }
  return declarations.length === 1 ? declarations : [];
}

/**
 * Parse every pinned Ruby version in a `.tool-versions` file. Comments and other tools are ignored. A `ruby`
 * line may list several fallback versions; if any token on that line is unsupported, the whole line returns
 * nothing rather than a partial result.
 */
export function parseToolVersions(contents: string): RubyRuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: RubyRuntimeDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const text = rawLine.split("#", 1)[0]!.trim();
    if (text === "") continue;
    const [tool, ...versions] = text.split(/\s+/);
    if (tool !== "ruby" || versions.length === 0 || versions.some((version) => !PINNED_RUBY_VERSION.test(version))) continue;
    for (const value of versions) declarations.push({ value, line: index + 1 });
  }
  return declarations;
}
