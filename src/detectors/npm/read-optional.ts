import { readFile } from "node:fs/promises";

/** Reads a file the detector may or may not find; a missing file is undefined and every other error propagates. */
export async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
