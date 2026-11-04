import type { Binding, ImportReference } from "./imports.js";

/** The line at `index`; a directive spans lines, but a missing line contributes nothing. */
function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? "";
}

/** The first `/`-separated segment of a Dart package URI, or the empty string. */
function firstSegment(value: string): string {
  return value.split("/")[0] ?? "";
}

/**
 * Dart `import` directives. The module is the package name of a `package:` URI or the `dart:` library, so
 * relative and `file:` imports name nothing. `as prefix` binds the whole library under the prefix and
 * `show A, B` binds exactly those names; a bare import brings unknown names into scope and binds nothing.
 */
export function dartImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  const entry = /^\s*import\s*(['"])((?:package|dart):[^'"]+)\1([^;]*);/;
  for (const [index, masked] of maskedLines.entries()) {
    if (!/^\s*import\b/.test(masked)) continue;
    // A directive may continue on the lines that follow, up to its semicolon.
    let directive = lineAt(lines, index);
    for (let next = index + 1; !directive.includes(";") && next < lines.length && next < index + 8; next += 1) {
      directive += ` ${lineAt(lines, next).trim()}`;
    }
    const match = entry.exec(directive);
    if (!match?.[2]) continue;
    const uri = match[2];
    const module = uri.startsWith("dart:") ? uri : firstSegment(uri.slice("package:".length));
    if (module === "") continue;
    const clauses = (match[3] ?? "").replace(/\/\/.*$/gm, "");
    const bindings: Binding[] = [];
    const prefix = /\b(?:deferred\s+)?as\s+([A-Za-z_]\w*)/.exec(clauses);
    if (prefix?.[1]) {
      bindings.push({ module, local: prefix[1], imported: "*" });
    } else {
      const shown = /\bshow\s+([^;]*?)(?:\bhide\b|$)/.exec(clauses);
      for (const name of shown?.[1]?.split(",") ?? []) {
        const trimmed = name.trim();
        if (/^[A-Za-z_]\w*$/.test(trimmed)) bindings.push({ module, local: trimmed, imported: trimmed });
      }
    }
    references.push({
      module,
      line: index + 1,
      column: lineAt(lines, index).indexOf("import") + 1,
      bindings,
    });
  }
  return references;
}
