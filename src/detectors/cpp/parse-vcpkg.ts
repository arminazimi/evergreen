import { member, readJsonLines, type JsonNode } from "./json-lines.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from `vcpkg.json`: the top-level
 * `builtin-baseline` and each direct entry of `dependencies`.
 *
 * Each declaration reports the value exactly as written, with its 1-based line. A string dependency
 * reports the package name on that line. An object dependency reports the `name` and, when present, the
 * `version>=` constraint; the line is the version line when `version>=` is set, otherwise the name line.
 * `default-features`, `features`, `platform`, and `host` are options, not versions, and are ignored.
 *
 * Unsupported forms return nothing rather than a guessed value:
 *
 * - feature-scoped `dependencies` and `overrides` (not top-level direct dependencies);
 * - a top-level `name` / `version` of the manifest itself;
 * - a dependency that is not a non-empty string and not an object with a non-empty string `name`;
 * - a `version>=` that is not a non-empty string;
 * - a malformed file (trailing comma, truncation, non-object root).
 *
 * Nothing is evaluated and `vcpkg` is never run.
 */

export { MAXIMUM_INPUT_BYTES } from "./json-lines.js";

export interface VcpkgBaselineDeclaration {
  kind: "vcpkg-baseline";
  /** The baseline commit exactly as written. */
  value: string;
  /** The 1-based line of the baseline string. */
  line: number;
}

export interface VcpkgDependencyDeclaration {
  kind: "vcpkg-dependency";
  /** The package name exactly as written. */
  name: string;
  /** The `version>=` constraint when present, exactly as written. */
  value?: string;
  /** The 1-based line of `version>=` when set, otherwise of the name. */
  line: number;
}

export type VcpkgDeclaration = VcpkgBaselineDeclaration | VcpkgDependencyDeclaration;

function nonEmptyString(node: JsonNode | undefined): { value: string; line: number } | undefined {
  if (node?.kind !== "string") return undefined;
  const value = node.value.trim();
  return value === "" ? undefined : { value, line: node.line };
}

function dependency(node: JsonNode): VcpkgDependencyDeclaration | undefined {
  if (node.kind === "string") {
    const name = node.value.trim();
    return name === "" ? undefined : { kind: "vcpkg-dependency", name, line: node.line };
  }
  if (node.kind !== "object") return undefined;
  const name = nonEmptyString(member(node, "name")?.value);
  if (!name) return undefined;
  const version = member(node, "version>=")?.value;
  if (version === undefined) {
    return { kind: "vcpkg-dependency", name: name.value, line: name.line };
  }
  const constraint = nonEmptyString(version);
  if (!constraint) return undefined;
  return { kind: "vcpkg-dependency", name: name.value, value: constraint.value, line: constraint.line };
}

/**
 * Parse the top-level `builtin-baseline` and direct `dependencies` from a vcpkg.json. Feature dependencies,
 * overrides, and malformed documents return nothing for those parts (or everything, when the file is invalid).
 */
export function parseVcpkgJson(contents: string): VcpkgDeclaration[] {
  const root = readJsonLines(contents);
  if (root?.kind !== "object") return [];

  const declarations: VcpkgDeclaration[] = [];
  const baseline = nonEmptyString(member(root, "builtin-baseline")?.value);
  if (baseline) {
    declarations.push({ kind: "vcpkg-baseline", value: baseline.value, line: baseline.line });
  }

  const dependencies = member(root, "dependencies")?.value;
  if (dependencies?.kind !== "array") return declarations;
  for (const item of dependencies.items) {
    const declaration = dependency(item);
    if (declaration) declarations.push(declaration);
  }
  return declarations;
}
