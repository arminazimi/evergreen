import { isInterpolated, parseImageReference } from "./parse-image.js";

/**
 * Pure, bounded parser for the `FROM` and literal runtime install instructions Evergreen reads from
 * Dockerfile, *.Dockerfile, and Containerfile.
 *
 * Literal, well-formed image references are returned as `image` declarations. References
 * that need build arguments or variables are returned as `dynamic` so a
 * detector can report them as unclassified; they are never expanded. `scratch`,
 * references to earlier stages, comments, and unsupported `RUN` commands produce nothing. The parser
 * never evaluates contents or executes tools.
 */

export const MAXIMUM_INPUT_BYTES = 1024 * 1024;
export const MAXIMUM_LINE_LENGTH = 4096;

export interface DockerfileImageDeclaration {
  kind: "image";
  value: string;
  line: number;
}

export interface DockerfileDynamicDeclaration {
  kind: "dynamic";
  value: string;
  line: number;
}

export type Runtime = "dotnet" | "golang" | "java" | "nodejs" | "php" | "python" | "ruby";

export interface DockerfileRuntimeDeclaration {
  kind: "runtime";
  runtime: Runtime;
  value: string;
  line: number;
}

export type DockerfileDeclaration = DockerfileImageDeclaration | DockerfileDynamicDeclaration | DockerfileRuntimeDeclaration;

interface LogicalLine {
  text: string;
  line: number;
  spans: Array<{ start: number; line: number }>;
}

function logicalLines(contents: string): LogicalLine[] {
  const result: LogicalLine[] = [];
  let pending: LogicalLine | undefined;
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    if (raw.length > MAXIMUM_LINE_LENGTH) {
      pending = undefined;
      continue;
    }
    // Comment lines inside a continued instruction are dropped, as Docker does.
    if (raw.trimStart().startsWith("#")) continue;
    const continued = /\\\s*$/.test(raw);
    const piece = raw.replace(/\\\s*$/, "");
    if (pending) {
      pending.spans.push({ start: pending.text.length + 1, line: index + 1 });
      pending.text += ` ${piece.trim()}`;
    } else {
      pending = { text: piece.trim(), line: index + 1, spans: [{ start: 0, line: index + 1 }] };
    }
    if (!continued) {
      result.push(pending);
      pending = undefined;
    }
  }
  // A dangling continuation at end of file is malformed: drop it.
  return result;
}

const ASDF_RUNTIMES: Readonly<Record<string, Runtime>> = {
  "dotnet-core": "dotnet",
  golang: "golang",
  java: "java",
  nodejs: "nodejs",
  php: "php",
  python: "python",
  ruby: "ruby",
};
const LITERAL_VERSION = /^v?\d+(?:\.\d+){0,3}(?:[-+][A-Za-z0-9][A-Za-z0-9._+-]*)?$/;
const RUN_INSTALL = /(?:^|&&)\s*(?:(nvm|pyenv)\s+install\s+([^\s;&|]+)|(sdk|asdf)\s+install\s+([^\s;&|]+)\s+([^\s;&|]+))/g;

function literalVersion(token: string): string | undefined {
  const quote = token[0];
  const value = quote === "\"" || quote === "'" ? (token.endsWith(quote) ? token.slice(1, -1) : "") : token;
  return value.length <= 64 && LITERAL_VERSION.test(value) ? value : undefined;
}

function lineAt(logical: LogicalLine, offset: number): number {
  for (let index = logical.spans.length - 1; index >= 0; index -= 1) {
    const span = logical.spans[index]!;
    if (span.start <= offset) return span.line;
  }
  return logical.line;
}

function runtimePins(logical: LogicalLine): DockerfileRuntimeDeclaration[] {
  const run = /^RUN\s+([\s\S]+)$/i.exec(logical.text);
  if (!run?.[1] || run[1].trimStart().startsWith("[")) return [];

  const declarations: DockerfileRuntimeDeclaration[] = [];
  const shellOffset = logical.text.indexOf(run[1]);
  for (const match of run[1].matchAll(RUN_INSTALL)) {
    const manager = match[1] ?? match[3];
    const candidate = match[4];
    const rawVersion = match[2] ?? match[5];
    const value = rawVersion === undefined ? undefined : literalVersion(rawVersion);
    const runtime =
      manager === "nvm"
        ? "nodejs"
        : manager === "pyenv"
          ? "python"
          : manager === "sdk" && candidate === "java"
            ? "java"
            : manager === "asdf" && candidate
              ? ASDF_RUNTIMES[candidate]
              : undefined;
    if (!runtime || !value) continue;
    const commandOffset = match[0].indexOf(manager!);
    declarations.push({
      kind: "runtime",
      runtime,
      value,
      line: lineAt(logical, shellOffset + match.index + commandOffset),
    });
  }
  return declarations;
}

/** Parse `FROM` and supported `RUN` instructions without file, network, or process I/O. */
export function parseDockerfile(contents: string): DockerfileDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: DockerfileDeclaration[] = [];
  const stages = new Set<string>();
  for (const logical of logicalLines(contents)) {
    const { text, line } = logical;
    declarations.push(...runtimePins(logical));
    const match = text.match(/^FROM\s+(.*)$/i);
    if (!match) continue;
    const words = match[1]!.split(/\s+/).filter((word) => word.length > 0);
    while (words[0]?.startsWith("--")) words.shift();
    const image = words[0];
    if (!image) continue;

    const stage = words[1]?.toUpperCase() === "AS" ? words[2] : undefined;
    const reference = image.toLowerCase();
    if (stage) stages.add(stage.toLowerCase());

    if (reference === "scratch" || (stages.has(reference) && reference !== stage?.toLowerCase())) continue;
    if (isInterpolated(image)) declarations.push({ kind: "dynamic", value: image, line });
    else if (parseImageReference(image)) declarations.push({ kind: "image", value: image, line });
  }
  return declarations;
}
