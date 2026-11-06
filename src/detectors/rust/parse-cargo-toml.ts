import { required } from "../../required.js";
import { readTomlLines, stringValue } from "./toml-lines.js";
import type { TomlLine } from "./toml-lines.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from Cargo.toml.
 *
 * It returns direct dependencies with a literal version (in `[dependencies]`, `[dev-dependencies]`,
 * `[build-dependencies]`, `[workspace.dependencies]`, and the same tables under `[target.<cfg>.…]`), plus
 * `edition` and `rust-version`. Unsupported forms return nothing: `path`, `git`, and `workspace = true`
 * dependencies, versions that are not a single literal string, inline tables that span several lines, and any
 * malformed file. The parser never evaluates contents or runs Cargo.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH } from "./toml-lines.js";

export type DependencySection = "dependencies" | "dev-dependencies" | "build-dependencies" | "workspace";

export interface CargoDependencyDeclaration {
  kind: "dependency";
  /** The crate's real name: `package = "…"` when the dependency is renamed. */
  crate: string;
  /** The key the manifest uses for it. */
  name: string;
  section: DependencySection;
  /** The version requirement, exactly as written. */
  value: string;
  /** The 1-based line of the dependency's key (or of its `[dependencies.name]` header). */
  line: number;
}

export interface CargoEditionDeclaration {
  kind: "edition" | "rust-version";
  value: string;
  line: number;
}

export type CargoTomlDeclaration = CargoDependencyDeclaration | CargoEditionDeclaration;

const SECTION =
  /^(?:workspace\.(dependencies)|(dependencies|dev-dependencies|build-dependencies)|target\..+\.(dependencies|dev-dependencies|build-dependencies))$/;

function sectionOf(
  table: string,
): { section: DependencySection; nameInTable?: never } | { section: DependencySection; name: string } | undefined {
  const plain = SECTION.exec(table);
  if (plain)
    return {
      section: (plain[1] ? "workspace" : (plain[2] ?? plain[3])) as DependencySection,
    };
  // `[dependencies.name]` and `[target.'cfg(unix)'.dependencies.name]`: a dependency written as its own table.
  const detail =
    /^(workspace\.dependencies|dependencies|dev-dependencies|build-dependencies|target\..+\.(?:dependencies|dev-dependencies|build-dependencies))\.([A-Za-z0-9_-]+|"[^"]+")$/.exec(
      table,
    );
  if (detail) {
    const parent = sectionOf(required(detail[1], "parent table"));
    if (parent && !("name" in parent))
      return {
        section: parent.section,
        name: required(detail[2], "dependency name").replace(/^"|"$/g, ""),
      };
  }
  return undefined;
}

/** The `key = value` pairs of a single-line inline table, or undefined when it spans lines or cannot be read. */
function inlineTable(value: string): Map<string, string> | undefined {
  if (!value.startsWith("{") || !value.endsWith("}")) return undefined;
  const pairs = new Map<string, string>();
  const body = value.slice(1, -1);
  const entry = /([A-Za-z0-9_.-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|\[[^\]]*\]|true|false|[0-9]+)/g;
  for (const match of body.matchAll(entry))
    pairs.set(required(match[1], "inline table key"), required(match[2], "inline table value"));
  return pairs;
}

function dependencyFrom(
  name: string,
  fields: Map<string, string>,
  section: DependencySection,
  line: number,
): CargoDependencyDeclaration | undefined {
  if (fields.has("path") || fields.has("git") || fields.has("workspace") || fields.has("workspace.workspace"))
    return undefined;
  const version = stringValue(fields.get("version"));
  if (version === undefined || version === "" || version.includes("$")) return undefined;
  const renamed = stringValue(fields.get("package"));
  return {
    kind: "dependency",
    crate: renamed ?? name,
    name,
    section,
    value: version,
    line,
  };
}

/** A dependency written as its own `[dependencies.name]` table, whose fields come from the lines that follow. */
interface DetailTable {
  name: string;
  section: DependencySection;
  line: number;
  fields: Map<string, string>;
}

/** A line with both a key and a value. */
type KeyValueLine = TomlLine & { key: string; value: string };

function isKeyValue(entry: TomlLine): entry is KeyValueLine {
  return entry.key !== undefined && entry.value !== undefined;
}

/** `[package]` and `[workspace.package]` hold the edition and rust-version. */
function isPackageTable(table: string): boolean {
  return table === "package" || table === "workspace.package";
}

function editionDeclaration(entry: KeyValueLine): CargoEditionDeclaration | undefined {
  if (entry.key !== "edition" && entry.key !== "rust-version") return undefined;
  const value = stringValue(entry.value);
  return value ? { kind: entry.key, value, line: entry.line } : undefined;
}

/** A `[dependencies.name]` header starts a detail table; any other header is ignored here. */
function startDetailTable(entry: TomlLine, header: string, detail: Map<string, DetailTable>): void {
  if (entry.arrayTable) return;
  const found = sectionOf(header);
  if (found && "name" in found)
    detail.set(header, {
      name: found.name,
      section: found.section,
      line: entry.line,
      fields: new Map(),
    });
}

/** A `name.version = "1"` or `name.workspace = true` line: the field joins the dependency named before the dot. */
function addDottedField(entry: KeyValueLine, section: DependencySection, detail: Map<string, DetailTable>): void {
  const dot = entry.key.indexOf(".");
  const name = entry.key.slice(0, dot);
  const field = entry.key.slice(dot + 1);
  const id = `${entry.table}\0${name}`;
  const existing = detail.get(id) ?? {
    name,
    section,
    line: entry.line,
    fields: new Map<string, string>(),
  };
  existing.fields.set(field, entry.value);
  detail.set(id, existing);
}

/** A single-line dependency: a version string or an inline table. */
function inlineDeclaration(entry: KeyValueLine, section: DependencySection): CargoDependencyDeclaration | undefined {
  const literal = stringValue(entry.value);
  const fields = literal !== undefined ? new Map([["version", entry.value]]) : inlineTable(entry.value);
  if (!fields) return undefined;
  return dependencyFrom(entry.key, fields, section, entry.line);
}

function collectKeyValue(
  entry: KeyValueLine,
  detail: Map<string, DetailTable>,
  declarations: CargoTomlDeclaration[],
): void {
  if (isPackageTable(entry.table)) {
    const edition = editionDeclaration(entry);
    if (edition) declarations.push(edition);
    return;
  }
  const own = detail.get(entry.table);
  if (own) {
    own.fields.set(entry.key, entry.value);
    return;
  }
  const found = sectionOf(entry.table);
  if (!found || "name" in found) return;
  if (entry.key.includes(".")) {
    addDottedField(entry, found.section, detail);
    return;
  }
  const declaration = inlineDeclaration(entry, found.section);
  if (declaration) declarations.push(declaration);
}

/** Parse supported Cargo.toml declarations without file, network, or process I/O. */
export function parseCargoToml(contents: string): CargoTomlDeclaration[] {
  const lines = readTomlLines(contents);
  if (!lines) return [];

  const declarations: CargoTomlDeclaration[] = [];
  const detail = new Map<string, DetailTable>();
  for (const entry of lines) {
    if (entry.header !== undefined) startDetailTable(entry, entry.header, detail);
    else if (isKeyValue(entry)) collectKeyValue(entry, detail, declarations);
  }

  for (const own of detail.values()) {
    const declaration = dependencyFrom(own.name, own.fields, own.section, own.line);
    if (declaration) declarations.push(declaration);
  }
  return declarations.sort((left, right) => left.line - right.line);
}
