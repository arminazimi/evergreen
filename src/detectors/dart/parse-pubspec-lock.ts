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
  for (const [next, raw] of lines.entries()) {
    if (next <= index) continue;
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
 * Read a quoted scalar that starts at `column` of `first`, continuing onto later lines when it does not close on
 * its own line. Returns undefined for malformed YAML: no closing quote after it, or text after the closing quote other
 * than a comment.
 */
function readQuoted(lines: string[], first: string, index: number, column: number): Scalar | undefined {
  const quote = first.charAt(column);
  let text = "";
  let supported = true;
  let last = index;
  let position = column + 1;
  let current = first;
  for (;;) {
    let closed = false;
    while (position < current.length) {
      const character = current.charAt(position);
      if (quote === '"' && character === "\\") {
        supported = false;
        position += 2;
        continue;
      }
      if (character === quote) {
        if (quote === "'" && current.charAt(position + 1) === "'") {
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
    last += 1;
    const following = lines[last];
    if (following === undefined) return undefined;
    current = following;
    position = 0;
    supported = false;
  }
  if (!TRAILER.test(current.slice(position + 1))) return undefined;
  return { text: supported ? text : undefined, last };
}

/**
 * Read the value that starts at `start` on `line`, the line at `index`, of a key indented by `keyIndent`. Plain values
 * are cut at a trailing comment. Returns undefined for malformed YAML.
 */
function readScalar(
  lines: string[],
  line: string,
  index: number,
  start: number,
  keyIndent: number,
): Scalar | undefined {
  let column = start;
  while (line.charAt(column) === " ") column += 1;
  if (column >= line.length || line.charAt(column) === "#") return { text: undefined, last: index };
  const first = line.charAt(column);
  if (first === '"' || first === "'") return readQuoted(lines, line, index, column);

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

/** The state a line-by-line pubspec.lock parse carries between lines. */
interface LockState {
  declarations: PubspecLockDeclaration[];
  /** Every top-level key seen so far; a duplicate makes the document malformed. */
  topLevel: Set<string>;
  section: "packages" | "sdks" | undefined;
  childIndent: number | undefined;
  childKeys: Set<string>;
  entry: PackageEntry | undefined;
}

/** Finish the package entry that is open, if any, and record it when it is a supported hosted package. */
function closeEntry(state: LockState): void {
  const declaration = packageDeclaration(state.entry);
  if (declaration) state.declarations.push(declaration);
  state.entry = undefined;
}

/** Handle an unindented key. Returns the index of the value's last line, or undefined for a malformed document. */
function scanTopLevel(state: LockState, lines: string[], raw: string, index: number, body: string): number | undefined {
  closeEntry(state);
  state.section = undefined;
  state.childIndent = undefined;
  state.childKeys = new Set<string>();
  const key = KEY.exec(body);
  if (!key) return index;

  // `KEY` is the name plus the colon that ends it, and the colon is its last character.
  const name = key[0].slice(0, -1);
  if (state.topLevel.has(name)) return undefined;
  state.topLevel.add(name);
  const scalar = readScalar(lines, raw, index, key[0].length, 0);
  if (!scalar) return undefined;
  const inline = body.slice(key[0].length).trim();
  if ((inline === "" || inline.startsWith("#")) && (name === "packages" || name === "sdks")) state.section = name;
  return scalar.last;
}

/** Handle a field of the package entry that is open. Returns the index of the value's last line. */
function scanEntryField(
  state: LockState,
  lines: string[],
  raw: string,
  index: number,
  body: string,
  indent: number,
): number | undefined {
  const entry = state.entry;
  if (!entry) return index;
  entry.fieldIndent ??= indent;
  if (indent < entry.fieldIndent) return undefined;
  const field = KEY.exec(body);
  if (indent !== entry.fieldIndent || !field) return index;
  const name = field[0].slice(0, -1);
  if (entry.fields.has(name)) return undefined;
  const keyLine = index + 1;
  const scalar = readScalar(lines, raw, index, indent + field[0].length, indent);
  if (!scalar) return undefined;
  entry.fields.set(name, { text: scalar.text, line: keyLine });
  return scalar.last;
}

/** Handle a direct child of the open `packages` or `sdks` section. Returns the index of the value's last line. */
function scanSectionChild(
  state: LockState,
  lines: string[],
  raw: string,
  index: number,
  body: string,
  indent: number,
): number | undefined {
  closeEntry(state);
  const key = KEY.exec(body);
  if (!key) return index;

  const name = key[0].slice(0, -1);
  if (state.childKeys.has(name)) return undefined;
  state.childKeys.add(name);
  const keyLine = index + 1;
  const scalar = readScalar(lines, raw, index, indent + key[0].length, indent);
  if (!scalar) return undefined;

  if (state.section === "packages") {
    const inline = body.slice(key[0].length).trim();
    if (inline === "" || inline.startsWith("#")) state.entry = { name, fields: new Map() };
    return scalar.last;
  }
  if (scalar.text === undefined) return scalar.last;
  const value = constraint(scalar.text);
  if (value === undefined) return scalar.last;
  if (name === "dart") {
    state.declarations.push({ kind: "dart-sdk", value, line: keyLine });
  } else if (name === "flutter") {
    state.declarations.push({ kind: "flutter-sdk", value, line: keyLine });
  }
  return scalar.last;
}

/**
 * Read one line of the document and update `state`. Returns the index of the line the value ends on, or undefined
 * when the document is malformed and the whole file must yield no declarations.
 */
function scanLockLine(state: LockState, lines: string[], raw: string, index: number): number | undefined {
  if (raw.length > MAXIMUM_LINE_LENGTH) return undefined;
  const body = raw.replace(/^ */, "");
  const indent = raw.length - body.length;
  if (body.trim() === "" || body.startsWith("#")) return index;
  if (body.startsWith("\t")) return undefined;

  if (indent === 0) return scanTopLevel(state, lines, raw, index, body);
  if (state.section === undefined) return index;
  state.childIndent ??= indent;
  if (indent < state.childIndent) return undefined;
  if (indent > state.childIndent) return scanEntryField(state, lines, raw, index, body, indent);
  return scanSectionChild(state, lines, raw, index, body, indent);
}

/**
 * Parse the resolved hosted packages under `packages` and the `dart` and `flutter` constraints under `sdks` from the
 * contents of a pubspec.lock. Declarations are returned in document order. Nothing is evaluated, and a malformed
 * document returns no declarations.
 */
export function parsePubspecLock(contents: string): PubspecLockDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/);
  const state: LockState = {
    declarations: [],
    topLevel: new Set<string>(),
    section: undefined,
    childIndent: undefined,
    childKeys: new Set<string>(),
    entry: undefined,
  };

  for (let index = 0, raw = lines[0]; raw !== undefined; raw = lines[++index]) {
    const last = scanLockLine(state, lines, raw, index);
    if (last === undefined) return [];
    index = last;
  }

  closeEntry(state);
  return state.declarations;
}
