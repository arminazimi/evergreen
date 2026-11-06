import assert from "node:assert/strict";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

import type { DirectoryEntry, ScanFileSystem } from "../src/file-system.js";
import { sourceFiles } from "../src/source-files.js";

/** A read-only file system over a map of absolute path to text. */
function memoryFileSystem(files: Record<string, string>): ScanFileSystem {
  const entry = (name: string, directory: boolean): DirectoryEntry => ({
    name,
    isDirectory: () => directory,
    isFile: () => !directory,
  });
  const unsupported = (): never => {
    throw new Error("not supported by the in-memory file system");
  };
  return {
    readDirectory(path) {
      const prefix = path.endsWith(sep) ? path : `${path}${sep}`;
      const children = new Map<string, boolean>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const slash = rest.indexOf(sep);
        children.set(slash === -1 ? rest : rest.slice(0, slash), slash !== -1);
      }
      return Promise.resolve([...children].map(([name, directory]) => entry(name, directory)));
    },
    readBytes: () => Promise.resolve(unsupported()),
    readText: (path) => Promise.resolve(files[path] ?? ""),
    size: (path) => Promise.resolve((files[path] ?? "").length),
    exists: (path) => Promise.resolve(path in files),
    writeText: () => Promise.resolve(unsupported()),
    writeTextAtomically: () => Promise.resolve(unsupported()),
    copy: () => Promise.resolve(unsupported()),
    makeTemporaryDirectory: () => Promise.resolve(unsupported()),
    remove: () => Promise.resolve(unsupported()),
  };
}

test("sourceFiles walks an injected file system without touching the disk", async () => {
  // `resolve` anchors the root to a drive on Windows, so the fixture paths are built the same way.
  const root = resolve("/repo");
  const fileSystem = memoryFileSystem({
    [join(root, "app.py")]: "import requests\n",
    [join(root, "lib", "util.py")]: "x = 1\n",
    [join(root, "notes.txt")]: "hello",
  });
  const found = await sourceFiles(root, { include: (language) => language === "python" }, fileSystem);
  assert.deepEqual(found.map((file) => file.absolutePath).sort(), [join(root, "app.py"), join(root, "lib", "util.py")]);
});
