import {
  directBlocks,
  MAXIMUM_DECLARATIONS,
  prepareHcl,
  stringAttributes,
} from "./hcl.js";

/**
 * Pure, bounded parser for Terraform version declarations in `*.tf` files.
 *
 * Reads, inside a top-level `terraform` block only:
 * - `required_version = "<literal>"`
 * - `<name> = { source = "<literal>", version = "<literal>" }` inside
 *   `required_providers`
 *
 * A value that is a reference (`var.x`, `local.x`), a call, an interpolation,
 * or an empty string returns nothing for that site. Comments, strings that
 * mention a key, and `version` attributes on modules, resources, and variables
 * are not declarations. An unterminated string, comment, or heredoc makes the
 * whole file return nothing, and a block that never closes is skipped. The
 * parser never evaluates HCL and never runs Terraform.
 */

export { MAXIMUM_INPUT_BYTES } from "./hcl.js";

export interface TerraformRequiredVersionDeclaration {
  kind: "required_version";
  /** The constraint exactly as written, for example `~> 1.9.0`. */
  value: string;
  /** The 1-based line of the constraint string. */
  line: number;
}

export interface TerraformProviderVersionDeclaration {
  kind: "provider_version";
  /** The local name in `required_providers`, for example `aws`. */
  provider: string;
  /** The `source` literal when the provider declares one, for example `hashicorp/aws`. */
  source?: string;
  /** The constraint exactly as written, for example `~> 5.0`. */
  value: string;
  /** The 1-based line of the constraint string. */
  line: number;
}

export type TerraformDeclaration =
  | TerraformRequiredVersionDeclaration
  | TerraformProviderVersionDeclaration;

/** Parse `required_version` and `required_providers` constraints from a `*.tf` file. */
export function parseTerraformFile(contents: string): TerraformDeclaration[] {
  const hcl = prepareHcl(contents);
  if (!hcl) return [];

  const declarations: TerraformDeclaration[] = [];
  for (const block of directBlocks(hcl, 0, hcl.masked.length)) {
    if (block.name !== "terraform" || block.header.trim() !== "") continue;

    for (const attribute of stringAttributes(hcl, block.bodyStart, block.bodyEnd)) {
      if (attribute.name === "required_version") {
        declarations.push({ kind: "required_version", value: attribute.value, line: attribute.line });
      }
    }

    for (const providers of directBlocks(hcl, block.bodyStart, block.bodyEnd)) {
      if (providers.name !== "required_providers" || providers.header.trim() !== "") continue;
      for (const provider of directBlocks(hcl, providers.bodyStart, providers.bodyEnd)) {
        if (provider.header.trim() !== "=") continue;
        const attributes = stringAttributes(hcl, provider.bodyStart, provider.bodyEnd);
        const source = attributes.find((attribute) => attribute.name === "source")?.value;
        const version = attributes.find((attribute) => attribute.name === "version");
        if (!version) continue;
        declarations.push({
          kind: "provider_version",
          provider: provider.name,
          ...(source === undefined ? {} : { source }),
          value: version.value,
          line: version.line,
        });
      }
    }
    if (declarations.length > MAXIMUM_DECLARATIONS) return declarations.slice(0, MAXIMUM_DECLARATIONS);
  }
  return declarations;
}
