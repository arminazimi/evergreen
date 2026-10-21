import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  type DartSdkDeclaration,
  type FlutterSdkDeclaration,
} from "./parse-pubspec.js";

/**
 * Pure, bounded parser for the declarations Evergreen reads from a Dart or Flutter `pubspec.lock`: the resolved
 * version of each hosted package and the `sdks` constraints.
 *
 * The contents are untrusted YAML written by pub. The parser follows the block structure line by line; it never
 * evaluates, imports, or executes anything and performs no I/O. It is not a YAML validator: it reports the malformed
 * forms listed below and otherwise reads only the keys it needs.
 *
 * Each declaration reports the value exactly as written and the 1-based line of the key it came from:
 *
 * - each entry under `packages` with `source: hosted` and a semantic `version` yields a `pub-package` declaration
 *   with the package name and the line of its `version` key;
 * - `sdks.dart` yields a `dart-sdk` declaration and `sdks.flutter` a `flutter-sdk` declaration, the same kinds
 *   `parsePubspec` reports for `environment`, with the line of their keys.
 *
 * Unsupported forms return nothing for that entry rather than a guessed value:
 *
 * - `source: git`, `source: path`, and `source: sdk` (the `flutter` and `flutter_test` SDK packages); an entry with
 *   no `source` or no `version`;
 * - a `version` that is not a plain `x.y.z` semantic version, and an `sdks` value that is not a constraint: `${…}`
 *   templates, `any`, `||` ranges, empty values, and versions without all three components;
 * - a value that is not a single scalar: a flow collection that closes on its line (`[1.6.0]`), a block scalar (a
 *   plain value that starts with `>` or `|`), a plain value continued on a more-indented line, a quoted value that
 *   spans lines, and a double-quoted value with a backslash escape;
 * - an entry written inline (`  http: {}`) and everything nested under it;
 * - package names that are not lowercase Dart identifiers (`[a-z][a-z0-9_]*`);
 * - `sdks` keys other than `dart` and `flutter`, nested mappings such as `description`, and every other top-level key;
 * - comments: commented-out lines and trailing `# …` text after a value are never read.
 *
 * A malformed document returns nothing for the whole file rather than a partial result: a tab used for indentation,
 * a duplicate key in the same mapping, a child indented less than its section's first entry or an entry's field
 * indented less than its first field, a quoted scalar with no closing quote after it, text after a closing quote,
 * a flow collection that does not end its line with its closing bracket, a line longer than MAXIMUM_LINE_LENGTH, and
 * input larger than MAXIMUM_INPUT_BYTES.
 */

export { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH };

export interface PubPackageDeclaration {
  kind: "pub-package";
  /** The package name exactly as written, for example `http`. */
  name: string;
  /** The resolved version exactly as written, for example `0.13.6`. */
  value: string;
  /** The 1-based source line of the `version` key. */
  line: number;
}

export type PubspecLockDeclaration = DartSdkDeclaration | FlutterSdkDeclaration | PubPackageDeclaration;

