/**
 * Pure, bounded parsers for the Terraform CLI version pinned in `.terraform-version`
 * (tfenv, tenv) and in the `terraform` entry of `.tool-versions` (asdf, mise).
 *
 * Only a concrete `MAJOR.MINOR.PATCH` version, with an optional prerelease, is a
 * declaration. `latest`, `latest:<regex>`, `min-required`, `system`, `ref:`,
 * `path:`, a partial version such as `1.9`, and a leading `v` return nothing. A
 * `.terraform-version` file holds one version, so a second non-comment line
 * makes the file return nothing. In `.tool-versions` only the tool named exactly
 * `terraform` counts (not `terraformer`), and only its first version, which is
 * the one asdf uses. Nothing is evaluated and no version manager is run.
 */

export const MAXIMUM_INPUT_BYTES = 64 * 1024;
export const MAXIMUM_LINE_LENGTH = 1024;

export interface TerraformCliDeclaration {
  /** The pinned Terraform version exactly as written, for example `1.9.8`. */
  value: string;
  /** The 1-based line of the version. */
  line: number;
}

const TERRAFORM_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function lines(contents: string): string[] | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return undefined;
  const text = contents.charCodeAt(0) === 0xfeff ? contents.slice(1) : contents;
  return text.split(/\r\n|\r|\n/).map((line) => (line.length > MAXIMUM_LINE_LENGTH ? "\0" : line));
}

function withoutComment(line: string): string {
  const hash = line.indexOf("#");
  return (hash < 0 ? line : line.slice(0, hash)).trim();
}

/** Parse the single version pinned by a `.terraform-version` file. */
export function parseTerraformVersionFile(contents: string): TerraformCliDeclaration[] {
  const all = lines(contents);
  if (!all) return [];

  const entries: Array<{ text: string; line: number }> = [];
  all.forEach((raw, index) => {
    const text = withoutComment(raw);
    if (text !== "") entries.push({ text, line: index + 1 });
  });
  const [entry] = entries;
  if (entries.length !== 1 || !entry || !TERRAFORM_VERSION.test(entry.text)) return [];
  return [{ value: entry.text, line: entry.line }];
}

/** Parse the `terraform` entry from a `.tool-versions` file. */
export function parseToolVersionsTerraform(contents: string): TerraformCliDeclaration[] {
  const all = lines(contents);
  if (!all) return [];

  for (const [index, raw] of all.entries()) {
    const fields = withoutComment(raw).split(/\s+/);
    if (fields[0] !== "terraform") continue;
    const version = fields[1];
    if (version === undefined || !TERRAFORM_VERSION.test(version)) return [];
    return [{ value: version, line: index + 1 }];
  }
  return [];
}
