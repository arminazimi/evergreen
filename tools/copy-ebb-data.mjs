// Copies the data files @velella/ebb reads at run time next to the GitHub Action bundle.
//
// ncc inlines Ebb's code into dist/action/index.js but not the JSON it reads from disk. The Action runs from a
// checkout of this repository with no node_modules, so Ebb finds its registries and the Sigstore trusted root only
// if they sit beside the bundle: dist/action/registry/*.json and dist/action/data/sigstore-trusted-root.json.
//
//   node tools/copy-ebb-data.mjs <bundle directory>

import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** The installed @velella/ebb package directory. */
export function ebbPackageDirectory() {
  return dirname(require.resolve("@velella/ebb/package.json"));
}

/** Copies Ebb's run-time data into `destination`, replacing any earlier copy. */
export async function copyEbbData(destination, source = ebbPackageDirectory()) {
  for (const directory of ["registry", "data"]) {
    await rm(join(destination, directory), { recursive: true, force: true });
  }
  await mkdir(join(destination, "data"), { recursive: true });
  await cp(join(source, "registry"), join(destination, "registry"), {
    recursive: true,
    filter: (path) => basename(path) !== "sources.lock.json",
  });
  await cp(join(source, "data", "sigstore-trusted-root.json"), join(destination, "data", "sigstore-trusted-root.json"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination) {
    console.error("usage: node tools/copy-ebb-data.mjs <bundle directory>");
    process.exit(2);
  }
  await copyEbbData(destination);
}
