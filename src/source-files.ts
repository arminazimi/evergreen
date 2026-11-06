import { join, resolve } from "node:path";

import type { SourceLanguage } from "./domain.js";
import type { ScanFileSystem } from "./file-system.js";
import { nodeFileSystem } from "./node-file-system.js";
import { childPosixPath } from "./paths.js";

/** Directories that hold build output or a dependency checkout, never the repository's own source. */
const ignoredDirectories = new Set([
  ".git",
  ".hg",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "venv",
]);

/** Source files above this size are left out of the walk: reading them costs more than it finds. */
export const maximumFileBytes = 1_000_000;

/** Directory read errors that skip the subtree instead of failing every finding in the scan. */
const skippedReadCodes = new Set(["EACCES", "ENOENT", "ENOTDIR", "EPERM"]);

export interface SourceFile {
  absolutePath: string;
  path: string;
  language: SourceLanguage;
}

const languageByExtension = new Map<string, SourceLanguage>([
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".mjs", "javascript"],
  [".cjs", "javascript"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".py", "python"],
  [".go", "go"],
  [".rs", "rust"],
  [".cs", "csharp"],
  [".java", "java"],
  [".kt", "kotlin"],
  [".rb", "ruby"],
  [".rake", "ruby"],
  [".ru", "ruby"],
  [".php", "php"],
  [".swift", "swift"],
  [".dart", "dart"],
  [".json", "json"],
  [".yaml", "yaml"],
  [".yml", "yaml"],
  [".toml", "toml"],
  [".ini", "ini"],
  [".cfg", "ini"],
]);

/** The language Evergreen reads a file as, from its extension, or undefined for files it does not read. */
export function languageFor(path: string): SourceLanguage | undefined {
  return languageByExtension.get(path.slice(path.lastIndexOf(".")).toLowerCase());
}

export interface SourceFileWalk {
  /**
   * Which languages the caller will actually read. A monorepo holds thousands of files of every
   * other kind, and each one would otherwise be joined, statred, and dropped one line later.
   */
  include: (language: SourceLanguage) => boolean;
  /** Stop at the first match: the language probe needs a yes or no, not a listing of the tree. */
  stopAtFirst?: boolean;
}

/**
 * Every source file under `root` in a language the caller asked for, one at a time.
 *
 * The walk is a generator so a caller that analyses each file immediately never holds the whole
 * repository's file list: only the current directory's entries are live, and each `SourceFile`
 * is dropped once the caller moves on. Callers that need the list use {@link sourceFiles}.
 */
export async function* sourceFileEntries(
  root: string,
  wanted: SourceFileWalk,
  fileSystem: ScanFileSystem = nodeFileSystem,
): AsyncGenerator<SourceFile> {
  let stopped = false;
  // The repository-relative path is carried down the walk: `relative()` re-resolves both paths for
  // every entry, and on a tree of 100k files that costs more than the directory read itself.
  const descend = async function* (directory: string, prefix: string): AsyncGenerator<SourceFile> {
    let entries;
    try {
      entries = await fileSystem.readDirectory(directory);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && skippedReadCodes.has(code)) return;
      throw error;
    }
    // Do not sort directory entries here: usage analysis sorts its results by path at the end, and
    // skipping localeCompare on huge non-source trees is the large-monorepo win.
    for (const entry of entries) {
      if (stopped) return;
      if (entry.isDirectory()) {
        if (ignoredDirectories.has(entry.name)) continue;
        yield* descend(join(directory, entry.name), childPosixPath(prefix, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      // Extension check on the basename avoids joining/statting every filler file in a monorepo.
      const language = languageFor(entry.name);
      if (language === undefined || !wanted.include(language)) continue;
      const path = join(directory, entry.name);
      if ((await fileSystem.size(path)) > maximumFileBytes) continue;
      yield { absolutePath: path, path: childPosixPath(prefix, entry.name), language };
      if (wanted.stopAtFirst === true) {
        stopped = true;
        return;
      }
    }
  };
  yield* descend(resolve(root), "");
}

/** Every source file under `root` in a language the caller asked for, with repository-relative paths. */
export async function sourceFiles(
  root: string,
  wanted: SourceFileWalk,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  for await (const file of sourceFileEntries(root, wanted, fileSystem)) files.push(file);
  return files;
}

/** True when the repository has at least one file in this language, using the same traversal as usage analysis. */
export async function hasSourceFiles(
  root: string,
  language: SourceLanguage,
  fileSystem: ScanFileSystem = nodeFileSystem,
): Promise<boolean> {
  const found = await sourceFiles(
    resolve(root),
    { include: (candidate) => candidate === language, stopAtFirst: true },
    fileSystem,
  );
  return found.length > 0;
}
