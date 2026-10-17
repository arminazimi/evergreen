import { LineCounter, Scalar, isMap, isScalar, isSeq, parseDocument, visit } from "yaml";
import type { YAMLMap } from "yaml";

import { isKind, splitApiVersion } from "./api-version.js";
import { readApiDeclaration } from "./parse-manifest.js";
import type { ApiDeclaration } from "./parse-manifest.js";

/**
 * Pure, bounded parser for `kustomization.yaml`.
 *
 * Three things are read, each only when literal:
 * - `resources` entries that are local paths (a remote URL, a `$(VAR)`, and a
 *   host-like first segment such as `github.com/org/repo` are not local paths);
 * - an inline strategic-merge patch written as a block scalar (`patch: |-`) that has its
 *   own `apiVersion` and `kind`, with the line inside the patch mapped to the file;
 * - a patch `target` with `group`, `version`, and `kind`, which names the API of the
 *   resource being patched.
 *
 * The file's own `apiVersion: kustomize.config.k8s.io/...` is not a declaration, and
 * `bases`, `components`, generators, and transformers are not followed. A file with a
 * syntax error or a YAML alias yields nothing. The parser never evaluates contents or
 * executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_ENTRIES = 5000;
export const MAXIMUM_PATCH_BYTES = 64 * 1024;
export const MAXIMUM_PATH_LENGTH = 1024;

export interface ResourceReference {
  kind: "resource";
  /** The path as written, relative to the kustomization. */
  value: string;
  line: number;
}

export type KustomizeDeclaration = ApiDeclaration | ResourceReference;

function stringAt(map: YAMLMap, key: string, lines: LineCounter): { text: string; line: number } | undefined {
  const node = map.get(key, true);
  if (!isScalar(node) || !node.range) return undefined;
  const raw: unknown = node.value;
  if (typeof raw !== "string") return undefined;
  if (node.type !== Scalar.PLAIN && node.type !== Scalar.QUOTE_DOUBLE && node.type !== Scalar.QUOTE_SINGLE) {
    return undefined;
  }
  return { text: raw.trim(), line: lines.linePos(node.range[0]).line };
}

function isLocalPath(value: string): boolean {
  if (value.length === 0 || value.length > MAXIMUM_PATH_LENGTH) return false;
  if (value.includes("://") || value.includes("$(") || value.includes("?") || value.includes("\0")) return false;
  if (value.startsWith("git@") || value.startsWith("/") || value.includes("\\")) return false;
  return !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\//.test(value);
}

function entries(map: YAMLMap, key: string) {
  const node = map.get(key, true);
  return isSeq(node) && node.items.length <= MAXIMUM_ENTRIES ? node.items : [];
}

/** The API a patch `target` names, from literal `group`, `version`, and `kind`. */
function readTarget(target: unknown, lines: LineCounter): ApiDeclaration | undefined {
  if (!isMap(target)) return undefined;
  const version = stringAt(target, "version", lines);
  const resource = stringAt(target, "kind", lines);
  const group = target.has("group") ? stringAt(target, "group", lines) : { text: "", line: 0 };
  if (!version || !resource || !group || !isKind(resource.text)) return undefined;
  const value = group.text ? `${group.text}/${version.text}` : version.text;
  const parts = splitApiVersion(value);
  if (!parts || parts.version !== version.text) return undefined;
  return {
    kind: "api",
    value,
    group: parts.group,
    version: parts.version,
    resource: resource.text,
    line: version.line,
    kindLine: resource.line,
  };
}

/** The declaration of an inline strategic-merge patch written as a block scalar. */
function readInlinePatch(node: unknown, lines: LineCounter): ApiDeclaration | undefined {
  if (!isScalar(node) || node.type !== Scalar.BLOCK_LITERAL || !node.range) return undefined;
  const raw: unknown = node.value;
  if (typeof raw !== "string" || Buffer.byteLength(raw, "utf8") > MAXIMUM_PATCH_BYTES) return undefined;
  const headerLine = lines.linePos(node.range[0]).line;

  const inner = new LineCounter();
  const document = parseDocument(raw, { lineCounter: inner, merge: false });
  if (document.errors.length > 0 || !isMap(document.contents)) return undefined;
  const declaration = readApiDeclaration(document.contents, inner);
  if (!declaration) return undefined;
  // The block's first content line is the line after its header.
  return { ...declaration, line: headerLine + declaration.line, kindLine: headerLine + declaration.kindLine };
}

/** Parse kustomization declarations without file, network, or process I/O. */
export function parseKustomization(contents: string): KustomizeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lines = new LineCounter();
    const document = parseDocument(contents, { lineCounter: lines, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];
    const root = document.contents;

    let aliased = false;
    visit(document, {
      Alias() {
        aliased = true;
        return visit.BREAK;
      },
    });
    if (aliased) return [];

    // A file that says it is some other kind of object is not a kustomization.
    const kind: unknown = root.get("kind");
    if (kind !== undefined && kind !== "Kustomization" && kind !== "Component") return [];

    const declarations: KustomizeDeclaration[] = [];

    for (const item of entries(root, "resources")) {
      if (!isScalar(item) || typeof item.value !== "string" || !item.range) continue;
      const value = item.value.trim();
      if (isLocalPath(value)) declarations.push({ kind: "resource", value, line: lines.linePos(item.range[0]).line });
    }

    for (const key of ["patches", "patchesJson6902"]) {
      for (const item of entries(root, key)) {
        if (!isMap(item)) continue;
        const target = readTarget(item.get("target", true), lines);
        if (target) declarations.push(target);
        const inline = readInlinePatch(item.get("patch", true), lines);
        if (inline) declarations.push(inline);
      }
    }

    for (const item of entries(root, "patchesStrategicMerge")) {
      const inline = readInlinePatch(item, lines);
      if (inline) declarations.push(inline);
    }

    return declarations.sort((left, right) => left.line - right.line);
  } catch {
    return [];
  }
}
