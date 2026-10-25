#!/usr/bin/env node
// Builds the standalone Evergreen binary: a Node.js single executable application that carries the packed
// package and its production dependencies, so running it needs no Node.js on the machine.
//
//   node build-sea.mjs <output-file>
//
// The binary embeds every file of the installed package as a SEA asset. On first run, sea-boot.cjs unpacks them
// into the user's cache directory and starts the same CLI the npm package ships. Run it with a Node.js build
// that supports `node --build-sea` (25.5 or newer) from the repository root after `npm run build`.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";

const output = process.argv[2];
if (!output) {
  console.error("Usage: build-sea.mjs <output-file>");
  process.exit(2);
}

const root = process.cwd();
const scripts = import.meta.dirname;
const work = mkdtempSync(join(tmpdir(), "evergreen-sea-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (command, args, options = {}) => execFileSync(command, args, { stdio: ["ignore", "inherit", "inherit"], shell: process.platform === "win32", ...options });

try {
  // Stage exactly the files npm would publish, then install the production dependencies from the lockfile.
  const [packed] = JSON.parse(execFileSync(npm, ["pack", "--dry-run", "--ignore-scripts", "--json"], { encoding: "utf8", shell: process.platform === "win32" }));
  const stage = join(work, "package");
  for (const { path } of packed.files) {
    mkdirSync(dirname(join(stage, path)), { recursive: true });
    cpSync(join(root, path), join(stage, path));
  }
  cpSync(join(root, "package-lock.json"), join(stage, "package-lock.json"));
  run(npm, ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: stage });
  rmSync(join(stage, "package-lock.json"));

  const files = [];
  (function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
    }
  })(stage);
  const names = files.map((file) => relative(stage, file).split(sep).join("/"));

  // The id names the cache directory, so two builds with different contents never share an extraction.
  const hash = createHash("sha256");
  files.forEach((file, index) => hash.update(names[index]).update(readFileSync(file)));
  const manifest = { id: hash.digest("hex").slice(0, 16), files: names };
  writeFileSync(join(work, "manifest.json"), JSON.stringify(manifest));

  const assets = { "manifest.json": join(work, "manifest.json") };
  files.forEach((file, index) => {
    assets[`f${index}`] = file;
  });
  const config = join(work, "sea-config.json");
  writeFileSync(config, JSON.stringify({ main: join(scripts, "sea-boot.cjs"), output: resolve(output), disableExperimentalSEAWarning: true, assets }));
  run(process.execPath, ["--build-sea", config]);
  console.log(`Built ${resolve(output)} (${names.length} files, runtime ${manifest.id}).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
