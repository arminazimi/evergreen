import { MAXIMUM_INPUT_BYTES, member, readJsonLines, type JsonNode } from "../json-lines.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from `composer.lock`: resolved packages in
 * `packages` / `packages-dev` (version and `abandoned`), and `platform.php`.
 *
 * Each locked package reports the version string after trimming ASCII whitespace, with its 1-based line.
 * `abandoned` is `false` when missing or explicitly false, `true` when abandoned without a replacement, or
 * the replacement package name string. When the field is present, `abandonedLine` is its value line.
 * Package names must be `vendor/name` with exactly one `/`. Floating `*`, dynamic `${…}` versions,
 * non-string versions, `platform-dev`, `plugin-api-version`, extensions under `platform`, and other
 * unsupported forms return nothing for those parts. A malformed file returns nothing. Comments are not
 * accepted (strict JSON only). Nothing is evaluated and Composer is never run.
 */

export { MAXIMUM_INPUT_BYTES };

export interface ComposerLockedPackage {
  kind: "locked-package";
  /** The package name (`vendor/name`) exactly as written. */
  name: string;
  /** The resolved version after trim. */
  value: string;
  /** The 1-based line of the version string. */
  line: number;
  /** Whether the package came from `packages-dev`. */
  dev: boolean;
  /**
   * `false` when missing or explicitly false; `true` when abandoned without a replacement; otherwise the
   * replacement package name.
   */
  abandoned: false | true | string;
  /** The 1-based line of the `abandoned` value when that field is present. */
  abandonedLine?: number;
}

export interface ComposerLockPlatformPhp {
  kind: "platform-php";
  /** The platform PHP version after trim. */
  value: string;
  /** The 1-based line of the version string. */
  line: number;
}

export type ComposerLockDeclaration = ComposerLockedPackage | ComposerLockPlatformPhp;

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

function literalVersion(node: JsonNode | undefined): { value: string; line: number } | undefined {
  if (node?.kind !== "string") return undefined;
  const value = node.value.trim();
  if (value === "" || value === "*" || value.includes("${")) return undefined;
  return { value, line: node.line };
}

function abandonedFrom(node: JsonNode | undefined): { abandoned: false | true | string; abandonedLine: number } | undefined {
  if (node === undefined) return undefined;
  if (node.kind === "boolean") return { abandoned: node.value, abandonedLine: node.line };
  if (node.kind === "string") {
    const replacement = node.value.trim();
    if (replacement === "" || replacement.includes("${")) return undefined;
    return { abandoned: replacement, abandonedLine: node.line };
  }
  return undefined;
}

function packagesFrom(section: JsonNode | undefined, dev: boolean): ComposerLockedPackage[] {
  if (section?.kind !== "array") return [];
  const packages: ComposerLockedPackage[] = [];
  for (const item of section.items) {
    if (item.kind !== "object") continue;
    const nameNode = member(item, "name")?.value;
    if (nameNode?.kind !== "string" || !isComposerPackageName(nameNode.value)) continue;
    const version = literalVersion(member(item, "version")?.value);
    if (!version) continue;
    const abandonedField = abandonedFrom(member(item, "abandoned")?.value);
    const declaration: ComposerLockedPackage = {
      kind: "locked-package",
      name: nameNode.value,
      value: version.value,
      line: version.line,
      dev,
      abandoned: abandonedField?.abandoned ?? false,
    };
    if (abandonedField !== undefined) declaration.abandonedLine = abandonedField.abandonedLine;
    packages.push(declaration);
  }
  return packages;
}

/**
 * Parse resolved packages in `packages` / `packages-dev` and `platform.php`.
 * Unsupported and malformed forms return nothing for those parts (or everything, when the file is invalid).
 */
export function parseComposerLock(contents: string): ComposerLockDeclaration[] {
  const root = readJsonLines(contents, { comments: false });
  if (root?.kind !== "object") return [];

  const declarations: ComposerLockDeclaration[] = [];
  declarations.push(...packagesFrom(member(root, "packages")?.value, false));
  declarations.push(...packagesFrom(member(root, "packages-dev")?.value, true));

  const platformPhp = literalVersion(member(member(root, "platform")?.value, "php")?.value);
  if (platformPhp) {
    declarations.push({ kind: "platform-php", value: platformPhp.value, line: platformPhp.line });
  }
  return declarations;
}
