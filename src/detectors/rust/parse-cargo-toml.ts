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

const SECTION = /^(?:workspace\.(dependencies)|(dependencies|dev-dependencies|build-dependencies)|target\..+\.(dependencies|dev-dependencies|build-dependencies))$/;

function sectionOf(table: string): { section: DependencySection; nameInTable?: never } | { section: DependencySection; name: string } | undefined {
  const plain = SECTION.exec(table);
  if (plain) return { section: (plain[1] ? "workspace" : (plain[2] ?? plain[3])) as DependencySection };
  // `[dependencies.name]` and `[target.'cfg(unix)'.dependencies.name]`: a dependency written as its own table.
  const detail = /^(workspace\.dependencies|dependencies|dev-dependencies|build-dependencies|target\..+\.(?:dependencies|dev-dependencies|build-dependencies))\.([A-Za-z0-9_-]+|"[^"]+")$/.exec(table);
  if (detail) {
    const parent = sectionOf(detail[1]!);
    if (parent && !("name" in parent)) return { section: parent.section, name: detail[2]!.replace(/^"|"$/g, "") };
  }
  return undefined;
}

/** The `key = value` pairs of a single-line inline table, or undefined when it spans lines or cannot be read. */
function inlineTable(value: string): Map<string, string> | undefined {
  if (!value.startsWith("{") || !value.endsWith("}")) return undefined;
  const pairs = new Map<string, string>();
  const body = value.slice(1, -1);
  const entry = /([A-Za-z0-9_.-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|\[[^\]]*\]|true|false|[0-9]+)/g;
  for (const match of body.matchAll(entry)) pairs.set(match[1]!, match[2]!);
  return pairs;
}

function dependencyFrom(name: string, fields: Map<string, string>, section: DependencySection, line: number): CargoDependencyDeclaration | undefined {
  if (fields.has("path") || fields.has("git") || fields.has("workspace") || fields.has("workspace.workspace")) return undefined;
  const version = stringValue(fields.get("version"));
  if (version === undefined || version === "" || version.includes("$")) return undefined;
  const renamed = stringValue(fields.get("package"));
  return { kind: "dependency", crate: renamed ?? name, name, section, value: version, line };
}

/** Parse supported Cargo.toml declarations without file, network, or process I/O. */
export function parseCargoToml(contents: string): CargoTomlDeclaration[] {
  const lines = readTomlLines(contents);
  if (!lines) return [];

  const declarations: CargoTomlDeclaration[] = [];
  // Dependencies written as their own table gather their fields from the lines that follow.
  const detail = new Map<string, { name: string; section: DependencySection; line: number; fields: Map<string, string> }>();

  for (const entry of lines as TomlLine[]) {
    if (entry.header !== undefined) {
      if (entry.arrayTable) continue;
      const found = sectionOf(entry.header);
      if (found && "name" in found) detail.set(entry.header, { name: found.name, section: found.section, line: entry.line, fields: new Map() });
      continue;
    }
    if (entry.key === undefined || entry.value === undefined) continue;

    if ((entry.table === "package" || entry.table === "workspace.package") && (entry.key === "edition" || entry.key === "rust-version")) {
      const value = stringValue(entry.value);
      if (value) declarations.push({ kind: entry.key, value, line: entry.line });
      continue;
    }

    const own = detail.get(entry.table);
    if (own) {
      own.fields.set(entry.key, entry.value);
      continue;
    }

    const found = sectionOf(entry.table);
    if (!found || "name" in found) continue;
    if (entry.key.includes(".")) {
      // `name.workspace = true` and `name.version = "1"` dotted forms.
      const [name, field] = [entry.key.slice(0, entry.key.indexOf(".")), entry.key.slice(entry.key.indexOf(".") + 1)];
      const existing = detail.get(`${entry.table}\0${name}`) ?? { name, section: found.section, line: entry.line, fields: new Map<string, string>() };
      existing.fields.set(field, entry.value);
      detail.set(`${entry.table}\0${name}`, existing);
      continue;
    }
    const literal = stringValue(entry.value);
    const fields = literal !== undefined ? new Map([["version", entry.value]]) : inlineTable(entry.value);
    if (!fields) continue;
    const declaration = dependencyFrom(entry.key, fields, found.section, entry.line);
    if (declaration) declarations.push(declaration);
  }

  for (const own of detail.values()) {
    const declaration = dependencyFrom(own.name, own.fields, own.section, own.line);
    if (declaration) declarations.push(declaration);
  }
  return declarations.sort((left, right) => left.line - right.line);
}
