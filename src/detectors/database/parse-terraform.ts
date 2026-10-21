import { directBlocks, MAXIMUM_DECLARATIONS, prepareHcl, stringAttributes } from "../terraform/hcl.js";

/**
 * Pure, bounded parser for `engine_version` on managed database resources in `*.tf` files.
 *
 * Reads, inside a top-level `resource "<type>" "<name>"` block of a supported type, the literal
 * `engine` and `engine_version` attributes. A declaration is returned only when both are literal
 * strings and the engine is one this detector knows. A value that is a reference (`var.x`), a call,
 * an interpolation, or an empty string returns nothing for that resource. Comments, strings that
 * mention a key, `family` on parameter groups, tags, and resources of other types are not
 * declarations. An unterminated string, comment, or heredoc makes the whole file return nothing.
 * The parser never evaluates HCL and never runs Terraform.
 */

export { MAXIMUM_INPUT_BYTES } from "../terraform/hcl.js";

export type DatabaseTerraformEngine = "postgres" | "mysql" | "mariadb" | "redis";

/** Resource type to the engines that resource accepts. Aurora engines have their own lifecycle and are not read. */
const RESOURCE_ENGINES: Readonly<Record<string, readonly DatabaseTerraformEngine[]>> = {
  aws_db_instance: ["postgres", "mysql", "mariadb"],
  aws_rds_cluster: ["postgres", "mysql"],
  aws_elasticache_cluster: ["redis"],
  aws_elasticache_replication_group: ["redis"],
};

export interface DatabaseEngineVersionDeclaration {
  /** The resource type, for example `aws_db_instance`. */
  resource: string;
  /** The resource name label, for example `orders`. */
  name: string;
  engine: DatabaseTerraformEngine;
  /** The `engine_version` exactly as written, for example `12.22`. */
  value: string;
  /** The 1-based line of the `engine_version` string. */
  line: number;
}

/** Parse `engine` and `engine_version` on managed database resources from a `*.tf` file. */
export function parseDatabaseTerraform(contents: string): DatabaseEngineVersionDeclaration[] {
  const hcl = prepareHcl(contents);
  if (!hcl) return [];

  const declarations: DatabaseEngineVersionDeclaration[] = [];
  for (const block of directBlocks(hcl, 0, hcl.masked.length)) {
    if (block.name !== "resource") continue;
    const labels = /^\s*"([^"\n]+)"\s*"([^"\n]+)"\s*$/.exec(block.header);
    const resource = labels?.[1];
    const name = labels?.[2];
    const engines = resource === undefined ? undefined : RESOURCE_ENGINES[resource];
    if (resource === undefined || name === undefined || !engines) continue;

    const attributes = stringAttributes(hcl, block.bodyStart, block.bodyEnd);
    const engine = attributes.find((attribute) => attribute.name === "engine")?.value;
    const version = attributes.find((attribute) => attribute.name === "engine_version");
    if (!version || engine === undefined || !(engines as readonly string[]).includes(engine)) continue;
    declarations.push({ resource, name, engine: engine as DatabaseTerraformEngine, value: version.value, line: version.line });
    if (declarations.length > MAXIMUM_DECLARATIONS) return declarations.slice(0, MAXIMUM_DECLARATIONS);
  }
  return declarations;
}
