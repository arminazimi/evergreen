import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { createGunzip } from "node:zlib";

import { parseJdkVersion } from "../java/jdk-version.js";
import type { Runtime } from "./parse-dockerfile.js";

/**
 * Reads the operating system and runtimes that ship inside a container filesystem.
 *
 * A source is a local unpacked root filesystem directory, or a local uncompressed or gzip-compressed
 * tar archive of one. Nothing is pulled, resolved, or executed: the reader lists directory entries and
 * parses small text files. An archive is read as a stream, a bound limits how much is read, and a
 * malformed or truncated archive yields whatever entries were complete.
 */

export interface RootfsOsRelease {
  /** The file `os-release` was read from, relative to the root filesystem. */
  entry: string;
  /** The location reported in a finding: the entry, or `archive.tar!entry` for an archive. */
  path: string;
  /** One-based line of the version (or codename) the finding is judged on. */
  line: number;
  /** `ID` from `os-release`, lowercased. */
  id: string;
  versionId?: string;
  codename?: string;
  prettyName?: string;
}

export interface RootfsRuntimeEvidence {
  runtime: Runtime;
  /** The version text as it ships, for example `16.20.2`, `1.21.5`, or `17.0.9`. */
  version: string;
  /** The file or directory that carries the evidence, relative to the root filesystem. */
  entry: string;
  /** The location reported in a finding. */
  path: string;
  line: number;
}

export interface RootfsSnapshot {
  /** The source label: the archive file name, or empty for an unpacked directory. */
  label: string;
  /** The parsed `os-release`, when it names an operating system. */
  osRelease?: RootfsOsRelease;
  runtimes: RootfsRuntimeEvidence[];
}

const OS_RELEASE_PATHS = ["etc/os-release", "usr/lib/os-release"] as const;
const ARCHIVE_NAME = /\.(?:tar|tar\.gz|tgz)$/i;
const MAXIMUM_ARCHIVES = 4;
const MAXIMUM_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_TEXT_BYTES = 256 * 1024;
const MAXIMUM_MEMBERS = 200_000;
const BLOCK = 512;

interface RootfsSource {
  readonly label: string;
  path(entry: string): string;
  read(entry: string): Promise<string | undefined>;
  list(directory: string): Promise<string[] | undefined>;
}

/** True when `target` is inside `root`; a symlink that resolves outside is not. */
function insideRoot(root: string, target: string): boolean {
  const path = relative(root, target);
  return path.length === 0 || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function directorySource(root: string): RootfsSource {
  return {
    label: "",
    path: (entry) => entry,
    async read(entry) {
      try {
        const target = await realpath(join(root, ...entry.split("/")));
        if (!insideRoot(root, target)) return undefined;
        const stats = await stat(target);
        if (!stats.isFile() || stats.size > MAXIMUM_TEXT_BYTES) return undefined;
        return await readFile(target, "utf8");
      } catch {
        return undefined;
      }
    },
    async list(directory) {
      try {
        const target = await realpath(join(root, ...directory.split("/")));
        if (!insideRoot(root, target)) return undefined;
        const entries = await readdir(target, { withFileTypes: true });
        return entries.sort((left, right) => left.name.localeCompare(right.name)).map((entry) => entry.name);
      } catch {
        return undefined;
      }
    },
  };
}

interface ArchiveEntry {
  readonly type: "file" | "directory" | "symlink" | "other";
  readonly text?: string;
}

function archiveSource(label: string, entries: ReadonlyMap<string, ArchiveEntry>): RootfsSource {
  return {
    label,
    path: (entry) => `${label}!${entry}`,
    async read(entry) {
      return entries.get(entry)?.text;
    },
    async list(directory) {
      const prefix = directory.length === 0 ? "" : `${directory.replace(/\/+$/, "")}/`;
      const names = new Set<string>();
      for (const name of entries.keys()) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const first = rest.split("/")[0];
        if (first !== undefined && first.length > 0) names.add(first);
      }
      return [...names].sort((left, right) => left.localeCompare(right));
    },
  };
}

/** Read a root filesystem from an unpacked directory or from a local tar archive. */
export async function readRootfs(source: string): Promise<RootfsSnapshot | undefined> {
  let stats;
  try {
    stats = await lstat(source);
  } catch {
    return undefined;
  }
  if (stats.isDirectory()) {
    try {
      return snapshot(directorySource(await realpath(source)));
    } catch {
      return undefined;
    }
  }
  if (!stats.isFile() || stats.size > MAXIMUM_ARCHIVE_BYTES) return undefined;
  const entries = await readArchive(source);
  if (entries === undefined) return undefined;
  return snapshot(archiveSource(basename(source), normalizeArchiveEntries(entries)));
}

