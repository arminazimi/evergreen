import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, readTomlLines, stripComment, stringValue } from "./toml-lines.js";

/**
 * Pure, bounded parser for the toolchain a project pins: `channel` in `rust-toolchain.toml` (or a TOML
 * `rust-toolchain`), and the legacy `rust-toolchain` file that holds one channel name.
 *
 * It returns the channel exactly as written. Whether that is an exact release (`1.70.0`), a moving channel
 * (`stable`), or something else is for the caller to decide. Commented-out lines, an empty file, a channel that
 * is not a single literal string, and a malformed file return nothing. Nothing is evaluated and rustup is never run.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface ToolchainDeclaration {
  /** The channel as written, such as `1.70.0`, `stable`, or `nightly-2024-01-01`. */
  value: string;
  /** The 1-based line it is on. */
  line: number;
}

/** Parse the pinned channel from a rust-toolchain(.toml) without file, network, or process I/O. */
export function parseRustToolchain(contents: string): ToolchainDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  // The legacy form is a single line with the channel and no TOML structure.
  const meaningful = contents.split(/\r?\n/).map((raw, index) => ({ text: stripComment(raw).trim(), line: index + 1, long: raw.length > MAXIMUM_LINE_LENGTH }));
  if (meaningful.some((entry) => entry.long)) return [];
  const content = meaningful.filter((entry) => entry.text !== "");
  if (content.length === 1 && /^[A-Za-z0-9._-]+$/.test(content[0]!.text)) {
    return [{ value: content[0]!.text, line: content[0]!.line }];
  }

  const lines = readTomlLines(contents);
  if (!lines) return [];
  const declarations: ToolchainDeclaration[] = [];
  for (const entry of lines) {
    if (entry.table !== "toolchain" || entry.key !== "channel") continue;
    const value = stringValue(entry.value);
    if (value) declarations.push({ value, line: entry.line });
  }
  return declarations;
}
