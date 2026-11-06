// Compares the build records `npm run record:reproducible` writes on each CI runner.
//
//   node tools/compare-build-hashes.mjs <directory>
//
// The package is only reproducible when independent builds on different operating systems pack the
// same bytes. `npm run check:reproducible` builds twice on one machine, so it cannot see a host-
// dependent step: a path, a line ending, or a file-ordering difference that every build on that host
// shares. This compares the hashes of builds made elsewhere and fails when they disagree.
//
// The directory holds one JSON record per runner, written by `--record`:
//
//   { "label": "Linux", "sha256": "…64 hex…", "node": "v24.0.0", "platform": "linux", "tarball": "…" }
//
// Fewer than two records is an error, not a pass: a comparison that never ran proves nothing.
// It reads local files only: no network and no child processes.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates one record; malformed artifacts fail rather than being skipped. */
export function parseRecord(text, name) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not JSON`);
  }
  if (!isObject(parsed) || typeof parsed.label !== "string" || parsed.label === "") {
    throw new Error(`${name} has no runner label`);
  }
  if (typeof parsed.sha256 !== "string" || !SHA256.test(parsed.sha256)) {
    throw new Error(`${name} has no sha256`);
  }
  return {
    label: parsed.label,
    sha256: parsed.sha256,
    tarball: typeof parsed.tarball === "string" ? parsed.tarball : "",
  };
}

/**
 * Returns the shared hash when every record agrees, and throws with every record when they do not.
 * `records` comes from separate runners, so the message names the label, hash, and tarball of each.
 */
export function compareRecords(records) {
  if (records.length < 2) {
    throw new Error(`comparing builds needs at least two records; found ${records.length}`);
  }
  const hashes = new Set(records.map((record) => record.sha256));
  if (hashes.size !== 1) {
    const details = records
      .map((record) => `  ${record.label}: sha256 ${record.sha256}${record.tarball ? ` (${record.tarball})` : ""}`)
      .join("\n");
    throw new Error(
      `the builds are not reproducible: the packed tarballs differ\n${details}\n` +
        "A host-dependent build step changes the shipped bytes; diff the tarballs named above.",
    );
  }
  return records[0].sha256;
}

/** Reads every `*.json` record in `directory`, sorted by file name for a stable message. */
export async function readRecords(directory) {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const records = [];
  for (const name of names) {
    records.push(parseRecord(await readFile(join(directory, name), "utf8"), name));
  }
  return records;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = process.argv[2];
  if (directory === undefined) {
    process.stderr.write("usage: node tools/compare-build-hashes.mjs <directory>\n");
    process.exitCode = 2;
  } else {
    try {
      const records = await readRecords(directory);
      const hash = compareRecords(records);
      const labels = records.map((record) => record.label).join(", ");
      console.log(`${records.length} builds (${labels}) pack to byte-identical tarballs: sha256 ${hash}`);
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  }
}