const KEY = /^([A-Za-z_][A-Za-z0-9_-]*):(?=\s|$)/;
const PACKAGE = /^[a-z][a-z0-9_]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TERM = /^(?:\^|>=|<=|>|<)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TRAILER = /^\s*(?:#.*)?$/;
const BLOCK_SCALAR = /^[>|]/;

interface PackageEntry {
  name: string;
  /** The indentation of the entry's first field; deeper lines belong to nested mappings. */
  fieldIndent?: number;
  fields: Map<string, { text: string | undefined; line: number }>;
}

/** The constraint text exactly as written, or undefined when any term is not a supported constraint term. */
function constraint(text: string): string | undefined {
  return text.split(/\s+/).every((term) => TERM.test(term)) ? text : undefined;
}

/** The first non-blank, non-comment line after `index` and its indentation, or undefined at the end. */
function nextContentIndent(lines: string[], index: number): number | undefined {
  for (let next = index + 1; next < lines.length; next += 1) {
    const raw = lines[next]!;
    const body = raw.trimStart();
    if (body === "" || body.startsWith("#")) continue;
    return raw.length - body.length;
  }
  return undefined;
}

interface Scalar {
  /** The literal text, or undefined for an empty or unsupported value. */
  text: string | undefined;
  /** The index of the last line the value occupies. */
  last: number;
}

/**
 * Read a quoted scalar that starts at `column` of `lines[index]`, continuing onto later lines when it does not close on
 * its own line. Returns undefined for malformed YAML: no closing quote after it, or text after the closing quote other
 * than a comment.
 */
function readQuoted(lines: string[], index: number, column: number): Scalar | undefined {
  const quote = lines[index]![column]!;
  let text = "";
  let supported = true;
  let line = index;
  let position = column + 1;
  for (;;) {
    const current = lines[line]!;
    let closed = false;
    while (position < current.length) {
      const character = current[position]!;
      if (quote === '"' && character === "\\") {
        supported = false;
        position += 2;
        continue;
      }
      if (character === quote) {
        if (quote === "'" && current[position + 1] === "'") {
          text += "'";
          position += 2;
          continue;
        }
        closed = true;
        break;
      }
      text += character;
      position += 1;
    }
    if (closed) break;
    line += 1;
    if (line >= lines.length) return undefined;
    position = 0;
    supported = false;
  }
  if (!TRAILER.test(lines[line]!.slice(position + 1))) return undefined;
  return { text: supported ? text : undefined, last: line };
}

/**
 * Read the value that starts at `start` on `lines[index]`, the line of a key indented by `keyIndent`. Plain values
 * are cut at a trailing comment. Returns undefined for malformed YAML.
 */
function readScalar(lines: string[], index: number, start: number, keyIndent: number): Scalar | undefined {
  const line = lines[index]!;
  let column = start;
  while (line[column] === " ") column += 1;
  if (column >= line.length || line[column] === "#") return { text: undefined, last: index };
  const first = line[column]!;
  if (first === '"' || first === "'") return readQuoted(lines, index, column);

  const rest = line.slice(column);
  const comment = /\s#/.exec(rest);
  const text = (comment ? rest.slice(0, comment.index) : rest).trimEnd();
  if (first === "[" || first === "{") {
    return text.endsWith(first === "[" ? "]" : "}") ? { text: undefined, last: index } : undefined;
  }
  const continued = (nextContentIndent(lines, index) ?? 0) > keyIndent;
  if (continued || BLOCK_SCALAR.test(text)) return { text: undefined, last: index };
  return { text, last: index };
}

/** The hosted package declaration for a finished entry, or undefined when the entry is not a supported hosted package. */
function packageDeclaration(entry: PackageEntry | undefined): PubPackageDeclaration | undefined {
  if (!entry || !PACKAGE.test(entry.name)) return undefined;
  const source = entry.fields.get("source")?.text;
  const version = entry.fields.get("version");
  const text = version?.text;
  if (source !== "hosted" || version === undefined || text === undefined || !VERSION.test(text)) return undefined;
  return { kind: "pub-package", name: entry.name, value: text, line: version.line };
}

/**
 * Parse the resolved hosted packages under `packages` and the `dart` and `flutter` constraints under `sdks` from the
 * contents of a pubspec.lock. Declarations are returned in document order. Nothing is evaluated, and a malformed
 * document returns no declarations.
 */
export function parsePubspecLock(contents: string): PubspecLockDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/);
  const declarations: PubspecLockDeclaration[] = [];
  const topLevel = new Set<string>();
  let section: "packages" | "sdks" | undefined;
  let childIndent: number | undefined;
  let childKeys = new Set<string>();
  let entry: PackageEntry | undefined;

  const closeEntry = (): void => {
    const declaration = packageDeclaration(entry);
    if (declaration) declarations.push(declaration);
    entry = undefined;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    if (raw.length > MAXIMUM_LINE_LENGTH) return [];
    const indent = /^ */.exec(raw)![0].length;
    const body = raw.slice(indent);
    if (body.trim() === "" || body.startsWith("#")) continue;
    if (body.startsWith("\t")) return [];

    if (indent === 0) {
      closeEntry();
      section = undefined;
      childIndent = undefined;
      childKeys = new Set<string>();
      const key = KEY.exec(body);
      if (!key) continue;

      const name = key[1]!;
      if (topLevel.has(name)) return [];
      topLevel.add(name);
      const scalar = readScalar(lines, index, key[0].length, 0);
      if (!scalar) return [];
      const inline = body.slice(key[0].length).trim();
      if ((inline === "" || inline.startsWith("#")) && (name === "packages" || name === "sdks")) section = name;
      index = scalar.last;
      continue;
    }

    if (section === undefined) continue;
    childIndent ??= indent;
    if (indent < childIndent) return [];

    if (indent > childIndent) {
      if (entry) {
        entry.fieldIndent ??= indent;
        if (indent < entry.fieldIndent) return [];
        const field = KEY.exec(body);
        if (indent === entry.fieldIndent && field) {
          const name = field[1]!;
          if (entry.fields.has(name)) return [];
          const keyLine = index + 1;
          const scalar = readScalar(lines, index, indent + field[0].length, indent);
          if (!scalar) return [];
          entry.fields.set(name, { text: scalar.text, line: keyLine });
          index = scalar.last;
        }
      }
      continue;
    }

    closeEntry();
    const key = KEY.exec(body);
    if (!key) continue;

    const name = key[1]!;
    if (childKeys.has(name)) return [];
    childKeys.add(name);
    const keyLine = index + 1;
    const scalar = readScalar(lines, index, indent + key[0].length, indent);
    if (!scalar) return [];
    index = scalar.last;

    if (section === "packages") {
      const inline = body.slice(key[0].length).trim();
      if (inline === "" || inline.startsWith("#")) entry = { name, fields: new Map() };
      continue;
    }
    if (scalar.text === undefined) continue;
    const value = constraint(scalar.text);
    if (value === undefined) continue;
    if (name === "dart") {
      declarations.push({ kind: "dart-sdk", value, line: keyLine });
    } else if (name === "flutter") {
      declarations.push({ kind: "flutter-sdk", value, line: keyLine });
    }
  }

  closeEntry();
  return declarations;
}
