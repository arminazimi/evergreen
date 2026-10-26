import { directBlocks, lineAt, MAXIMUM_DECLARATIONS, MAXIMUM_LINE_LENGTH, prepareHcl, stringAttributes } from "../terraform/hcl.js";
import type { HclSource } from "../terraform/hcl.js";

/**
 * Pure, bounded parser for managed database engine versions in `*.tf` files.
 *
 * It reads, inside a top-level `resource "<type>" "<name>"` block of a supported type, the literal
 * version attribute of the managed database:
 *
 * - `aws_db_instance`, `aws_rds_cluster`, and the two ElastiCache resources read `engine` and
 *   `engine_version`.
 * - `azurerm_postgresql_server`, `azurerm_postgresql_flexible_server`, `azurerm_mysql_server`,
 *   `azurerm_mysql_flexible_server`, and `azurerm_mariadb_server` read `version`; the resource type
 *   names the engine.
 * - Any `google_sql_*` resource reads `database_version`, whose value carries the engine and version
 *   (`POSTGRES_12`, `MYSQL_5_7`).
 *
 * A value that is not a single literal string (a reference, a call, an interpolation, or an empty
 * string) produces no declaration. A reference, call, or interpolation in a version attribute is
 * returned as unclassified so the caller can report it without guessing. Comments, strings that
 * mention a key, `family` on parameter groups, tags, and resources of other types are not
 * declarations. An unterminated string, comment, or heredoc makes the whole file return nothing.
 * The parser never evaluates HCL and never runs Terraform.
 */

export { MAXIMUM_INPUT_BYTES } from "../terraform/hcl.js";

export type DatabaseTerraformEngine = "postgres" | "mysql" | "mariadb" | "redis";

/** The Package URL key of a declaration; cloud products have their own lifecycle rules. */
export type DatabaseTerraformProduct =
  | DatabaseTerraformEngine
  | "azure-database-postgresql"
  | "azure-database-mysql"
  | "azure-database-mariadb"
  | "google-cloud-sql-postgresql"
  | "google-cloud-sql-mysql";

type Platform = "aws" | "azure" | "google-cloud-sql";

interface ResourceSpec {
  platform: Platform;
  /** The attribute that holds the engine version. */
  versionAttribute: "engine_version" | "version" | "database_version";
  /** The engine for a resource whose type fixes it. */
  engine?: DatabaseTerraformEngine;
  /** The engines an AWS resource accepts in its literal `engine` attribute. */
  engines?: readonly DatabaseTerraformEngine[];
}

/** Resource type to the attribute and engine that make it a managed database declaration. */
const RESOURCES: Readonly<Record<string, ResourceSpec>> = {
  aws_db_instance: { platform: "aws", versionAttribute: "engine_version", engines: ["postgres", "mysql", "mariadb"] },
  aws_rds_cluster: { platform: "aws", versionAttribute: "engine_version", engines: ["postgres", "mysql"] },
  aws_elasticache_cluster: { platform: "aws", versionAttribute: "engine_version", engines: ["redis"] },
  aws_elasticache_replication_group: { platform: "aws", versionAttribute: "engine_version", engines: ["redis"] },
  azurerm_postgresql_server: { platform: "azure", versionAttribute: "version", engine: "postgres" },
  azurerm_postgresql_flexible_server: { platform: "azure", versionAttribute: "version", engine: "postgres" },
  azurerm_mysql_server: { platform: "azure", versionAttribute: "version", engine: "mysql" },
  azurerm_mysql_flexible_server: { platform: "azure", versionAttribute: "version", engine: "mysql" },
  azurerm_mariadb_server: { platform: "azure", versionAttribute: "version", engine: "mariadb" },
};

/** The declaration a resource type can make; every `google_sql_*` resource may carry `database_version`. */
function resourceSpec(resource: string): ResourceSpec | undefined {
  const known = RESOURCES[resource];
  if (known) return known;
  return resource.startsWith("google_sql_") ? { platform: "google-cloud-sql", versionAttribute: "database_version" } : undefined;
}

/** A Google Cloud SQL `database_version` value, for example `POSTGRES_9_6` or `MYSQL_8_0`. */
const GOOGLE_DATABASE_VERSION = /^(POSTGRES|MYSQL)_(\d+(?:_\d+)*)$/;

