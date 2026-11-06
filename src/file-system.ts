/**
 * The filesystem operations the scan core needs, as an interface. Domain, SDK, and core modules take one of these
 * instead of importing `node:fs`, so they can run against in-memory input and so the offline promise is checkable
 * from imports alone. {@link nodeFileSystem} in `node-file-system.ts` is the implementation hosts use.
 */

/** One directory entry, the subset of `fs.Dirent` the core reads. */
export interface DirectoryEntry {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface ScanFileSystem {
  /** The entries of a directory. Rejects with an error carrying a Node-style `code` when it cannot be read. */
  readDirectory(path: string): Promise<DirectoryEntry[]>;
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  /** Size in bytes. Rejects when the path does not exist. */
  size(path: string): Promise<number>;
  exists(path: string): Promise<boolean>;
  /** Writes `content` to `path`, creating parent directories first. */
  writeText(path: string, content: string): Promise<void>;
  /** Writes `content` to a sibling temporary file, then renames it over `path`, so readers never see half a file. */
  writeTextAtomically(path: string, content: string): Promise<void>;
  /** Copies `from` to `to`, creating the parent directories of `to`. */
  copy(from: string, to: string): Promise<void>;
  /** A new empty directory whose name starts with `prefix`, in the system temporary directory. */
  makeTemporaryDirectory(prefix: string): Promise<string>;
  /** Removes a file or directory tree. Missing paths are not an error. */
  remove(path: string): Promise<void>;
}
