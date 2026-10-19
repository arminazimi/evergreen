/**
 * Pure, bounded parser for direct dependencies and the builtin-baseline in vcpkg manifests.
 *
 * vcpkg manifests are JSON. JSON.parse does not report line numbers, so this parser first validates and
 * extracts the structure with JSON.parse, then maps each extracted value back to its source line by searching
 * the original text for the value's literal token, advancing a cursor so repeated values resolve to distinct
 * lines. Only top-level `dependencies` (an array of strings or objects) and top-level `builtin-baseline`
 * (a string) are read.
 *
 * The vcpkg manifest format is strict JSON: no comments and no trailing commas are accepted. A trailing
 * comma (or any other JSON syntax error) makes the whole document invalid, so nothing is returned.
 *
 * A dependency may be a string (the package name) or an object. For objects only `name` and an optional
 * `version>=` are returned; features, `default-features`, `host`, `platform`, and other keys are ignored.
 * `overrides`, feature-scoped `dependencies`, and any other location are ignored.
 *
 * Unsupported or dynamic forms return nothing rather than a guessed value:
 * - comments or trailing commas (invalid JSON);
 * - a `dependencies` value that is not an array;
 * - an array entry that is neither a string nor an object with a string `name`;
 * - a `builtin-baseline` that is not a string;
 * - any value that cannot be mapped to an exact source line.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface VcpkgDependencyDeclaration {
  kind: "vcpkg-dependency";
  /** The package name exactly as written. */
  name: string;
  /** The version constraint exactly as written, or the package name when none is given. */
  value: string;
  /** The 1-based source line of the value. */
  line: number;
}

export interface VcpkgBaselineDeclaration {
  kind: "vcpkg-baseline";
  /** The baseline commit exactly as written. */
  value: string;
  /** The 1-based source line of the baseline. */
  line: number;
}

export type VcpkgDeclaration = VcpkgDependencyDeclaration | VcpkgBaselineDeclaration;

function lineOf(content: string, needle: string, from: number): { line: number; index: number } | undefined {
  const index = content.indexOf(needle, from);
  if (index < 0) return undefined;
  const line = content.slice(0, index).split("\n").length;
  return { line, index: index + needle.length };
}

export function parseVcpkgManifest(content: string): VcpkgDeclaration[] {
  if (content.length > MAXIMUM_INPUT_BYTES) return [];
  const lines = content.split("\n");
  if (lines.some((line) => line.length > MAXIMUM_LINE_LENGTH)) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return [];

  const result: VcpkgDeclaration[] = [];
  const record = parsed as Record<string, unknown>;

  const baseline = record["builtin-baseline"];
  if (typeof baseline === "string") {
    const found = lineOf(content, `"${baseline}"`, 0);
    if (found) {
      // ensure it is the builtin-baseline value by checking the key precedes it
      const keyIndex = content.indexOf('"builtin-baseline"');
      if (keyIndex >= 0 && keyIndex < found.index) {
        result.push({ kind: "vcpkg-baseline", value: baseline, line: found.line });
      }
    }
  }

  const dependencies = record["dependencies"];
  if (Array.isArray(dependencies)) {
    let cursor = 0;
    for (const entry of dependencies) {
      if (typeof entry === "string") {
        const found = lineOf(content, `"${entry}"`, cursor);
        if (found) {
          cursor = found.index;
          result.push({ kind: "vcpkg-dependency", name: entry, value: entry, line: found.line });
        }
      } else if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        const name = obj["name"];
        if (typeof name !== "string") continue;
        const nameFound = lineOf(content, `"${name}"`, cursor);
        if (!nameFound) continue;
        cursor = nameFound.index;

        const version = obj["version>="];
        if (typeof version === "string") {
          const versionFound = lineOf(content, `"${version}"`, cursor);
          if (versionFound) {
            cursor = versionFound.index;
            result.push({ kind: "vcpkg-dependency", name, value: version, line: versionFound.line });
          }
        } else {
          result.push({ kind: "vcpkg-dependency", name, value: name, line: nameFound.line });
        }
      }
    }
  }

  return result;
}
