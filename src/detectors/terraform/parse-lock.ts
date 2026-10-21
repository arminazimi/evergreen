import { directBlocks, MAXIMUM_DECLARATIONS, prepareHcl, stringAttributes } from "./hcl.js";

/**
 * Pure, bounded parser for the locked provider versions in `.terraform.lock.hcl`.
 *
 * Reads each top-level `provider "<address>" { ... }` block and its literal
 * `version` and `constraints` attributes. The address is the quoted label, for
 * example `registry.terraform.io/hashicorp/aws`. A block without a literal
 * `version`, a block whose label is not a single quoted string, a block that
 * never closes, and any nested attribute return nothing. An unterminated string,
 * comment, or heredoc makes the whole file return nothing. The parser never
 * evaluates HCL and never runs Terraform.
 */

export { MAXIMUM_INPUT_BYTES } from "./hcl.js";

export interface TerraformLockedProvider {
  /** The provider address as written, for example `registry.terraform.io/hashicorp/aws`. */
  address: string;
  /** The locked version exactly as written, for example `5.70.0`. */
  value: string;
  /** The 1-based line of the locked version string. */
  line: number;
  /** The `constraints` literal recorded for the same provider, when present. */
  constraints?: string;
}

const LABEL = /^\s*"([^"\\$%{}\s]+)"\s*$/;
const ADDRESS = /^[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._-]+){2}$/;

/** Parse the locked provider versions from a `.terraform.lock.hcl` file. */
export function parseTerraformLock(contents: string): TerraformLockedProvider[] {
  const hcl = prepareHcl(contents);
  if (!hcl) return [];

  const providers: TerraformLockedProvider[] = [];
  for (const block of directBlocks(hcl, 0, hcl.masked.length)) {
    if (block.name !== "provider") continue;
    const address = LABEL.exec(block.header)?.[1];
    if (address === undefined || !ADDRESS.test(address)) continue;

    const attributes = stringAttributes(hcl, block.bodyStart, block.bodyEnd);
    const version = attributes.find((attribute) => attribute.name === "version");
    if (!version) continue;
    const constraints = attributes.find((attribute) => attribute.name === "constraints")?.value;
    providers.push({
      address,
      value: version.value,
      line: version.line,
      ...(constraints === undefined ? {} : { constraints }),
    });
    if (providers.length >= MAXIMUM_DECLARATIONS) break;
  }
  return providers;
}
