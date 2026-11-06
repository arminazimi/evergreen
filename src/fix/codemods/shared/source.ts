import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type { SourceLanguage } from "../../../domain.js";
import { grammarFor } from "../../../usage/tree-sitter.js";

/** The refusal every codemod reports when a finding's path escapes the repository. */
export const OUTSIDE_REPOSITORY = "The path resolves outside the repository.";

/** The absolute path of `path` when it stays inside `root`, or undefined when it escapes the repository. */
export function insideRepository(root: string, path: string): string | undefined {
  const absolute = resolve(root, path);
  const inside = relative(resolve(root), absolute);
  return inside.startsWith("..") || isAbsolute(inside) ? undefined : absolute;
}

/** Reads a repository file without requiring a trailing newline; `noun` names it in the refusal. */
export async function readRepositoryText(
  root: string,
  path: string,
  noun = "source file",
): Promise<{ text: string } | { reason: string }> {
  const absolute = insideRepository(root, path);
  if (absolute === undefined) return { reason: OUTSIDE_REPOSITORY };
  const text = await readFile(absolute, "utf8").catch(() => undefined);
  return text === undefined ? { reason: `The ${noun} could not be read.` } : { text };
}

/** Why a file the codemod rewrites byte-for-byte cannot be edited, or undefined when it ends with a newline. */
export function newlineReason(text: string, noun = "source file"): string | undefined {
  return text.endsWith("\n") ? undefined : `The ${noun} does not end with a newline.`;
}

/** Reads a repository file that is inside the repository, readable, and newline-terminated. */
export async function readRepositoryFile(
  root: string,
  path: string,
  noun = "source file",
): Promise<{ text: string } | { reason: string }> {
  const source = await readRepositoryText(root, path, noun);
  if ("reason" in source) return source;
  const missing = newlineReason(source.text, noun);
  return missing === undefined ? source : { reason: missing };
}

/** Reads a repository file after checking that a known grammar can parse it. */
export async function readParseableFile(
  root: string,
  path: string,
  language: SourceLanguage,
): Promise<{ text: string; grammar: NonNullable<ReturnType<typeof grammarFor>> } | { reason: string }> {
  const source = await readRepositoryFile(root, path);
  if ("reason" in source) return source;
  const grammar = grammarFor(language, path);
  return grammar === undefined ? { reason: "No parser covers this source language." } : { text: source.text, grammar };
}

/** The character offset of a one-based line and column, or -1 when it is past the end of the source. */
export function offsetOf(source: string, line: number, column: number): number {
  let start = 0;
  for (let current = 1; current < line; current += 1) {
    const next = source.indexOf("\n", start);
    if (next === -1) return -1;
    start = next + 1;
  }
  const offset = start + column - 1;
  return offset <= source.length ? offset : -1;
}

/** The one-based line and column of a character offset. */
export function locate(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let start = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      start = index + 1;
    }
  }
  return { line, column: offset - start + 1 };
}
