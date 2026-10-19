import { member, readJsonLines } from "../json-lines.js";

/**
 * Pure, bounded parser for the SDK a repository pins in `global.json`: `sdk.version`.
 *
 * It returns the version exactly as written, with its 1-based line. `rollForward`, `allowPrerelease`, and
 * `msbuild-sdks` (whose versions belong to build SDK packages, not to .NET) are never read as the pinned SDK.
 * A missing `sdk`, a version that is not a string, and a malformed file (trailing comma, truncation) return
 * nothing. Nothing is evaluated and `dotnet` is never run.
 */

export interface SdkDeclaration {
  /** The SDK version as written, such as `3.1.426`. */
  value: string;
  /** The 1-based line of the version. */
  line: number;
}

export function parseGlobalJson(contents: string): SdkDeclaration[] {
  const version = member(member(readJsonLines(contents, { comments: true }), "sdk")?.value, "version")?.value;
  return version?.kind === "string" && version.value.trim() !== "" ? [{ value: version.value.trim(), line: version.line }] : [];
}