/**
 * The root filesystems a scan root carries: the root itself when it is unpacked, otherwise root-level
 * tar archives that contain an `os-release`. At most four archives are read.
 */
export async function findRootfsSnapshots(root: string): Promise<RootfsSnapshot[]> {
  const directory = await readRootfs(root);
  if (directory) return [directory];

  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const archives = entries
    .filter((entry) => entry.isFile() && ARCHIVE_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAXIMUM_ARCHIVES);

  const snapshots: RootfsSnapshot[] = [];
  for (const name of archives) {
    const parsed = await readRootfs(join(root, name));
    if (parsed) snapshots.push(parsed);
  }
  return snapshots;
}

async function snapshot(source: RootfsSource): Promise<RootfsSnapshot | undefined> {
  let osRelease: RootfsOsRelease | undefined;
  let found = false;
  for (const entry of OS_RELEASE_PATHS) {
    const contents = await source.read(entry);
    if (contents === undefined) continue;
    found = true;
    const parsed = parseOsRelease(contents);
    if (parsed) {
      osRelease = { ...parsed, entry, path: source.path(entry) };
      break;
    }
  }
  if (!found) return undefined;
  return {
    label: source.label,
    ...(osRelease === undefined ? {} : { osRelease }),
    runtimes: await runtimeEvidence(source),
  };
}

/** Parse the `ID`, `VERSION_ID`, `VERSION_CODENAME`, and `PRETTY_NAME` keys of an `os-release` file. */
export function parseOsRelease(contents: string): Omit<RootfsOsRelease, "entry" | "path"> | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_TEXT_BYTES) return undefined;
  const values = new Map<string, { value: string; line: number }>();
  for (const [index, raw] of contents.split(/\r?\n/).entries()) {
    const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!match?.[1] || match[2] === undefined) continue;
    if (values.has(match[1])) continue;
    let value = match[2];
    const quote = value[0];
    if ((quote === "\"" || quote === "'") && value.endsWith(quote)) value = value.slice(1, -1);
    values.set(match[1], { value, line: index + 1 });
  }

  const id = values.get("ID");
  if (!id || id.value.length === 0) return undefined;
  const version = values.get("VERSION_ID");
  const codename = values.get("VERSION_CODENAME");
  const prettyName = values.get("PRETTY_NAME");
  return {
    id: id.value.toLowerCase(),
    line: version?.line ?? codename?.line ?? id.line,
    ...(version === undefined ? {} : { versionId: version.value }),
    ...(codename === undefined ? {} : { codename: codename.value }),
    ...(prettyName === undefined ? {} : { prettyName: prettyName.value }),
  };
}

function lineOf(contents: string, match: RegExpExecArray): number {
  return contents.slice(0, match.index).split(/\r?\n/).length;
}

/** Read `NODE_MAJOR_VERSION`, `NODE_MINOR_VERSION`, and `NODE_PATCH_VERSION` from `node_version.h`. */
export function parseNodeVersionHeader(contents: string): { version: string; line: number } | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_TEXT_BYTES) return undefined;
  const major = /^#define\s+NODE_MAJOR_VERSION\s+(\d+)\s*$/m.exec(contents);
  if (!major?.[1]) return undefined;
  const minor = /^#define\s+NODE_MINOR_VERSION\s+(\d+)\s*$/m.exec(contents)?.[1];
  const patch = /^#define\s+NODE_PATCH_VERSION\s+(\d+)\s*$/m.exec(contents)?.[1];
  return {
    version: `${Number(major[1])}.${minor === undefined ? "0" : Number(minor)}.${patch === undefined ? "0" : Number(patch)}`,
    line: lineOf(contents, major),
  };
}

/** Read the `goX.Y.Z` line of a Go `VERSION` file. */
export function parseGoVersion(contents: string): { version: string; line: number } | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_TEXT_BYTES) return undefined;
  const match = /^go(\d+\.\d+(?:\.\d+)?)/m.exec(contents);
  if (!match?.[1]) return undefined;
  return { version: match[1], line: lineOf(contents, match) };
}

/** Read `JAVA_VERSION` from a JDK `release` file, keeping the text for rule matching. */
export function parseJavaRelease(contents: string): { version: string; line: number } | undefined {
  if (Buffer.byteLength(contents, "utf8") > MAXIMUM_TEXT_BYTES) return undefined;
  const match = /^JAVA_VERSION\s*=\s*"?([^"\r\n]+)"?\s*$/m.exec(contents);
  if (!match?.[1]) return undefined;
  const version = match[1].trim();
  if (!parseJdkVersion(version)) return undefined;
  return { version, line: lineOf(contents, match) };
}

function pythonVersion(name: string): string | undefined {
  const match = /^python(\d+\.\d+)$/.exec(name);
  return match?.[1];
}

