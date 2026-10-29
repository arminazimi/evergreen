import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

/**
 * Finds the packages of a monorepo from the workspace declarations the package managers themselves read:
 * `workspaces` in package.json (npm, yarn), `pnpm-workspace.yaml`, `lerna.json`, and `[tool.uv.workspace]`
 * in pyproject.toml. The walk is bounded and deterministic: it never follows symbolic links, skips vendored
 * and build directories, stops at a fixed depth, and returns at most MAXIMUM_WORKSPACES directories in
 * sorted order. Nothing is executed and the network is never used.
 */

export const MAXIMUM_WORKSPACE_DEPTH = 8;
export const MAXIMUM_WORKSPACES = 500;
const MAXIMUM_DIRECTORIES_VISITED = 20_000;

export const SKIPPED_DIRECTORIES = new Set([
  ".git", ".hg", ".venv", "venv", "node_modules", "vendor", "dist", "build", "target", "coverage",
  ".mypy_cache", ".pytest_cache", ".ruff_cache", ".tox", "fixtures", "__fixtures__", "testdata",
]);

/** A workspace glob as a matcher over a repository-relative POSIX directory path. `*` and `?` stay inside one segment; `**` crosses segments. */
export function globToRegExp(pattern: string): RegExp {
  const segments = pattern.replace(/^\.\//, "").replace(/\/+$/, "").split("/");
  let source = "";
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === "**") {
      source += last ? ".*" : "(?:[^/]+/)*";
      return;
    }
    source += segment.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
    if (!last) source += "/";
  });
  return new RegExp(`^${source}$`);
}

async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EISDIR") return undefined;
    throw error;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []);

async function npmPatterns(root: string): Promise<string[]> {
  const patterns: string[] = [];
  const manifest = await readText(join(root, "package.json"));
  if (manifest) {
    try {
      const parsed = JSON.parse(manifest) as { workspaces?: unknown };
      const workspaces = parsed.workspaces;
      patterns.push(...strings(Array.isArray(workspaces) ? workspaces : (workspaces as { packages?: unknown } | undefined)?.packages));
    } catch {
      // A manifest that does not parse declares no workspaces.
    }
  }
  const pnpm = await readText(join(root, "pnpm-workspace.yaml"));
  if (pnpm) {
    try {
      patterns.push(...strings((parseYaml(pnpm) as { packages?: unknown } | null)?.packages));
    } catch {
      // Same: unreadable means none.
    }
  }
  const lerna = await readText(join(root, "lerna.json"));
  if (lerna) {
    try {
      patterns.push(...strings((JSON.parse(lerna) as { packages?: unknown }).packages));
    } catch {
      // Same.
    }
  }
  return patterns;
}

async function pythonPatterns(root: string): Promise<{ include: string[]; exclude: string[] }> {
  const pyproject = await readText(join(root, "pyproject.toml"));
  if (!pyproject) return { include: [], exclude: [] };
  try {
    const document = parseToml(pyproject) as { tool?: { uv?: { workspace?: { members?: unknown; exclude?: unknown } } } };
    const workspace = document.tool?.uv?.workspace;
    return { include: strings(workspace?.members), exclude: strings(workspace?.exclude) };
  } catch {
    return { include: [], exclude: [] };
  }
}

/** Whether a single path segment glob (`*`, `?`, or literals) matches `actual`. */
function segmentMatches(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  if (!expected.includes("*") && !expected.includes("?")) return false;
  const source = `^${expected.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")}$`;
  return new RegExp(source).test(actual);
}

/**
 * Whether `pattern` could match any repository-relative path strictly deeper than `relative`.
 * Flat patterns such as `packages/*` do not need to readdir thousands of files inside a matched package.
 */
function patternMayMatchDeeper(pattern: string, relative: string): boolean {
  const relativeSegments = relative ? relative.split("/") : [];
  const patternSegments = pattern.replace(/^\.\//, "").replace(/\/+$/, "").split("/");
  const doubleStar = patternSegments.indexOf("**");
  if (doubleStar === -1 && relativeSegments.length >= patternSegments.length) return false;

  for (let index = 0; index < relativeSegments.length; index++) {
    const actual = relativeSegments[index]!;
    if (doubleStar !== -1 && index >= doubleStar) return true;
    const expected = patternSegments[index];
    if (expected === undefined) return false;
    if (expected === "**") return true;
    if (!segmentMatches(expected, actual)) return false;
  }
  // Still have pattern segments (or a trailing **) below this directory.
  if (doubleStar !== -1) return true;
  return relativeSegments.length < patternSegments.length;
}

/** Whether any include glob could still match a path deeper than `relative`. */
function mayMatchDeeper(include: readonly string[], relative: string): boolean {
  return include.some((pattern) => patternMayMatchDeeper(pattern, relative));
}

async function findDirectories(root: string, markers: readonly string[], include: readonly string[], exclude: readonly string[]): Promise<string[]> {
  const included = include.map(globToRegExp);
  const excluded = exclude.map(globToRegExp);
  if (included.length === 0) return [];
  const found: string[] = [];
  let visited = 0;

  async function walk(directory: string, relative: string, depth: number): Promise<void> {
    if (depth > MAXIMUM_WORKSPACE_DEPTH || visited >= MAXIMUM_DIRECTORIES_VISITED || found.length >= MAXIMUM_WORKSPACES) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    // Binary name order is deterministic across locales and cheaper than localeCompare on large dirs.
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name) || entry.name.startsWith(".")) continue;
      visited += 1;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = join(directory, entry.name);
      if (included.some((pattern) => pattern.test(path)) && !excluded.some((pattern) => pattern.test(path))) {
        for (const marker of markers) {
          if (await isFile(join(absolute, marker))) {
            found.push(path);
            break;
          }
        }
      }
      if (mayMatchDeeper(include, path)) await walk(absolute, path, depth + 1);
    }
  }

  await walk(resolve(root), "", 1);
  return found.sort();
}

/** Workspace package directories (relative, POSIX, sorted, root excluded) that contain a package.json. */
export async function discoverNpmWorkspaces(root: string): Promise<string[]> {
  const patterns = await npmPatterns(root);
  // pnpm and Yarn let a leading `!` remove directories from the list.
  const include = patterns.filter((pattern) => !pattern.startsWith("!"));
  const exclude = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1));
  return findDirectories(root, ["package.json"], include, exclude);
}

/** uv workspace member directories (relative, POSIX, sorted, root excluded) that contain a pyproject.toml. */
export async function discoverPythonWorkspaces(root: string): Promise<string[]> {
  const { include, exclude } = await pythonPatterns(root);
  return findDirectories(root, ["pyproject.toml"], include, exclude);
}

/**
 * The usages that belong to one project directory: those under `directory` and not under a deeper project
 * directory. `directory` is "" for the root project.
 */
export function usagesOwnedBy<Usage extends { location: { path: string } }>(usages: readonly Usage[], directory: string, projectDirectories: readonly string[]): Usage[] {
  const owner = (path: string): string => {
    let best = "";
    for (const candidate of projectDirectories) {
      if (candidate && (path === candidate || path.startsWith(`${candidate}/`)) && candidate.length > best.length) best = candidate;
    }
    return best;
  };
  return usages.filter((usage) => owner(usage.location.path) === directory);
}
