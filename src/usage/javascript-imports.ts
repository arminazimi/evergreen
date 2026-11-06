import { type Binding, type ImportReference, javascriptBindings } from "./imports.js";

/** One way a JavaScript or TypeScript file names a module, and the bindings its captures introduce. */
interface JavaScriptImportForm {
  readonly pattern: RegExp;
  readonly read: (match: RegExpMatchArray) => { module: string; bindings: Binding[] } | undefined;
}

/** `const { get: fetch } = require("request")` binds `fetch` to `get`; an unaliased name binds itself. */
function destructuredRequireBindings(names: string, module: string): Binding[] {
  const entry = /^\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*$/;
  return names.split(",").flatMap((one): Binding[] => {
    const binding = entry.exec(one);
    return binding?.[1] ? [{ module, imported: binding[1], local: binding[2] ?? binding[1] }] : [];
  });
}

/** The five ways a script file reaches a package, tried in this order so each form reports its own column. */
const JAVASCRIPT_IMPORT_FORMS: readonly JavaScriptImportForm[] = [
  {
    pattern: /\bimport\s+(.+?)\s+from\s+["']([^"']+)["']/g,
    read: (match) => {
      const clause = match[1];
      const module = match[2];
      if (clause === undefined || module === undefined) return undefined;
      return { module, bindings: javascriptBindings(clause, module) };
    },
  },
  {
    pattern: /\bimport\s+["']([^"']+)["']/g,
    read: (match) => (match[1] === undefined ? undefined : { module: match[1], bindings: [] }),
  },
  {
    pattern: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g,
    read: (match) => {
      const local = match[1];
      const module = match[2];
      if (local === undefined || module === undefined) return undefined;
      return { module, bindings: [{ module, local, imported: "*" }] };
    },
  },
  {
    pattern: /\b(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\(\s*["']([^"']+)["']\s*\)/g,
    read: (match) => {
      const names = match[1];
      const module = match[2];
      if (names === undefined || module === undefined) return undefined;
      return { module, bindings: destructuredRequireBindings(names, module) };
    },
  },
  {
    pattern: /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    read: (match) => (match[1] === undefined ? undefined : { module: match[1], bindings: [] }),
  },
];

/** Every module name the regex fallback reads from one line, with its bindings. */
export function javascriptImports(line: string, lineNumber: number): ImportReference[] {
  const references: ImportReference[] = [];
  for (const form of JAVASCRIPT_IMPORT_FORMS) {
    for (const match of line.matchAll(form.pattern)) {
      if (match.index === undefined) continue;
      const found = form.read(match);
      if (found === undefined) continue;
      references.push({
        module: found.module,
        line: lineNumber,
        column: line.indexOf(found.module, match.index) + 1,
        bindings: found.bindings,
      });
    }
  }
  return references;
}
