import { readFile } from "node:fs/promises";

/**
 * Reads a file that ships inside the Evergreen package (grammar payloads, query files). These are part of the
 * program, not of the scanned repository, so they stay outside the {@link ScanFileSystem} the scan reads through.
 */
export function readBundledText(location: string | URL): Promise<string> {
  return readFile(location, "utf8");
}
