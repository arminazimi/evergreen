import { accessSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Finds a file Ebb ships, such as `registry/npm.json`, by walking up from the calling module. Compiled code sits in
 * `dist/src/`, so the walk reaches the package root. Code bundled out of the package (the GitHub Action) finds the
 * copy its build places beside the bundle.
 */
export async function findPackageFile(path: string, moduleUrl: string): Promise<string> {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const candidate = resolve(directory, path);
    try {
      await access(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Ebb package file not found: ${path}`);
    directory = parent;
  }
}

/** Synchronous form of findPackageFile, for module initialisation. */
export function findPackageFileSync(path: string, moduleUrl: string): string {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const candidate = resolve(directory, path);
    try {
      accessSync(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Ebb package file not found: ${path}`);
    directory = parent;
  }
}
