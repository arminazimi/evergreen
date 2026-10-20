import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { relative, resolve } from "node:path";

import { toPosixPath } from "../paths.js";

/**
 * Runs `operation` and returns the files under `root` whose contents it opened, as sorted paths relative to `root`
 * with forward slashes. It wraps `readFile`, `open`, `readFileSync`, and `createReadStream`; listing a directory
 * or checking that a path exists is not a read. Files outside `root` (bundled data) are not reported.
 * Only one trace may run at a time.
 */
export async function traceReads(root: string, operation: () => Promise<unknown>): Promise<string[]> {
  const base = resolve(root);
  const seen = new Set<string>();
  const note = (target: unknown): void => {
    if (typeof target !== "string" && !(target instanceof URL) && !Buffer.isBuffer(target)) return;
    const path = relative(base, resolve(target instanceof URL ? target.pathname : target.toString()));
    if (path !== "" && !path.startsWith("..")) seen.add(toPosixPath(path));
  };

  const originals = {
    readFile: fsp.readFile,
    open: fsp.open,
    readFileSync: fs.readFileSync,
    createReadStream: fs.createReadStream,
  };
  fsp.readFile = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.readFile as (...args: unknown[]) => unknown).call(fsp, target, ...rest);
  }) as typeof fsp.readFile;
  fsp.open = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.open as (...args: unknown[]) => unknown).call(fsp, target, ...rest);
  }) as typeof fsp.open;
  fs.readFileSync = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.readFileSync as (...args: unknown[]) => unknown).call(fs, target, ...rest);
  }) as typeof fs.readFileSync;
  fs.createReadStream = ((target: unknown, ...rest: unknown[]) => {
    note(target);
    return (originals.createReadStream as (...args: unknown[]) => unknown).call(fs, target, ...rest);
  }) as typeof fs.createReadStream;
  syncBuiltinESMExports();
  try {
    await operation();
  } finally {
    Object.assign(fsp, { readFile: originals.readFile, open: originals.open });
    Object.assign(fs, { readFileSync: originals.readFileSync, createReadStream: originals.createReadStream });
    syncBuiltinESMExports();
  }
  return [...seen].sort();
}