export interface DatabaseEngineVersionDeclaration {
  /** The resource type, for example `aws_db_instance` or `google_sql_database_instance`. */
  resource: string;
  /** The resource name label, for example `orders`. */
  name: string;
  engine: DatabaseTerraformEngine;
  /** The registry product this resource's engine belongs to. */
  product: DatabaseTerraformProduct;
  /** The version exactly as written, for example `12.22`, `12`, or the decoded `9.6`. */
  value: string;
  /** The 1-based line of the version string. */
  line: number;
}

/** A version attribute whose value is not a single literal string, so it cannot be judged. */
export interface DatabaseTerraformUnclassified {
  resource: string;
  name: string;
  attribute: string;
  /** The expression as written, for example `var.pg_version`. */
  value: string;
  /** The 1-based line of the expression. */
  line: number;
}

export interface DatabaseTerraformParseResult {
  declarations: DatabaseEngineVersionDeclaration[];
  unclassified: DatabaseTerraformUnclassified[];
}

interface RawAttribute {
  name: string;
  value: string;
  line: number;
}

/** True when only whitespace, or the `{` that opens the span, precedes `index` on its line. */
function atLineStart(masked: string, index: number, start: number): boolean {
  for (let position = index - 1; position >= start; position--) {
    const character = masked[position]!;
    if (character === "\n" || character === "{") return true;
    if (character !== " " && character !== "\t") return false;
  }
  return true;
}

/** Offset of the next newline outside a nested `{ [ (` expression, or of the closing brace. */
function expressionEnd(masked: string, start: number, end: number): number {
  let depth = 0;
  let index = start;
  while (index < end) {
    const character = masked[index]!;
    if (character === "{" || character === "[" || character === "(") depth++;
    else if (character === "}" || character === "]" || character === ")") {
      if (depth === 0) return index;
      depth--;
    } else if (depth === 0 && character === "\n") {
      return index;
    }
    index++;
  }
  return index;
}

/**
 * Direct `name = expression` attributes of a block body, including values `stringAttributes` skips.
 * Strings and comments are already blanked in `masked`; `source` supplies the expression text.
 */
function rawAttributes(hcl: HclSource, start: number, end: number): RawAttribute[] {
  const attributes: RawAttribute[] = [];
  let depth = 0;
  let index = start;
  while (index < end) {
    const character = hcl.masked[index]!;
    if (character === "{" || character === "[" || character === "(") {
      depth++;
      index++;
      continue;
    }
    if (character === "}" || character === "]" || character === ")") {
      depth--;
      index++;
      continue;
    }
    if (depth === 0 && /[A-Za-z_]/.test(character) && atLineStart(hcl.masked, index, start)) {
      const match = /^([A-Za-z_][A-Za-z0-9_-]*)[^\S\n]*=/.exec(hcl.masked.slice(index, index + MAXIMUM_LINE_LENGTH));
      if (match) {
        const open = index + match[0].length;
        let position = open;
        while (position < end && /\s/.test(hcl.masked[position]!)) position++;
        const close = expressionEnd(hcl.masked, position, end);
        attributes.push({ name: match[1]!, value: hcl.source.slice(position, close).trim(), line: lineAt(hcl.source, position) });
        index = close;
        continue;
      }
    }
    index++;
  }
  return attributes;
}

