import type { Binding, ImportReference } from "./imports.js";

interface RustLeaf {
  /** The path segments of one imported name, such as ["tokio", "sync", "Mutex"]. */
  path: string[];
  alias?: string;
  glob: boolean;
}

/** The token at `index`; the parser never reads past the end, so a missing token is the empty string. */
function tokenAt(tokens: readonly string[], index: number): string {
  return tokens[index] ?? "";
}

/** Splits a `use` tree such as `a::{b, c::d as e, f::*}` into its leaves; undefined when it is not understood. */
function rustUseLeaves(text: string): RustLeaf[] | undefined {
  const tokens = text.match(/::|[{}(),*]|[A-Za-z_][A-Za-z0-9_]*|r#[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  let position = 0;
  const leaves: RustLeaf[] = [];
  const parse = (prefix: string[]): boolean => {
    const path = [...prefix];
    while (position < tokens.length) {
      const token = tokenAt(tokens, position);
      if (token === "::") {
        position += 1;
      } else if (token === "{") {
        position += 1;
        for (;;) {
          if (!parse(path)) return false;
          if (tokens[position] === ",") {
            position += 1;
            if (tokens[position] === "}") break;
            continue;
          }
          break;
        }
        if (tokens[position] !== "}") return false;
        position += 1;
        return true;
      } else if (token === "*") {
        position += 1;
        leaves.push({ path, glob: true });
        return true;
      } else if (/^[A-Za-z_]/.test(token) || token.startsWith("r#")) {
        position += 1;
        if (tokens[position] === "as") {
          const alias = tokens[position + 1];
          if (!alias) return false;
          position += 2;
          leaves.push({ path: [...path, token], alias, glob: false });
          return true;
        }
        path.push(token);
        if (tokens[position] !== "::") {
          leaves.push({ path, glob: false });
          return true;
        }
      } else {
        return false;
      }
    }
    return false;
  };
  return parse([]) && position === tokens.length ? leaves : undefined;
}

/** The import reference named by one `use` leaf, or an empty list when the leaf names nothing. */
function rustLeafReferences(leaf: RustLeaf, line: number, column: number): ImportReference[] {
  const path = leaf.path;
  if (path.length === 0) return [];
  const last = path[path.length - 1] ?? "";
  const whole = path.length === 1 || leaf.glob || last === "self";
  const modulePath = whole ? (last === "self" ? path.slice(0, -1) : path) : path.slice(0, -1);
  if (modulePath.length === 0) return [];
  const module = modulePath.join("::");
  const bindings: Binding[] = leaf.glob
    ? []
    : whole
      ? [{ module, local: leaf.alias ?? modulePath[modulePath.length - 1] ?? "", imported: "*" }]
      : [{ module, local: leaf.alias ?? last, imported: last }];
  return [{ module, line, column, bindings }];
}

/** The reference named by one `extern crate` item, or an empty list when it is not understood. */
function rustExternReference(body: string, line: number, column: number): ImportReference[] {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/.exec(body);
  if (!match?.[1]) return [];
  const module = match[1];
  return [{ module, line, column, bindings: [{ module, local: match[2] ?? module, imported: "*" }] }];
}

/**
 * `use` declarations and `extern crate` items in a Rust file, including statements that span lines. The crate is the
 * first path segment; `crate`, `self`, `super`, and `std`-style local paths are not matched by crate rules, so
 * only the text is recorded. A glob import is an import but binds no name, so calls through it are not guessed.
 */
export function rustImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  let index = 0;
  while (index < maskedLines.length) {
    const start = /^\s*(?:pub(?:\([^)]*\))?\s+)?(use|extern\s+crate)\s+(.*)$/.exec(maskedLines[index] ?? "");
    if (!start) {
      index += 1;
      continue;
    }
    let statement = start[2] ?? "";
    const first = index;
    while (!statement.includes(";") && index + 1 < maskedLines.length && index - first < 40) {
      index += 1;
      statement += ` ${(maskedLines[index] ?? "").trim()}`;
    }
    index += 1;
    const end = statement.indexOf(";");
    const body = statement.slice(0, end === -1 ? statement.length : end).trim();
    const column = (lines[first] ?? "").search(/\S/) + 1;
    if ((start[1] ?? "").startsWith("extern")) {
      references.push(...rustExternReference(body, first + 1, column));
      continue;
    }
    const leaves = rustUseLeaves(body.replace(/^::/, ""));
    if (!leaves) continue;
    for (const leaf of leaves) references.push(...rustLeafReferences(leaf, first + 1, column));
  }
  return references;
}
