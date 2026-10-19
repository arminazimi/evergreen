import { MAXIMUM_INPUT_BYTES, member, readJsonLines, type JsonNode } from "./json-lines.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from `composer.json`: `require.php`,
 * `config.platform.php`, and direct packages in `require` / `require-dev`.
 *
 * Each declaration reports the constraint exactly as written, with its 1-based line. Package names must be
 * `vendor/name`. The `php` key under `require` is the runtime constraint, not a package. Extensions
 * (`ext-*`), floating `*`, dynamic `${…}` values, non-string constraints, `extra.php`, and other
 * `config.platform.*` keys return nothing. A malformed file returns nothing. Nothing is evaluated and
 * Composer is never run.
 */

export { MAXIMUM_INPUT_BYTES };

export interface ComposerPhpRequirement {
  kind: "require-php";
  /** The PHP constraint exactly as written, such as `>=7.4`. */
  value: string;
  /** The 1-based line of the constraint string. */
  line: number;
}

export interface ComposerPlatformPhp {
  kind: "platform-php";
  /** The platform PHP version exactly as written. */
  value: string;
  /** The 1-based line of the version string. */
  line: number;
}

export interface ComposerPackageDeclaration {
  kind: "package";
  /** The package name (`vendor/name`) exactly as written. */
  name: string;
  /** The version constraint exactly as written. */
  value: string;
  /** Whether the package came from `require-dev`. */
  dev: boolean;
  /** The 1-based line of the constraint string. */
  line: number;
}

export type ComposerJsonDeclaration = ComposerPhpRequirement | ComposerPlatformPhp | ComposerPackageDeclaration;

const PACKAGE_NAME = /^[a-z0-9]([_.-]?[a-z0-9]+)*\/[a-z0-9](([_.]|-{1,2})?[a-z0-9]+)*$/i;

function literalConstraint(node: JsonNode | undefined): { value: string; line: number } | undefined {
  if (node?.kind !== "string") return undefined;
  const value = node.value.trim();
  if (value === "" || value === "*" || value.includes("${")) return undefined;
  return { value, line: node.line };
}

function packagesFrom(section: JsonNode | undefined, dev: boolean): ComposerPackageDeclaration[] {
  if (section?.kind !== "object") return [];
  const packages: ComposerPackageDeclaration[] = [];
  for (const entry of section.members) {
    if (entry.key === "php" || entry.key.startsWith("ext-")) continue;
    if (!PACKAGE_NAME.test(entry.key)) continue;
    const constraint = literalConstraint(entry.value);
    if (!constraint) continue;
    packages.push({
      kind: "package",
      name: entry.key,
      value: constraint.value,
      dev,
      line: constraint.line,
    });
  }
  return packages;
}

/**
 * Parse `require.php`, direct packages in `require` / `require-dev`, and `config.platform.php`.
 * Unsupported and malformed forms return nothing for those parts (or everything, when the file is invalid).
 */
export function parseComposerJson(contents: string): ComposerJsonDeclaration[] {
  const root = readJsonLines(contents);
  if (root?.kind !== "object") return [];

  const declarations: ComposerJsonDeclaration[] = [];
  const require = member(root, "require")?.value;
  const php = literalConstraint(member(require, "php")?.value);
  if (php) {
    declarations.push({ kind: "require-php", value: php.value, line: php.line });
  }
  declarations.push(...packagesFrom(require, false));
  declarations.push(...packagesFrom(member(root, "require-dev")?.value, true));

  const platformPhp = literalConstraint(member(member(member(root, "config")?.value, "platform")?.value, "php")?.value);
  if (platformPhp) {
    declarations.push({ kind: "platform-php", value: platformPhp.value, line: platformPhp.line });
  }
  return declarations;
}