/** The inner text of a single plain string literal, or undefined for any other expression. */
function plainLiteral(value: string): string | undefined {
  if (!value.startsWith('"') || !value.endsWith('"') || value.length < 2) return undefined;
  const inner = value.slice(1, -1);
  if (inner === "" || /[\\$%]\{|\\/.test(inner) || inner !== inner.trim() || inner.includes('"') || inner.includes("\n")) return undefined;
  return inner;
}

/** True when a raw attribute is an expression, not a version Evergreen can read. */
function isUnclassifiable(raw: RawAttribute): boolean {
  return raw.value !== "" && raw.value !== '""' && plainLiteral(raw.value) === undefined;
}

function productFor(platform: Platform, engine: DatabaseTerraformEngine): DatabaseTerraformProduct | undefined {
  if (platform === "aws") return engine;
  if (platform === "azure") {
    if (engine === "postgres") return "azure-database-postgresql";
    if (engine === "mysql") return "azure-database-mysql";
    if (engine === "mariadb") return "azure-database-mariadb";
    return undefined;
  }
  if (engine === "postgres") return "google-cloud-sql-postgresql";
  if (engine === "mysql") return "google-cloud-sql-mysql";
  return undefined;
}

function googleEngineAndVersion(value: string): { engine: DatabaseTerraformEngine; value: string } | undefined {
  const match = GOOGLE_DATABASE_VERSION.exec(value);
  if (!match) return undefined;
  return { engine: match[1] === "POSTGRES" ? "postgres" : "mysql", value: match[2]!.replace(/_/g, ".") };
}

function unclassified(resource: string, name: string, attribute: string, raw: RawAttribute): DatabaseTerraformUnclassified {
  return { resource, name, attribute, value: raw.value, line: raw.line };
}

/** Parse managed database versions and unreadable version expressions from a `*.tf` file. */
export function parseDatabaseTerraform(contents: string): DatabaseTerraformParseResult {
  const hcl = prepareHcl(contents);
  if (!hcl) return { declarations: [], unclassified: [] };

  const declarations: DatabaseEngineVersionDeclaration[] = [];
  const unreadable: DatabaseTerraformUnclassified[] = [];
  for (const block of directBlocks(hcl, 0, hcl.masked.length)) {
    if (block.name !== "resource") continue;
    const labels = /^\s*"([^"\n]+)"\s*"([^"\n]+)"\s*$/.exec(block.header);
    const resource = labels?.[1];
    const name = labels?.[2];
    const spec = resource === undefined ? undefined : resourceSpec(resource);
    if (resource === undefined || name === undefined || !spec) continue;

    const literals = stringAttributes(hcl, block.bodyStart, block.bodyEnd);
    const raws = rawAttributes(hcl, block.bodyStart, block.bodyEnd);
    const literal = (attribute: string) => literals.find((item) => item.name === attribute);
    const raw = (attribute: string) => raws.find((item) => item.name === attribute);

    if (spec.platform === "aws") {
      const engine = literal("engine");
      const version = literal(spec.versionAttribute);
      if (engine !== undefined && !(spec.engines as readonly string[]).includes(engine.value)) continue;
      const declaredEngine = raw("engine");
      const declaredVersion = raw(spec.versionAttribute);
      if (!engine && declaredEngine && isUnclassifiable(declaredEngine)) unreadable.push(unclassified(resource, name, "engine", declaredEngine));
      if (!version && declaredVersion && isUnclassifiable(declaredVersion)) unreadable.push(unclassified(resource, name, spec.versionAttribute, declaredVersion));
      if (!engine || !version) continue;

      const product = productFor(spec.platform, engine.value as DatabaseTerraformEngine);
      if (!product) continue;
      declarations.push({ resource, name, engine: engine.value as DatabaseTerraformEngine, product, value: version.value, line: version.line });
    } else if (spec.platform === "azure") {
      const version = literal("version");
      if (!version) {
        const declared = raw("version");
        if (declared && isUnclassifiable(declared)) unreadable.push(unclassified(resource, name, "version", declared));
        continue;
      }
      const product = productFor(spec.platform, spec.engine!);
      if (!product) continue;
      declarations.push({ resource, name, engine: spec.engine!, product, value: version.value, line: version.line });
    } else {
      const version = literal("database_version");
      if (!version) {
        const declared = raw("database_version");
        if (declared && isUnclassifiable(declared)) unreadable.push(unclassified(resource, name, "database_version", declared));
        continue;
      }
      const parsed = googleEngineAndVersion(version.value);
      if (!parsed) continue;
      const product = productFor(spec.platform, parsed.engine);
      if (!product) continue;
      declarations.push({ resource, name, engine: parsed.engine, product, value: parsed.value, line: version.line });
    }

    if (declarations.length >= MAXIMUM_DECLARATIONS || unreadable.length >= MAXIMUM_DECLARATIONS) {
      return { declarations: declarations.slice(0, MAXIMUM_DECLARATIONS), unclassified: unreadable.slice(0, MAXIMUM_DECLARATIONS) };
    }
  }
  return { declarations, unclassified: unreadable };
}
