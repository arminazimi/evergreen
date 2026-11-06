/**
 * Pure, bounded parser for the declarations Evergreen reads from a Dart or Flutter `pubspec.yaml`: the
 * `environment.sdk` and `environment.flutter` constraints and the direct `dependencies` with a version.
 *
 * The contents are untrusted YAML. The parser follows the block structure line by line; it never evaluates,
 * imports, or executes anything and performs no I/O. It is not a YAML validator: it reports the malformed forms
 * listed below and otherwise reads only the keys it needs.
 *
 * Each declaration reports the value exactly as written and the 1-based line of its key:
 *
 * - `environment.sdk` yields a `dart-sdk` declaration and `environment.flutter` a `flutter-sdk` declaration;
 * - each direct entry of `dependencies` yields a `pub-dependency` declaration with its package name.
 *
 * A value is a constraint of one or more space-separated terms. Each term is an optional `^`, `>=`, `<=`, `>`, or
 * `<` followed by a full `x.y.z` version with an optional pre-release or build suffix, for example `^0.13.5`,
 * `0.17.0`, or `>=2.19.0 <3.0.0`. Exact versions carry no operator; `=` is not read.
 *
 * Unsupported forms return nothing for that entry rather than a guessed value:
 *
 * - `any`, empty values, and nested mappings: `flutter: sdk: flutter`, `path:`, `git:`, and `hosted:` entries
 *   without a `version:`;
 * - values that are not a constraint: `${…}` templates, flow collections, anchors, aliases, tags, and block
 *   scalars (a plain value that starts with `>` or `|`, so an unquoted `sdk: >=2.19.0` yields nothing);
 * - plain scalars that continue on a more-indented line, and quoted scalars that span lines or contain backslash
 *   escapes;
 * - `environment` or `dependencies` written inline (`dependencies: { http: ^1.0.0 }`) and their children;
 * - entries under any other key, including `dev_dependencies`, `dependency_overrides`, and `description`;
 * - package names that are not lowercase Dart identifiers (`[a-z][a-z0-9_]*`);
 * - comments: commented-out lines and trailing `# …` text after a value are never read.
 *
 * A malformed document returns nothing for the whole file rather than a partial result: an unterminated quoted
 * scalar, text after a closing quote, a tab used for indentation, a duplicate key at the top level or among the
 * children of `environment` or `dependencies`, and a line in a section indented less than its first entry. Lines
 * longer than MAXIMUM_LINE_LENGTH are skipped, and input larger than MAXIMUM_INPUT_BYTES returns nothing.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface DartSdkDeclaration {
  kind: "dart-sdk";
  /** The constraint exactly as written, for example `>=2.19.0 <3.0.0`. */
  value: string;
  /** The 1-based source line of the `sdk` key. */
  line: number;
}

export interface FlutterSdkDeclaration {
  kind: "flutter-sdk";
  /** The constraint exactly as written, for example `>=3.7.0`. */
  value: string;
  /** The 1-based source line of the `flutter` key. */
  line: number;
}

export interface PubDependencyDeclaration {
  kind: "pub-dependency";
  /** The package name exactly as written, for example `http`. */
  name: string;
  /** The version constraint exactly as written, for example `^0.13.5`. */
  value: string;
  /** The 1-based source line of the dependency key. */
  line: number;
}

export type PubspecDeclaration = DartSdkDeclaration | FlutterSdkDeclaration | PubDependencyDeclaration;

