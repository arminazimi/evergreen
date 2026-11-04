import { readdir, rename } from "node:fs/promises";
import { join } from "node:path";

/**
 * The real name of a committed fixture file. Names a dependency scanner recognizes are stored with a `.fixture`
 * suffix; the `image` segment stands for `Dockerfile`, because Scorecard matches that word anywhere in a name
 * (decision 0027). A name without the suffix is returned unchanged.
 */
export function fixtureRealName(storedName: string): string {
  if (!storedName.endsWith(".fixture")) return storedName;
  const segments = storedName.slice(0, -".fixture".length).split(".");
  const image = segments.indexOf("image");
  if (image !== -1) segments[image] = "Dockerfile";
  return segments.join(".");
}

/** Restores every stored fixture name beneath `directory` in place. */
export async function restoreFixtureNames(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await restoreFixtureNames(path);
    else if (entry.isFile()) {
      const realName = fixtureRealName(entry.name);
      if (realName !== entry.name) await rename(path, join(directory, realName));
    }
  }
}
