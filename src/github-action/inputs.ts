import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { severityValues } from "../domain.js";
import { relativePosix } from "../paths.js";
import { MAXIMUM_WORKSPACE_DEPTH, SKIPPED_DIRECTORIES, globToRegExp } from "../workspaces.js";
import type { AnnotationScope, SeverityGate } from "./types.js";

export const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

export function parseGate(value: SeverityGate | undefined): SeverityGate {
  const gate = value ?? "high";
  if (gate !== "none" && !severityRank.has(gate)) {
    throw new Error(`Invalid severity gate: ${gate}`);
  }
  return gate;
}

/** Split a multi-line Action `paths` input into non-empty trimmed entries. */
export function parsePathsInput(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isGlobPattern(pattern: string): boolean {
  return /[*?]/.test(pattern);
}

/**
 * Expand a directory glob under `base` into absolute paths. `*` and `?` stay inside one segment;
 * `**` crosses segments. Skips the same vendored trees as workspace discovery. Deterministic order.
 */
async function expandDirectoryGlob(base: string, pattern: string): Promise<string[]> {
  const matcher = globToRegExp(pattern);
  const found: string[] = [];
  let visited = 0;
  const visitLimit = 20_000;

  async function walk(directory: string, relative: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_WORKSPACE_DEPTH || visited >= visitLimit) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.isSymbolicLink() ||
        SKIPPED_DIRECTORIES.has(entry.name) ||
        entry.name.startsWith(".")
      )
        continue;
      visited += 1;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (matcher.test(path)) found.push(absolute);
      // A match can still contain deeper matches when the pattern has `**`.
      if (depth < MAXIMUM_WORKSPACE_DEPTH) await walk(absolute, path, depth + 1);
    }
  }

  await walk(base, "", 1);
  return found;
}

/**
 * Resolve `paths` entries (literals and globs) under `base` to absolute directories.
 * Literals that are missing or not directories fail; globs that match nothing fail.
 */
export async function resolveScanPaths(base: string, patterns: readonly string[]): Promise<string[]> {
  if (patterns.length === 0) throw new Error("paths must list at least one path or glob.");
  const baseResolved = resolve(base);
  const resolved = new Set<string>();

  for (const raw of patterns) {
    const pattern = raw.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (pattern.length === 0 || pattern === ".") {
      resolved.add(baseResolved);
      continue;
    }
    if (isGlobPattern(pattern)) {
      const matches = await expandDirectoryGlob(baseResolved, pattern);
      if (matches.length === 0) throw new Error(`paths glob matched no directories: ${raw}`);
      for (const match of matches) resolved.add(match);
      continue;
    }
    const absolute = resolve(baseResolved, pattern);
    let info;
    try {
      info = await stat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`paths entry does not exist: ${raw}`);
      throw error;
    }
    if (!info.isDirectory()) throw new Error(`paths entry is not a directory: ${raw}`);
    resolved.add(absolute);
  }

  return [...resolved].sort((left, right) =>
    relativePosix(baseResolved, left).localeCompare(relativePosix(baseResolved, right)),
  );
}

export function parseAnnotations(value: AnnotationScope | undefined, mode: "scan" | "diff"): AnnotationScope {
  if (value === undefined) return mode === "diff" ? "changed" : "all";
  if (value !== "all" && value !== "changed" && value !== "none") {
    throw new Error(`Invalid annotations: ${value}. Use "changed", "all", or "none".`);
  }
  return value;
}
