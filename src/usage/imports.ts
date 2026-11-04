export interface Binding {
  module: string;
  local: string;
  imported: string;
}

export interface ImportReference {
  module: string;
  line: number;
  column: number;
  bindings: Binding[];
}

export function javascriptBindings(clause: string, module: string): Binding[] {
  const bindings: Binding[] = [];
  const namespace = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause)?.[1];
  if (namespace) bindings.push({ module, local: namespace, imported: "*" });

  const named = /\{([^}]+)\}/.exec(clause)?.[1];
  for (const entry of named?.split(",") ?? []) {
    const match = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(entry);
    if (match?.[1]) {
      bindings.push({ module, imported: match[1], local: match[2] ?? match[1] });
    }
  }

  const defaultBinding = clause.split(",")[0]?.trim();
  if (defaultBinding && /^[A-Za-z_$][\w$]*$/.test(defaultBinding)) {
    bindings.push({ module, local: defaultBinding, imported: "default" });
  }
  return bindings;
}

export function pythonImports(line: string, lineNumber: number): ImportReference[] {
  const references: ImportReference[] = [];
  const direct = /^\s*import\s+([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?/.exec(line);
  if (direct?.[1]) {
    const module = direct[1];
    const local = direct[2] ?? module.split(".")[0] ?? module;
    references.push({
      module,
      line: lineNumber,
      column: line.indexOf(module) + 1,
      bindings: [{ module, local, imported: "*" }],
    });
  }

  const from = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+(.+)$/.exec(line);
  const module = from?.[1];
  const names = from?.[2];
  if (module && names) {
    const bindings = names.split(",").flatMap((entry): Binding[] => {
      const binding = /^\s*([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?\s*$/.exec(entry);
      return binding?.[1] ? [{ module, imported: binding[1], local: binding[2] ?? binding[1] }] : [];
    });
    references.push({
      module,
      line: lineNumber,
      column: line.indexOf(module) + 1,
      bindings,
    });
  }
  return references;
}

/** Swift module imports, including declaration-specific and underscored attribute forms. */
export function swiftImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  const entry =
    /^\s*(?:(?:@testable|@_exported|@_implementationOnly|@preconcurrency)\s+)?import\s+(?:(?:typealias|struct|class|enum|protocol|let|var|func)\s+)?([A-Za-z_]\w*)/;
  for (const [index, masked] of maskedLines.entries()) {
    const match = entry.exec(masked);
    if (!match?.[1]) continue;
    references.push({
      module: match[1],
      line: index + 1,
      column: (lines[index] ?? "").indexOf(match[1]) + 1,
      bindings: [{ module: match[1], local: match[1], imported: "*" }],
    });
  }
  return references;
}

export interface SwiftAlias {
  local: string;
  target: string;
}

/** Simple source-level aliases such as `typealias LegacyClient = OldSDK.Client`. */
export function swiftAliases(maskedLines: readonly string[]): SwiftAlias[] {
  const aliases: SwiftAlias[] = [];
  const entry =
    /^\s*(?:public\s+|internal\s+|private\s+|fileprivate\s+)?typealias\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)/;
  for (const line of maskedLines) {
    const match = entry.exec(line);
    if (!match?.[1] || !match[2]) continue;
    aliases.push({ local: match[1], target: match[2].replace(/\s+/g, "") });
  }
  return aliases;
}

/**
 * `using` directives in a C# file: `using N;`, `global using N;`, `using static N.Type;`, and `using Alias = N;`.
 * A namespace import brings in every type of the namespace, so it binds no name; only an alias binds one. A
 * `using` statement (`using (var x = …)`, `using var x = …`) is not a directive and does not match.
 */
export function csharpImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  for (const [index, masked] of maskedLines.entries()) {
    const match = /^\s*(?:global\s+)?using\s+(static\s+)?(?:([A-Za-z_]\w*)\s*=\s*)?([A-Za-z_][\w.]*)\s*;/.exec(masked);
    if (!match?.[3]) continue;
    references.push({
      module: match[3],
      line: index + 1,
      column: (lines[index] ?? "").search(/\S/) + 1,
      bindings: match[2] && !match[1] ? [{ module: match[3], local: match[2], imported: "*" }] : [],
    });
  }
  return references;
}

/** The identifier a Go import path binds by default: its last element, skipping a `/vN` major-version suffix. */
function goPackageName(path: string): string {
  const parts = path.split("/");
  let name = parts[parts.length - 1] ?? "";
  if (/^v\d+$/.test(name) && parts.length > 1) name = parts[parts.length - 2] ?? "";
  return name
    .replace(/^go-/, "")
    .replace(/[.-]go$/, "")
    .replace(/[^A-Za-z0-9_]/g, "_");
}

/**
 * Import declarations in a Go file: single `import "x"` lines and `import ( ... )` groups. Blank (`_`) and dot
 * (`.`) imports are real imports but bind no name, so only the import itself is reported, not calls through it.
 */
export function goImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  let inGroup = false;
  const entry = /^\s*(?:import\s+)?(?:([A-Za-z_]\w*|\.)\s+)?"([^"]+)"/;
  for (const [index, masked] of maskedLines.entries()) {
    const line = lines[index] ?? "";
    let candidate: string | undefined;
    if (inGroup) {
      if (/^\s*\)/.test(masked)) {
        inGroup = false;
        continue;
      }
      candidate = line;
    } else if (/^\s*import\s*\(/.test(masked)) {
      inGroup = !/\)\s*$/.test(masked);
      continue;
    } else if (/^\s*import\s+(?:[A-Za-z_]\w*\s+|\.\s+)?"/.test(line) && /^\s*import\b/.test(masked)) {
      candidate = line;
    }
    const match = candidate === undefined ? null : entry.exec(candidate);
    if (!match?.[2]) continue;
    const alias = match[1];
    references.push({
      module: match[2],
      line: index + 1,
      column: line.indexOf(match[2]) + 1,
      bindings:
        alias === "_" || alias === "."
          ? []
          : [{ module: match[2], local: alias ?? goPackageName(match[2]), imported: "*" }],
    });
  }
  return references;
}

/**
 * Import declarations in a Java or Kotlin file: `import a.b.C;`, `import static a.b.C.m;`, wildcard imports, and
 * Kotlin imports without a semicolon or with `as`. An import binds names, but calls through them are not mapped,
 * so only the import itself is reported.
 */
export function jvmImports(lines: readonly string[], maskedLines: readonly string[]): ImportReference[] {
  const references: ImportReference[] = [];
  const entry = /^\s*import\s+(?:static\s+)?([A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)(?:\.\*)?/;
  for (const [index, masked] of maskedLines.entries()) {
    if (!/^\s*import\s/.test(masked)) continue;
    const line = lines[index] ?? "";
    const match = entry.exec(line);
    if (!match?.[1]) continue;
    references.push({ module: match[1], line: index + 1, column: line.indexOf(match[1]) + 1, bindings: [] });
  }
  return references;
}
