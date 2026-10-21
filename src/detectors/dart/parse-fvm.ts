import { member, readJsonLines } from "../json-lines.js";

/**
 * Pure, bounded parsers for the Flutter SDK version pinned by FVM.
 *
 * Modern `.fvmrc` files use the top-level `flutter` key. Legacy
 * `.fvm/fvm_config.json` files use `flutterSdkVersion`. Both files are strict
 * JSON. A malformed document, a non-string value, a release channel, a Git
 * reference, a nested flavor pin, or any unrelated version-looking value
 * returns no declaration. Nothing is evaluated and FVM is never run.
 */

export { MAXIMUM_INPUT_BYTES } from "../json-lines.js";

export interface FvmFlutterDeclaration {
  /** The pinned Flutter version exactly as written, for example `3.47.7`. */
  value: string;
  /** The 1-based line of the version string. */
  line: number;
}

const FLUTTER_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function parsePinnedVersion(contents: string, key: "flutter" | "flutterSdkVersion"): FvmFlutterDeclaration[] {
  const root = readJsonLines(contents, { comments: false });
  if (root?.kind !== "object") return [];

  const version = member(root, key)?.value;
  if (version?.kind !== "string" || !FLUTTER_VERSION.test(version.value)) return [];
  return [{ value: version.value, line: version.line }];
}

/** Parse the top-level `flutter` pin from a modern `.fvmrc`. */
export function parseFvmrc(contents: string): FvmFlutterDeclaration[] {
  return parsePinnedVersion(contents, "flutter");
}

/** Parse the top-level `flutterSdkVersion` pin from a legacy `.fvm/fvm_config.json`. */
export function parseFvmConfigJson(contents: string): FvmFlutterDeclaration[] {
  return parsePinnedVersion(contents, "flutterSdkVersion");
}
