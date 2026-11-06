import { LineCounter, Scalar, isMap, isScalar, parseDocument } from "yaml";
import type { YAMLMap } from "yaml";

/**
 * Pure, bounded parser for Lambda `Runtime` declarations in AWS SAM and CloudFormation
 * `template.yaml` / `template.yml` files.
 *
 * Reads a literal `Globals.Function.Runtime` and each `Properties.Runtime` on an
 * `AWS::Serverless::Function` or `AWS::Lambda::Function` resource. Quotes are not part of
 * the value. CloudFormation tags (`!Ref`, `!Sub`), `Ref` mappings, parameter defaults,
 * environment variables named `Runtime`, image functions without `Runtime`, comments,
 * and unrelated keys return nothing. A file with any syntax error yields no declarations,
 * including from lines that appear before the error. The parser never evaluates contents
 * or executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

const FUNCTION_TYPES = new Set(["AWS::Serverless::Function", "AWS::Lambda::Function"]);

export interface RuntimeDeclaration {
  /** The runtime identifier as written, for example `nodejs14.x`. */
  value: string;
  /** One-based line of the `Runtime` value. */
  line: number;
}

/** Read a plain or quoted string scalar at a key; custom tags and other forms are skipped. */
function literal(map: YAMLMap, key: string, lines: LineCounter): RuntimeDeclaration | undefined {
  const node = map.get(key, true);
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) return undefined;
  if (node.tag !== undefined && node.tag !== "tag:yaml.org,2002:str") return undefined;
  if (node.type !== Scalar.PLAIN && node.type !== Scalar.QUOTE_DOUBLE && node.type !== Scalar.QUOTE_SINGLE) {
    return undefined;
  }
  const value = node.value.trim();
  if (value.length === 0 || value.length > MAXIMUM_LINE_LENGTH) return undefined;
  return { value, line: lines.linePos(node.range[0]).line };
}

function asMap(node: unknown): YAMLMap | undefined {
  return isMap(node) ? node : undefined;
}

/** `Globals.Function` holds the Runtime that every function inherits. */
function globalRuntime(root: YAMLMap, lines: LineCounter): RuntimeDeclaration | undefined {
  const globals = asMap(root.get("Globals", true));
  const globalFunction = globals && asMap(globals.get("Function", true));
  return globalFunction ? literal(globalFunction, "Runtime", lines) : undefined;
}

/** True for a resource whose `Type` is a Lambda function. */
function isFunctionResource(resource: YAMLMap): boolean {
  const type = resource.get("Type", true);
  return isScalar(type) && typeof type.value === "string" && FUNCTION_TYPES.has(type.value);
}

/** The Runtime declared in a function resource's `Properties`, if it has one. */
function functionRuntime(node: unknown, lines: LineCounter): RuntimeDeclaration | undefined {
  const resource = asMap(node);
  if (!resource || !isFunctionResource(resource)) return undefined;
  const properties = asMap(resource.get("Properties", true));
  return properties ? literal(properties, "Runtime", lines) : undefined;
}

/** Parse SAM and CloudFormation Runtime declarations without file, network, or process I/O. */
export function parseTemplate(contents: string): RuntimeDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  try {
    const lines = new LineCounter();
    const document = parseDocument(contents, {
      lineCounter: lines,
      merge: false,
    });
    if (document.errors.length > 0 || !isMap(document.contents)) return [];

    const root = document.contents;
    const declarations: RuntimeDeclaration[] = [];
    const inherited = globalRuntime(root, lines);
    if (inherited) declarations.push(inherited);

    const resources = asMap(root.get("Resources", true));
    for (const item of resources?.items ?? []) {
      const runtime = functionRuntime(item.value, lines);
      if (runtime) declarations.push(runtime);
    }
    return declarations;
  } catch {
    return [];
  }
}
