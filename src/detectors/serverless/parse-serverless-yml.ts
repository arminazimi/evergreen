import { LineCounter, Scalar, isMap, isScalar, parseDocument } from "yaml";
import type { YAMLMap } from "yaml";

/**
 * Pure, bounded parser for `provider.runtime` and per-function `runtime` in
 * Serverless Framework `serverless.yml` files.
 *
 * Reads a literal `provider.runtime` and each function's own `runtime`. Quotes are
 * not part of the value. A function that omits `runtime` is not a second declaration
 * from the provider. Serverless `${...}` interpolations, floating values such as
 * `latest`, `custom.runtime`, description strings, image functions without `runtime`,
 * comments, and unrelated keys return nothing. A file with any syntax error yields no
 * declarations, including from lines that appear before the error. The parser never
 * evaluates contents or executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface RuntimeDeclaration {
  /** The runtime identifier as written, for example `nodejs14.x`. */
  value: string;
  /** One-based line of the `runtime` value. */
  line: number;
  /** The cloud whose runtime ids apply, when the declaration says so: AWS and Cloud Functions share some ids. */
  platform?: "aws" | "gcp";
}

/** True when the value is a Serverless variable or another non-literal form. */
function isDynamic(value: string): boolean {
  return value.includes("${") || value.includes("$") || value.includes("#{");
}

/** True when the value is a floating alias rather than a concrete runtime. */
function isFloating(value: string): boolean {
  return value === "latest" || value.endsWith("-latest");
}

/** Read a plain or quoted string scalar at a key; dynamic and floating forms are skipped. */
function literal(map: YAMLMap, key: string, lines: LineCounter): RuntimeDeclaration | undefined {
  const node = map.get(key, true);
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return undefined;
  if (node.tag !== undefined && node.tag !== "tag:yaml.org,2002:str") return undefined;
  if (node.type !== Scalar.PLAIN && node.type !== Scalar.QUOTE_DOUBLE && node.type !== Scalar.QUOTE_SINGLE) {
    return undefined;
  }
  const value = node.value.trim();
  if (value.length === 0 || value.length > MAXIMUM_LINE_LENGTH) return undefined;
  if (isDynamic(value) || isFloating(value)) return undefined;
  return { value, line: lines.linePos(node.range[0]).line };
}

function asMap(node: unknown): YAMLMap | undefined {
  return isMap(node) ? node : undefined;
}

/** Parse Serverless Framework runtime declarations without file, network, or process I/O. */
export function parseServerlessYml(contents: string): RuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lines = new LineCounter();
    const document = parseDocument(contents, { lineCounter: lines, merge: false });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];

    const declarations: RuntimeDeclaration[] = [];
    const root = document.contents;

    const provider = asMap(root.get("provider", true));
    const providerRuntime = provider && literal(provider, "runtime", lines);
    if (providerRuntime) declarations.push(providerRuntime);

    const functions = asMap(root.get("functions", true));
    if (!functions) return declarations;

    for (const item of functions.items) {
      const fn = asMap(item.value);
      if (!fn) continue;
      const runtime = literal(fn, "runtime", lines);
      if (runtime) declarations.push(runtime);
    }

    return declarations;
  } catch {
    return [];
  }
}
