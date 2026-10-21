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
 * Read a quoted scalar that starts at `column` of `lines[index]`, continuing onto later lines when it does not
 * close on its own line. Returns undefined for malformed YAML: no closing quote before the end of the input, or text
 * after the closing quote other than a comment.
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
  return { text: supported && line === index ? text : undefined, last: line };
}

/**
 * Read the value that starts at `start` on `lines[index]`, the line of a key indented by `keyIndent`. Plain values
 * are cut at a trailing comment. Returns undefined for malformed YAML.
 */
function readScalar(lines: string[], index: number, start: number, keyIndent: number): Scalar | undefined {
  const line = lines[index]!;
  let column = start;
  while (line[column] === " " || line[column] === "\t") column += 1;
  if (column >= line.length || line[column] === "#") return { text: undefined, last: index };
  if (line[column] === '"' || line[column] === "'") return readQuoted(lines, index, column);

  const rest = line.slice(column);
  const comment = /\s#/.exec(rest);
  const text = (comment ? rest.slice(0, comment.index) : rest).trimEnd();
  const continued = (nextContentIndent(lines, index) ?? 0) > keyIndent;
  if (text === "" || continued || BLOCK_SCALAR.test(text)) return { text: undefined, last: index };
  return { text, last: index };
}

/**
 * Parse the `environment` constraints and the direct `dependencies` from the contents of a pubspec.yaml. Keys are
 * returned in document order. Nothing is evaluated, and a malformed document returns no declarations.
 */
export function parsePubspec(contents: string): PubspecDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const lines = contents.replace(/^\uFEFF/, "").split(/\r?\n/);
  const declarations: PubspecDeclaration[] = [];
  const topLevel = new Set<string>();
  let section: "environment" | "dependencies" | undefined;
  let childIndent: number | undefined;
  let childKeys = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!;
    if (raw.length > MAXIMUM_LINE_LENGTH) continue;
    const indent = /^ */.exec(raw)![0].length;
    const body = raw.slice(indent);
    if (body.trim() === "" || body.startsWith("#")) continue;
    if (body.startsWith("\t")) return [];

    const key = KEY.exec(body);
    if (indent === 0) {
      section = undefined;
      childIndent = undefined;
      childKeys = new Set<string>();
      if (!key) continue;

      const name = key[1]!;
      if (topLevel.has(name)) return [];
      topLevel.add(name);
      const scalar = readScalar(lines, index, key[0].length, 0);
      if (!scalar) return [];
      const inline = body.slice(key[0].length).trim();
      const block = inline === "" || inline.startsWith("#");
      if (block && name === "environment") section = "environment";
      if (block && name === "dependencies") section = "dependencies";
      index = scalar.last;
      continue;
    }

    if (section !== undefined) {
      childIndent ??= indent;
      if (indent < childIndent) return [];
    }
    if (!key) continue;

    const name = key[1]!;
    const direct = section !== undefined && indent === childIndent;
    if (direct) {
      if (childKeys.has(name)) return [];
      childKeys.add(name);
    }
    const keyLine = index + 1;
    const scalar = readScalar(lines, index, indent + key[0].length, indent);
    if (!scalar) return [];
    index = scalar.last;
    if (!direct || scalar.text === undefined) continue;

    const value = constraint(scalar.text);
    if (value === undefined) continue;
    if (section === "environment" && name === "sdk") {
      declarations.push({ kind: "dart-sdk", value, line: keyLine });
    } else if (section === "environment" && name === "flutter") {
      declarations.push({ kind: "flutter-sdk", value, line: keyLine });
    } else if (section === "dependencies" && PACKAGE.test(name)) {
      declarations.push({ kind: "pub-dependency", name, value, line: keyLine });
    }
  }

  return declarations;
}
