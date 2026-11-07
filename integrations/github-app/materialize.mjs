// Builds a temporary checkout of the few manifests proposeOnboarding reads.
// Fetches only those paths over the GitHub Contents API; never mirrors the whole tree.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Paths that influence stack detection or the README badge merge. */
export const MATERIALIZE_PATHS = Object.freeze([
  "package.json",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "pnpm-workspace.yaml",
  "lerna.json",
  "README.md",
  "readme.md",
]);

/**
 * Writes present remote files under `root`. Missing paths are skipped (404).
 * @param {{ root: string, getFile: (path: string) => Promise<string | undefined> }} input
 */
export async function materializeRepository(input) {
  const written = [];
  for (const path of MATERIALIZE_PATHS) {
    const contents = await input.getFile(path);
    if (contents === undefined) continue;
    const absolute = join(input.root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
    written.push(path);
  }
  return written;
}