const KEY = /^([A-Za-z_][A-Za-z0-9_-]*):(?=\s|$)/;
const PACKAGE = /^[a-z][a-z0-9_]*$/;
const TERM = /^(?:\^|>=|<=|>|<)?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TRAILER = /^\s*(?:#.*)?$/;
const BLOCK_SCALAR = /^[>|]/;

/** The constraint text exactly as written, or undefined when any term is not a supported constraint term. */
function constraint(text: string): string | undefined {
  if (text === "") return undefined;
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
 * Read a quoted scalar that starts at `column` of `first`, continuing onto later lines when it does not close on its
 * own line. Returns undefined for malformed YAML: no closing quote before the end of the input, or text after the
 * closing quote other than a comment.
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
  return { text: supported && last === index ? text : undefined, last };
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
  while (line.charAt(column) === " " || line.charAt(column) === "\t") column += 1;
  const value = line.charAt(column);
  if (column >= line.length || value === "#") return { text: undefined, last: index };
  if (value === '"' || value === "'") return readQuoted(lines, line, index, column);

  const rest = line.slice(column);
  const comment = /\s#/.exec(rest);
  const text = (comment ? rest.slice(0, comment.index) : rest).trimEnd();
  const continued = (nextContentIndent(lines, index) ?? 0) > keyIndent;
  if (text === "" || continued || BLOCK_SCALAR.test(text)) return { text: undefined, last: index };
  return { text, last: index };
}

interface DeclaredKey {
  /** The key's text. */
  name: string;
  /** The width of `name:`, the text the key and its colon occupy. */
  width: number;
}

/** The mapping key that opens `body`, or undefined when the line opens no key. */
function declaredKey(body: string): DeclaredKey | undefined {
  const name = KEY.exec(body)?.[1];
  return name === undefined ? undefined : { name, width: name.length + 1 };
}

/** The state a line-by-line pubspec.yaml parse carries between lines. */
interface PubspecState {
  declarations: PubspecDeclaration[];
  /** Every top-level key seen so far; a duplicate makes the document malformed. */
  topLevel: Set<string>;
  section: "environment" | "dependencies" | undefined;
  childIndent: number | undefined;
  childKeys: Set<string>;
}

/** Record the declaration a section child makes, when its name and value are supported. */
function recordDeclaration(state: PubspecState, name: string, value: string, line: number): void {
  if (state.section === "environment") {
    if (name === "sdk") state.declarations.push({ kind: "dart-sdk", value, line });
    else if (name === "flutter") state.declarations.push({ kind: "flutter-sdk", value, line });
    return;
  }
  if (state.section === "dependencies" && PACKAGE.test(name)) {
    state.declarations.push({ kind: "pub-dependency", name, value, line });
  }
}

/** Handle an unindented key. Returns the index of the value's last line, or undefined for a malformed document. */
function scanPubspecTopLevel(
  state: PubspecState,
  lines: string[],
  raw: string,
  index: number,
  body: string,
  key: DeclaredKey | undefined,
): number | undefined {
  state.section = undefined;
  state.childIndent = undefined;
  state.childKeys = new Set<string>();
  if (!key) return index;

  const { name } = key;
  if (state.topLevel.has(name)) return undefined;
  state.topLevel.add(name);
  const scalar = readScalar(lines, raw, index, key.width, 0);
  if (!scalar) return undefined;
  const inline = body.slice(key.width).trim();
  const block = inline === "" || inline.startsWith("#");
  if (block && name === "environment") state.section = "environment";
  if (block && name === "dependencies") state.section = "dependencies";
  return scalar.last;
}

/** Handle a line inside `environment` or `dependencies`. Returns the index of the value's last line. */
function scanPubspecChild(
  state: PubspecState,
  lines: string[],
  raw: string,
  index: number,
  key: DeclaredKey | undefined,
  indent: number,
): number | undefined {
  if (!key) return index;

  const { name } = key;
  const direct = state.section !== undefined && indent === state.childIndent;
  if (direct) {
    if (state.childKeys.has(name)) return undefined;
    state.childKeys.add(name);
  }
  const keyLine = index + 1;
  const scalar = readScalar(lines, raw, index, indent + key.width, indent);
  if (!scalar) return undefined;
  if (!direct || scalar.text === undefined) return scalar.last;

  const value = constraint(scalar.text);
  if (value === undefined) return scalar.last;
  recordDeclaration(state, name, value, keyLine);
  return scalar.last;
}

/**
 * Read one line of the document and update `state`. Returns the index of the line the value ends on, or undefined
 * when the document is malformed and the whole file must yield no declarations.
 */
function scanPubspecLine(state: PubspecState, lines: string[], raw: string, index: number): number | undefined {
  if (raw.length > MAXIMUM_LINE_LENGTH) return index;
  const body = raw.replace(/^ */, "");
  const indent = raw.length - body.length;
  if (body.trim() === "" || body.startsWith("#")) return index;
  if (body.startsWith("\t")) return undefined;

  const key = declaredKey(body);
  if (indent === 0) return scanPubspecTopLevel(state, lines, raw, index, body, key);
  if (state.section !== undefined) {
    state.childIndent ??= indent;
    if (indent < state.childIndent) return undefined;
  }
  return scanPubspecChild(state, lines, raw, index, key, indent);
}

/**
 * Parse the `environment` constraints and the direct `dependencies` from the contents of a pubspec.yaml. Keys are
 * returned in document order. Nothing is evaluated, and a malformed document returns no declarations.
 */
export function parsePubspec(contents: string): PubspecDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/);
  const state: PubspecState = {
    declarations: [],
    topLevel: new Set<string>(),
    section: undefined,
    childIndent: undefined,
    childKeys: new Set<string>(),
  };

  // The loop owns its line, so a missing line is the end of the document and `index` may jump past a multi-line value.
  for (let index = 0, raw = lines[0]; raw !== undefined; raw = lines[++index]) {
    const last = scanPubspecLine(state, lines, raw, index);
    if (last === undefined) return [];
    index = last;
  }

  return state.declarations;
}
