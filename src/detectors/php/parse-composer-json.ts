import { MAXIMUM_INPUT_BYTES, member, readJsonLines, type JsonNode } from "./json-lines.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from `composer.json`: `require.php`,
 * `config.platform.php`, and direct packages in `require` / `require-dev`.
 *
 * Each declaration reports the constraint string after trimming ASCII whitespace at both ends, with its
 * 1-based line (trim rejects padding-only values and matches how Composer normalizes constraints; the
 * source line is unchanged). Package names must be `vendor/name` with exactly one `/`. The `php` key
 * under `require` is the runtime constraint, not a package. Extensions (`ext-*`), floating `*`,
 * dynamic `${…}` values, non-string constraints, `extra.php`, and other `config.platform.*` keys
 * return nothing. Duplicate package keys in the same `require` or `require-dev` object keep only the
 * last occurrence (Composer / `JSON.parse` semantics), in first-seen order among distinct names. A
 * malformed file returns nothing. Nothing is evaluated and Composer is never run.
 */

export { MAXIMUM_INPUT_BYTES };

export interface ComposerPhpRequirement {
  kind: "require-php";
  /** The PHP constraint after trim, such as `>=7.4`. */
  value: string;
  /** The 1-based line of the constraint string. */
  line: number;
}

export interface ComposerPlatformPhp {
  kind: "platform-php";
  /** The platform PHP version after trim. */
  value: string;
  /** The 1-based line of the version string. */
  line: number;
}

export interface ComposerPackageDeclaration {
  kind: "package";
  /** The package name (`vendor/name`) exactly as written. */
  name: string;
  /** The version constraint after trim. */
  value: string;
  /** Whether the package came from `require-dev`. */
  dev: boolean;
  /** The 1-based line of the constraint string. */
  line: number;
}

export type ComposerJsonDeclaration = ComposerPhpRequirement | ComposerPlatformPhp | ComposerPackageDeclaration;

const MAXIMUM_PACKAGE_NAME_LENGTH = 256;
/** Vendor segment: alphanumeric runs separated by a single `_`, `.`, or `-`. Linear; no nested quantifiers. */
const VENDOR_SEGMENT = /^[a-z0-9]+(?:[_.-][a-z0-9]+)*$/i;
/** Name segment: same separators, and `--` allowed between alphanumeric runs. Linear; no nested quantifiers. */
const NAME_SEGMENT = /^[a-z0-9]+(?:(?:[_.]|--?)[a-z0-9]+)*$/i;

function isComposerPackageName(key: string): boolean {
  if (key.length === 0 || key.length > MAXIMUM_PACKAGE_NAME_LENGTH) return false;
  const slash = key.indexOf("/");
  if (slash <= 0 || slash !== key.lastIndexOf("/")) return false;
  const vendor = key.slice(0, slash);
  const name = key.slice(slash + 1);
  return vendor.length > 0 && name.length > 0 && VENDOR_SEGMENT.test(vendor) && NAME_SEGMENT.test(name);
}

function literalConstraint(node: JsonNode | undefined): { value: string; line: number } | undefined {
  if (node?.kind !== "string") return undefined;
  const value = node.value.trim();
  if (value === "" || value === "*" || value.includes("${")) return undefined;
  return { value, line: node.line };
}

function packagesFrom(section: JsonNode | undefined, dev: boolean): ComposerPackageDeclaration[] {
  if (section?.kind !== "object") return [];
  // Map keeps first-seen key order; set() on a duplicate updates the value and keeps position.
  const packages = new Map<string, ComposerPackageDeclaration>();
  for (const entry of section.members) {
    if (entry.key === "php" || entry.key.startsWith("ext-")) continue;
    if (!isComposerPackageName(entry.key)) continue;
    const constraint = literalConstraint(entry.value);
    if (!constraint) continue;
    packages.set(entry.key, {
      kind: "package",
      name: entry.key,
      value: constraint.value,
      dev,
      line: constraint.line,
    });
  }
  return [...packages.values()];
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
