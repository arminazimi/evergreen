import { isInterpolated, parseImageReference } from "./parse-image.js";

/**
 * Pure, bounded parser for the `FROM` instructions Evergreen reads from
 * Dockerfile, *.Dockerfile, and Containerfile.
 *
 * Literal, well-formed image references are returned as `image` declarations. References
 * that need build arguments or variables are returned as `dynamic` so a
 * detector can report them as unclassified; they are never expanded. `scratch`,
 * references to earlier stages, comments, and instructions other than `FROM`
 * produce nothing. The parser never evaluates contents or executes tools.
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

export type DockerfileDeclaration = DockerfileImageDeclaration | DockerfileDynamicDeclaration;

interface LogicalLine {
  text: string;
  line: number;
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
    if (pending) pending.text += ` ${piece.trim()}`;
    else pending = { text: piece.trim(), line: index + 1 };
    if (!continued) {
      result.push(pending);
      pending = undefined;
    }
  }
  // A dangling continuation at end of file is malformed: drop it.
  return result;
}

/** Parse `FROM` instructions without file, network, or process I/O. */
export function parseDockerfile(contents: string): DockerfileDeclaration[] {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_INPUT_BYTES) return [];

  const declarations: DockerfileDeclaration[] = [];
  const stages = new Set<string>();
  for (const { text, line } of logicalLines(contents)) {
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
