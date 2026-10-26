/**
 * Pure, bounded parsers for the Elixir and Erlang/OTP runtimes a project pins in `.tool-versions`.
 *
 * Comments and unrelated tools are ignored. Moving names (`system`, `latest`), dynamic values, and malformed
 * input return nothing. The parsers never evaluate contents or run Elixir, Erlang, asdf, or Mix.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface ElixirRuntimeDeclaration {
  kind: "elixir" | "erlang";
  /** The pinned runtime, exactly as written (without an asdf `elixir …-otp-N` OTP suffix on the Elixir side). */
  value: string;
  /** The 1-based source line. */
  line: number;
}

/** `1.14`, `1.14.5`, and the asdf `1.14.5-otp-25` form (OTP suffix stripped before matching). */
export const PINNED_ELIXIR_VERSION = /^[1-9][0-9]*\.[0-9]+(?:\.[0-9]+)?(?:-otp-[1-9][0-9]*)?$/;

/** `25`, `25.3`, and `25.3.2`. */
export const PINNED_ERLANG_VERSION = /^[1-9][0-9]*(?:\.[0-9]+)?(?:\.[0-9]+)?$/;

/** Strip the asdf OTP build suffix so the remaining text is a semver Elixir version. */
export function elixirVersion(value: string): string {
  const otp = value.lastIndexOf("-otp-");
  return otp === -1 ? value : value.slice(0, otp);
}

/** The OTP major written after `-otp-` in an asdf Elixir pin, when present. */
export function otpFromElixirPin(value: string): string | undefined {
  const match = /-otp-([1-9][0-9]*)$/.exec(value);
  return match?.[1];
}

/**
 * Parse every pinned Elixir and Erlang version in a `.tool-versions` file. An `elixir` line with an
 * `-otp-N` suffix also yields an Erlang declaration for that major. If any token on a tool's line is
 * unsupported, that line returns nothing rather than a partial result.
 */
export function parseToolVersions(contents: string): ElixirRuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: ElixirRuntimeDeclaration[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    if (rawLine.length > MAXIMUM_LINE_LENGTH) continue;
    const text = rawLine.split("#", 1)[0]!.trim();
    if (text === "") continue;
    const [tool, ...versions] = text.split(/\s+/);
    const line = index + 1;

    if (tool === "elixir") {
      if (versions.length === 0 || versions.some((version) => !PINNED_ELIXIR_VERSION.test(version))) continue;
      for (const raw of versions) {
        declarations.push({ kind: "elixir", value: elixirVersion(raw), line });
        const otp = otpFromElixirPin(raw);
        if (otp) declarations.push({ kind: "erlang", value: otp, line });
      }
      continue;
    }

    if (tool === "erlang") {
      if (versions.length === 0 || versions.some((version) => !PINNED_ERLANG_VERSION.test(version))) continue;
      for (const value of versions) declarations.push({ kind: "erlang", value, line });
    }
  }
  return declarations;
}
