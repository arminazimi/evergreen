import { LineCounter, Scalar, isMap, isScalar, isSeq, parseAllDocuments, visit } from "yaml";
import type { Document, YAMLMap } from "yaml";

import { isKind, splitApiVersion } from "./api-version.js";

/**
 * Pure, bounded parser for the `apiVersion` and `kind` of Kubernetes manifests.
 *
 * Each `---`-separated document is read on its own, and only its top-level keys: a
 * nested `apiVersion` (an `ownerReferences` entry, a CRD version name) is not a
 * declaration. A declaration needs both keys as literal strings in one document.
 * A document that uses a YAML alias is skipped, `kind: List` items are unpacked recursively, and
 * a file with any syntax error yields nothing, including from its valid documents.
 * The parser never evaluates contents or executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_DOCUMENTS = 500;

export interface ApiDeclaration {
  kind: "api";
  /** The `apiVersion` as written, for example `extensions/v1beta1`. */
  value: string;
  /** The API group; empty for the core group. */
  group: string;
  /** The version part of `apiVersion`, for example `v1beta1`. */
  version: string;
  /** The object's `kind`, for example `Ingress`. */
  resource: string;
  /** One-based line of the `apiVersion` value. */
  line: number;
  /** One-based line of the `kind` value. */
  kindLine: number;
}

/** Read a literal string scalar (plain or quoted) at a key of a mapping. */
function literal(map: YAMLMap, key: string, lines: LineCounter): { text: string; line: number } | undefined {
  const node = map.get(key, true);
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return undefined;
  if (node.type !== Scalar.PLAIN && node.type !== Scalar.QUOTE_DOUBLE && node.type !== Scalar.QUOTE_SINGLE) {
    return undefined;
  }
  return { text: node.value.trim(), line: lines.linePos(node.range[0]).line };
}

/** Read a declaration from a mapping's own `apiVersion` and `kind`. */
export function readApiDeclaration(map: YAMLMap, lines: LineCounter): ApiDeclaration | undefined {
  const apiVersion = literal(map, "apiVersion", lines);
  const resource = literal(map, "kind", lines);
  if (!apiVersion || !resource || !isKind(resource.text)) return undefined;
  const parts = splitApiVersion(apiVersion.text);
  if (!parts) return undefined;
  return {
    kind: "api",
    value: apiVersion.text,
    group: parts.group,
    version: parts.version,
    resource: resource.text,
    line: apiVersion.line,
    kindLine: resource.line,
  };
}

function hasAlias(document: Document.Parsed): boolean {
  let aliased = false;
  visit(document, {
    Alias() {
      aliased = true;
      return visit.BREAK;
    },
  });
  return aliased;
}

/** Parse Kubernetes manifest declarations without file, network, or process I/O. */
function processMap(
  map: YAMLMap,
  lines: LineCounter,
  declarations: ApiDeclaration[],
  depth = 0,
): void {
  if (depth > 10) return;

  const declaration = readApiDeclaration(map, lines);
  if (declaration) declarations.push(declaration);

  const resource = literal(map, "kind", lines);
  if (resource?.text === "List") {
    const items = map.get("items", true);
    if (isSeq(items)) {
      for (const item of items.items) {
        if (isMap(item)) {
          processMap(item, lines, declarations, depth + 1);
        }
      }
    }
  }
}

/** Parse Kubernetes manifest declarations without file, network, or process I/O. */
export function parseManifest(contents: string): ApiDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lines = new LineCounter();
    const documents = parseAllDocuments(contents, { lineCounter: lines, merge: false });
    const list = Array.isArray(documents) ? documents : [documents];
    if (list.length > MAXIMUM_DOCUMENTS) return [];
    if (list.some((document) => document.errors.length > 0)) return [];

    const declarations: ApiDeclaration[] = [];
    for (const document of list) {
      if (!isMap(document.contents) || hasAlias(document)) continue;
      processMap(document.contents, lines, declarations);
    }
    return declarations;
  } catch {
    return [];
  }
}
