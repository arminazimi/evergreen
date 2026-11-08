import { accessSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where to look for `path` in one directory: beside the module's own package, then in Ebb's folder of an Evergreen
 * checkout. The second covers code bundled out of this package, such as the GitHub Action, which runs from the
 * repository checkout and so finds the data under `packages/ebb/` rather than beside itself.
 */
function candidates(directory: string, path: string): string[] {
  return [resolve(directory, path), resolve(directory, "packages", "ebb", path)];
}

export async function findPackageFile(path: string, moduleUrl: string): Promise<string> {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    for (const candidate of candidates(directory, path)) {
      try {
        await access(candidate);
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Evergreen package file not found: ${path}`);
    directory = parent;
  }
}

/** Synchronous form of findPackageFile, for module initialisation. */
export function findPackageFileSync(path: string, moduleUrl: string): string {
  let directory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    for (const candidate of candidates(directory, path)) {
      try {
        accessSync(candidate);
        return candidate;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }

    const parent = dirname(directory);
    if (parent === directory) throw new Error(`Evergreen package file not found: ${path}`);
    directory = parent;
  }
}