function rubyVersion(name: string): string | undefined {
  return /^\d+\.\d+\.\d+$/.test(name) ? name : /^ruby(\d+\.\d+)$/.exec(name)?.[1];
}

/** A release line: `3.1` and `3.1.0` are the same Ruby. */
function majorMinor(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

function phpVersion(name: string): string | undefined {
  const dotted = /^php(\d+\.\d+)$/.exec(name)?.[1];
  if (dotted) return dotted;
  const compact = /^php(\d)(\d+)$/.exec(name);
  return compact?.[1] && compact[2] ? `${compact[1]}.${compact[2]}` : undefined;
}

function dotnetVersion(name: string): string | undefined {
  return /^(\d+\.\d+\.\d+)/.exec(name)?.[1];
}

async function runtimeEvidence(source: RootfsSource): Promise<RootfsRuntimeEvidence[]> {
  const evidence = new Map<string, RootfsRuntimeEvidence>();
  const add = (runtime: Runtime, version: string, entry: string, line: number, identity = version): void => {
    const key = `${runtime}\u0000${identity}`;
    if (evidence.has(key)) return;
    evidence.set(key, { runtime, version, entry, path: source.path(entry), line });
  };

  for (const entry of ["usr/local/include/node/node_version.h", "usr/include/node/node_version.h"]) {
    const parsed = parseNodeVersionHeader((await source.read(entry)) ?? "");
    if (parsed) {
      add("nodejs", parsed.version, entry, parsed.line);
      break;
    }
  }

  for (const entry of ["usr/local/go/VERSION"]) {
    const parsed = parseGoVersion((await source.read(entry)) ?? "");
    if (parsed) add("golang", parsed.version, entry, parsed.line);
  }
  for (const name of (await source.list("usr/lib")) ?? []) {
    if (!/^go-\d+\.\d+(?:\.\d+)?$/.test(name)) continue;
    const entry = `usr/lib/${name}/VERSION`;
    const parsed = parseGoVersion((await source.read(entry)) ?? "");
    if (parsed) add("golang", parsed.version, entry, parsed.line);
  }

  const javaHomes = new Set<string>(["opt/java/openjdk"]);
  for (const name of (await source.list("usr/lib/jvm")) ?? []) javaHomes.add(`usr/lib/jvm/${name}`);
  for (const name of (await source.list("opt/java")) ?? []) javaHomes.add(`opt/java/${name}`);
  for (const home of [...javaHomes].sort((left, right) => left.localeCompare(right))) {
    const entry = `${home}/release`;
    const parsed = parseJavaRelease((await source.read(entry)) ?? "");
    if (parsed) {
      const major = parseJdkVersion(parsed.version);
      if (major) add("java", parsed.version, entry, parsed.line, `${major.major}`);
    }
  }

  for (const directory of ["usr/lib", "usr/local/lib"]) {
    for (const name of (await source.list(directory)) ?? []) {
      const version = pythonVersion(name);
      if (version) add("python", version, `${directory}/${name}`, 1);
    }
  }
  for (const directory of ["usr/bin", "usr/local/bin"]) {
    for (const name of (await source.list(directory)) ?? []) {
      const python = pythonVersion(name);
      if (python) add("python", python, `${directory}/${name}`, 1);
      const ruby = rubyVersion(name);
      if (ruby) add("ruby", ruby, `${directory}/${name}`, 1, majorMinor(ruby));
      const php = phpVersion(name);
      if (php) add("php", php, `${directory}/${name}`, 1);
    }
  }
  for (const directory of ["usr/lib/ruby", "usr/local/lib/ruby"]) {
    for (const name of (await source.list(directory)) ?? []) {
      const version = rubyVersion(name);
      if (version) add("ruby", version, `${directory}/${name}`, 1, majorMinor(version));
    }
  }

  for (const directory of ["usr/share/dotnet/shared/Microsoft.NETCore.App", "usr/lib/dotnet/shared/Microsoft.NETCore.App"]) {
    for (const name of (await source.list(directory)) ?? []) {
      const version = dotnetVersion(name);
      if (version) add("dotnet", version, `${directory}/${name}`, 1, version.split(".").slice(0, 2).join("."));
    }
  }

  return [...evidence.values()].sort(
    (left, right) => left.runtime.localeCompare(right.runtime) || left.path.localeCompare(right.path),
  );
}

function field(block: Buffer, start: number, length: number): string {
  const slice = block.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? slice.length : end).toString("utf8");
}

