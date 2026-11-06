import type { SourceLanguage } from "../domain.js";
import { textAt } from "./file-scan.js";
import { csharpImports, goImports, type ImportReference, jvmImports, pythonImports, swiftImports } from "./imports.js";
import { javascriptImports } from "./javascript-imports.js";
import { dartImports } from "./dart.js";
import { phpImportsFromRequires } from "./php.js";
import type { phpUses } from "./php.js";
import { rubyImports } from "./ruby.js";
import { rustImports } from "./rust.js";

/** The module names one language's files bind, read from its lines and the mask of those lines. */
type ImportReader = (lines: readonly string[], maskedLines: readonly string[]) => ImportReference[];

/** Reads one line at a time, only where the masked line still mentions an import keyword. */
function readImportsPerLine(hint: RegExp, read: (line: string, lineNumber: number) => ImportReference[]): ImportReader {
  return (lines, maskedLines) =>
    lines.flatMap((line, index) => (hint.test(textAt(maskedLines, index)) ? read(line, index + 1) : []));
}

/** The module names each language binds. PHP is read apart from this table; see `fileImports`. */
const IMPORT_READERS: Partial<Record<SourceLanguage, ImportReader>> = {
  javascript: readImportsPerLine(/\b(?:import|require)\b/, javascriptImports),
  typescript: readImportsPerLine(/\b(?:import|require)\b/, javascriptImports),
  python: readImportsPerLine(/\b(?:from|import)\b/, pythonImports),
  ruby: rubyImports,
  go: goImports,
  rust: rustImports,
  csharp: csharpImports,
  java: jvmImports,
  kotlin: jvmImports,
  swift: swiftImports,
  dart: dartImports,
};

/** Every module name the file binds, in the order its lines mention them. */
export function fileImports(
  language: SourceLanguage,
  lines: readonly string[],
  maskedLines: readonly string[],
  uses: ReturnType<typeof phpUses> | undefined,
): ImportReference[] {
  if (language === "php" && uses !== undefined) {
    const named = uses.imports.map((hit) => ({ module: hit.module, line: hit.line, column: hit.column, bindings: [] }));
    return [...phpImportsFromRequires(lines, maskedLines), ...named];
  }
  const read = IMPORT_READERS[language];
  return read === undefined ? [] : read(lines, maskedLines);
}
