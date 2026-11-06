import { copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ScanFileSystem } from "./file-system.js";

/** The real filesystem. Hosts and tests that scan a directory on disk use this; the core only sees the interface. */
export const nodeFileSystem: ScanFileSystem = {
  readDirectory: (path) => readdir(path, { withFileTypes: true }),
  readBytes: (path) => readFile(path),
  readText: (path) => readFile(path, "utf8"),
  size: async (path) => (await stat(path)).size,
  exists: (path) =>
    stat(path).then(
      () => true,
      () => false,
    ),
  async writeText(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  },
  async writeTextAtomically(path, content) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(temporary, content, "utf8");
    await rename(temporary, path);
  },
  async copy(from, to) {
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  },
  makeTemporaryDirectory: (prefix) => mkdtemp(join(tmpdir(), prefix)),
  remove: (path) => rm(path, { recursive: true, force: true }),
};
