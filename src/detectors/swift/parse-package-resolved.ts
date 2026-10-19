import { member, readJsonLines } from "../dotnet/json-lines.js";

/**
 * Pure, bounded parser for the resolved package versions in Package.resolved (SwiftPM lock file v2).
 *
 * It returns each pin under `pins` that has a non-empty string `identity` and a string
 * `state.version`, with the 1-based line of that version. The top-level file `"version"` is the
 * format number and is never returned. Unsupported forms return nothing: pins with only
 * `branch` / `revision` and no `version`, `fileSystem` (or other) pins without a version, the
 * legacy v1 `object.pins` shape, a missing or non-array `pins`, and a malformed or truncated file.
 * The parser never evaluates contents or runs SwiftPM.
 */

export { MAXIMUM_INPUT_BYTES } from "../dotnet/json-lines.js";

export interface PackageResolvedPin {
  /** The package identity as written, such as `swift-log`. */
  identity: string;
  /** The resolved version string, exactly as written. */
  value: string;
  /** The 1-based line of the `state.version` value. */
  line: number;
}

/** Parse pinned versions from Package.resolved without file, network, or process I/O. */
export function parsePackageResolved(contents: string): PackageResolvedPin[] {
  const root = readJsonLines(contents);
  const pins = member(root, "pins")?.value;
  if (pins?.kind !== "array") return [];

  const declarations: PackageResolvedPin[] = [];
  for (const pin of pins.items) {
    if (pin.kind !== "object") continue;
    const identity = member(pin, "identity")?.value;
    const version = member(member(pin, "state")?.value, "version")?.value;
    if (identity?.kind !== "string" || identity.value === "") continue;
    if (version?.kind !== "string" || version.value === "") continue;
    declarations.push({ identity: identity.value, value: version.value, line: version.line });
  }
  return declarations;
}