function octal(block: Buffer, start: number, length: number): number {
  const text = field(block, start, length).trim();
  if (text.length === 0) return 0;
  const value = Number.parseInt(text, 8);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function entryName(block: Buffer): string {
  const name = field(block, 0, 100);
  const prefix = field(block, 345, 155);
  // `tar -C rootfs -cf image.tar .` writes every member with a `./` prefix.
  return (prefix.length > 0 ? `${prefix}/${name}` : name).replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
}

function emptyBlock(block: Buffer): boolean {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}

function normalizeArchiveEntries(entries: ReadonlyMap<string, ArchiveEntry>): Map<string, ArchiveEntry> {
  if (entries.has("etc/os-release") || entries.has("usr/lib/os-release")) return new Map(entries);

  const tops = new Set<string>();
  for (const [name, entry] of entries) {
    if (entry.type === "directory") continue;
    const slash = name.indexOf("/");
    if (slash === -1) return new Map(entries);
    tops.add(name.slice(0, slash));
  }
  if (tops.size !== 1) return new Map(entries);

  const top = [...tops][0];
  if (top === undefined) return new Map(entries);
  const prefix = `${top}/`;
  const stripped = new Map<string, ArchiveEntry>();
  for (const [name, entry] of entries) {
    if (name.startsWith(prefix)) stripped.set(name.slice(prefix.length), entry);
  }
  return stripped;
}

interface PendingEntry {
  name: string;
  type: ArchiveEntry["type"];
  size: number;
  chunks: Buffer[];
  bytes: number;
}

async function readArchive(path: string): Promise<Map<string, ArchiveEntry> | undefined> {
  const entries = new Map<string, ArchiveEntry>();
  const input = createReadStream(path);
  const gunzip = /\.(?:tar\.gz|tgz)$/i.test(path) ? createGunzip() : undefined;
  // pipe does not forward a source error; hand it to the iterator so an unreadable archive is skipped.
  if (gunzip) {
    input.once("error", (error) => {
      if (!gunzip.destroyed) gunzip.destroy(error);
    });
  }
  const stream = gunzip === undefined ? input : input.pipe(gunzip);

  let buffer = Buffer.alloc(0);
  let remaining = 0;
  let padding = 0;
  let pending: PendingEntry | undefined;
  let total = 0;
  let done = false;

  const finish = (): void => {
    if (!pending) return;
    const { name, type, size, chunks, bytes } = pending;
    if (name.length > 0) {
      const text = type === "file" ? Buffer.concat(chunks).subarray(0, bytes).toString("utf8") : undefined;
      entries.set(name, text === undefined ? { type } : { type, text });
      if (entries.size >= MAXIMUM_MEMBERS) done = true;
    }
    padding = (BLOCK - (size % BLOCK)) % BLOCK;
    pending = undefined;
  };

  try {
    outer: for await (const chunk of stream) {
      total += chunk.length;
      if (total > MAXIMUM_ARCHIVE_BYTES) break;
      buffer = buffer.length === 0 ? Buffer.from(chunk) : Buffer.concat([buffer, chunk]);

      while (!done) {
        if (padding > 0) {
          const take = Math.min(padding, buffer.length);
          buffer = buffer.subarray(take);
          padding -= take;
          if (padding > 0) break;
          continue;
        }
        if (remaining > 0) {
          const take = Math.min(remaining, buffer.length);
          if (take === 0) break;
          if (pending?.type === "file" && pending.bytes < MAXIMUM_TEXT_BYTES) {
            const piece = buffer.subarray(0, Math.min(take, MAXIMUM_TEXT_BYTES - pending.bytes));
            pending.chunks.push(piece);
            pending.bytes += piece.length;
          }
          buffer = buffer.subarray(take);
          remaining -= take;
          if (remaining === 0) finish();
          continue;
        }
        if (buffer.length < BLOCK) break;

        const header = buffer.subarray(0, BLOCK);
        buffer = buffer.subarray(BLOCK);
        if (emptyBlock(header)) {
          done = true;
          break;
        }

        const flag = String.fromCharCode(header[156] ?? 0);
        const size = octal(header, 124, 12);
        const name = entryName(header);
        const type: ArchiveEntry["type"] =
          flag === "5"
            ? "directory"
            : flag === "1" || flag === "2"
              ? "symlink"
              : flag === "0" || flag === "\u0000" || flag === "7"
                ? "file"
                : "other";

        // Long-name and pax headers describe the next entry; this reader only needs the well-known short paths.
        pending = { name: flag === "L" || flag === "x" || flag === "g" || flag === "K" ? "" : name, type, size, chunks: [], bytes: 0 };
        remaining = size;
        if (remaining === 0) finish();
      }
      if (done) break outer;
    }
  } catch {
    // A truncated or unreadable archive is not a root filesystem; keep the entries that were complete.
  } finally {
    // Stop reading at a cap, at the end of the tar, or on an error without leaking the descriptor.
    input.destroy();
    if (stream !== input) stream.destroy();
  }

  return entries.size > 0 ? entries : undefined;
}
