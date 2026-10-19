/**
 * Pure, bounded parsers for the PHP runtime a project pins in `.php-version` and `.tool-versions`.
 *
 * Both return the runtime exactly as written with its 1-based line. Moving names (`system`, `latest`), dynamic
 * values, comments, unrelated tools, and malformed input return nothing. The parsers never evaluate contents or
 * run PHP, phpenv, or asdf.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface PhpRuntimeDeclaration {
  /** The pinned runtime, exactly as written. */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/** `8.3` (a release line), `8.3.12`, and the phpenv `php-8.3.12` form. `system`, `latest`, and templates do not match. */
export const PINNED_PHP_VERSION = /^(?:php-)?[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?$/;

/**
 * Parse the one runtime pinned by a `.php-version` file. Blank lines and full-line comments are ignored; a file
 * with no supported version, more than one version, or an unsupported line returns nothing.
 */
export function parsePhpVersion(contents: string): PhpRuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: PhpRuntimeDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const value = rawLine.trim();
    if (value === "" || value.startsWith("#")) continue;
    if (!PINNED_PHP_VERSION.test(value)) return [];
    declarations.push({ value, line: index + 1 });
  }
  return declarations.length === 1 ? declarations : [];
}

/**
 * Parse every pinned PHP version in a `.tool-versions` file. Comments and other tools are ignored. A `php`
 * line may list several fallback versions; if any token on that line is unsupported, the whole line returns
 * nothing rather than a partial result.
 */
export function parseToolVersions(contents: string): PhpRuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: PhpRuntimeDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const text = rawLine.split("#", 1)[0]!.trim();
    if (text === "") continue;
    const [tool, ...versions] = text.split(/\s+/);
    if (tool !== "php" || versions.length === 0 || versions.some((version) => !PINNED_PHP_VERSION.test(version))) continue;
    for (const value of versions) declarations.push({ value, line: index + 1 });
  }
  return declarations;
}
