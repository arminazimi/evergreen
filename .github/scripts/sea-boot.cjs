"use strict";
// Entry point of the standalone binary (see build-sea.mjs). It unpacks the embedded package into the user's
// cache directory the first time a given build runs, then hands over to the packaged CLI. Setting
// EVERGREEN_SEA_CACHE moves the cache directory.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sea = require("node:sea");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

function cacheRoot() {
  if (process.env.EVERGREEN_SEA_CACHE) return process.env.EVERGREEN_SEA_CACHE;
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "evergreen");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "evergreen");
  return path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "evergreen");
}

function extract() {
  const manifest = JSON.parse(sea.getAsset("manifest.json", "utf8"));
  const root = path.join(cacheRoot(), `runtime-${manifest.id}`);
  if (fs.existsSync(path.join(root, ".complete"))) return root;
  const staging = `${root}.${process.pid}.tmp`;
  fs.rmSync(staging, { recursive: true, force: true });
  for (const [index, file] of manifest.files.entries()) {
    const target = path.join(staging, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, new Uint8Array(sea.getRawAsset(`f${index}`)));
  }
  fs.writeFileSync(path.join(staging, ".complete"), "");
  fs.rmSync(root, { recursive: true, force: true });
  try {
    fs.renameSync(staging, root);
  } catch (error) {
    // A concurrent first run finished extracting first; its copy is identical.
    fs.rmSync(staging, { recursive: true, force: true });
    if (!fs.existsSync(path.join(root, ".complete"))) throw error;
  }
  return root;
}

const root = extract();
const cli = path.join(root, "dist", "src", "cli.js");
process.argv = [process.execPath, cli, ...process.argv.slice(2)];
// A SEA's own import() only loads built-in modules; this one uses the regular ES module loader.
const load = new vm.Script("(url) => import(url)", { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
load.runInThisContext()(pathToFileURL(cli).href).catch((error) => {
  process.stderr.write(`Evergreen failed to start: ${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
