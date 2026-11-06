import assert from "node:assert/strict";
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
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const children = new Map<string, boolean>();
      for (const file of Object.keys(files)) {
        if (!file.startsWith(prefix)) continue;
        const rest = file.slice(prefix.length);
        const slash = rest.indexOf("/");
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
  const fileSystem = memoryFileSystem({
    "/repo/app.py": "import requests\n",
    "/repo/lib/util.py": "x = 1\n",
    "/repo/notes.txt": "hello",
  });
  const found = await sourceFiles("/repo", { include: (language) => language === "python" }, fileSystem);
  assert.deepEqual(found.map((file) => file.absolutePath).sort(), ["/repo/app.py", "/repo/lib/util.py"]);
});
