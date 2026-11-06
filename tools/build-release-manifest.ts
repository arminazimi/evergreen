// Writes the release manifest every published tarball carries: the name, version, and SHA-256 of every shipped
// file. `evergreen verify` reads it to tell a clean installation from one whose files were changed, without the
// network. It lists the files `npm pack` would publish, so it never drifts from `package.json`'s `files` list.
//
//   node dist/tools/build-release-manifest.js
//
// The manifest has no clock, host, or ordering input: the same files always produce the same bytes.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { writeReleaseManifest } from "../src/release-manifest.js";
import { capture, npmCli } from "./npm-cli.js";

/** The files `npm pack` would publish, relative to `root`, without running any package script. */
export async function packedFiles(root: string): Promise<string[]> {
  const output = await capture(process.execPath, [npmCli(), "pack", "--dry-run", "--json", "--ignore-scripts"], root);
  const parsed = JSON.parse(output) as unknown;
  const records: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const record: unknown = records[0];
  if (typeof record !== "object" || record === null || !("files" in record) || !Array.isArray(record.files)) {
    throw new Error(`npm pack did not report a file list: ${output.trim()}`);
  }
  const files: unknown[] = record.files;
  return files.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("path" in entry) || typeof entry.path !== "string") {
      return [];
    }
    return [entry.path];
  });
}

/** Writes `dist/src/release-manifest.json` for the package at `root` and returns its path. */
export async function writeReleaseManifestFromPackList(root: string): Promise<string> {
  return writeReleaseManifest(root, await packedFiles(root));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const target = await writeReleaseManifestFromPackList(process.cwd());
  process.stdout.write(`Wrote ${target}\n`);
}
