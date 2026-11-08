// A hash-chained log of data releases. One JSON object per line; each entry carries the hash of the entry before it,
// so changing, removing, or reordering any past entry changes every hash after it and the checker names the first
// entry that no longer matches. Docs: docs/DATA.md, "Release log".

import { canonicalJson, sha256Hex } from "./data-bundle.js";

export const RELEASE_LOG_SCHEMA = "evergreen.data-release-log.v1";
/** The `previous` value of the first entry. */
export const RELEASE_LOG_GENESIS = `sha256:${"0".repeat(64)}`;

export interface ReleaseLogEntry {
  schemaVersion: typeof RELEASE_LOG_SCHEMA;
  /** Position in the log, starting at 1. */
  index: number;
  /** Bundle version, for example `2026.10.16`. */
  version: string;
  /** The `contentDigest` of the bundle's manifest. */
  contentDigest: string;
  /** `sha256:` plus the SHA-256 of the published bundle file. */
  bundleSha256: string;
  createdAt: string;
  /** The `hash` of the entry before this one, or {@link RELEASE_LOG_GENESIS}. */
  previous: string;
  /** `sha256:` plus the SHA-256 of this entry's canonical JSON without `hash`. */
  hash: string;
}

export type NewReleaseLogEntry = Pick<ReleaseLogEntry, "version" | "contentDigest" | "bundleSha256" | "createdAt">;

export class ReleaseLogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseLogError";
  }
}

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const KEYS = [
  "bundleSha256",
  "contentDigest",
  "createdAt",
  "hash",
  "index",
  "previous",
  "schemaVersion",
  "version",
].join(",");

const STRING_FIELDS = ["schemaVersion", "version", "contentDigest", "bundleSha256", "createdAt", "previous", "hash"];

function isEntry(value: unknown): value is ReleaseLogEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(",") !== KEYS) return false;
  const record = new Map(Object.entries(value));
  return typeof record.get("index") === "number" && STRING_FIELDS.every((key) => typeof record.get(key) === "string");
}

function withoutHash(entry: ReleaseLogEntry): Omit<ReleaseLogEntry, "hash"> {
  return {
    schemaVersion: entry.schemaVersion,
    index: entry.index,
    version: entry.version,
    contentDigest: entry.contentDigest,
    bundleSha256: entry.bundleSha256,
    createdAt: entry.createdAt,
    previous: entry.previous,
  };
}

export function entryHash(entry: Omit<ReleaseLogEntry, "hash">): string {
  return `sha256:${sha256Hex(canonicalJson(entry))}`;
}

export function serializeReleaseLog(entries: readonly ReleaseLogEntry[]): string {
  return entries.map((entry) => `${canonicalJson(entry)}\n`).join("");
}

/** Parses and verifies a whole log. Throws {@link ReleaseLogError} naming the first entry that does not hold. */
export function verifyReleaseLog(text: string): ReleaseLogEntry[] {
  if (text !== "" && !text.endsWith("\n")) throw new ReleaseLogError("The log must end with a newline.");
  const entries: ReleaseLogEntry[] = [];
  const lines = text === "" ? [] : text.slice(0, -1).split("\n");
  let previous = RELEASE_LOG_GENESIS;
  lines.forEach((line, position) => {
    const label = `Entry ${position + 1}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new ReleaseLogError(`${label} is not valid JSON.`);
    }
    if (!isEntry(parsed))
      throw new ReleaseLogError(`${label} does not have exactly the fields of ${RELEASE_LOG_SCHEMA}.`);
    const entry = parsed;
    if (line !== canonicalJson(entry)) throw new ReleaseLogError(`${label} is not in canonical form.`);
    if (entry.schemaVersion !== RELEASE_LOG_SCHEMA) throw new ReleaseLogError(`${label} has an unknown schemaVersion.`);
    if (entry.index !== position + 1) throw new ReleaseLogError(`${label} has index ${entry.index}.`);
    for (const [field, value] of Object.entries({
      contentDigest: entry.contentDigest,
      bundleSha256: entry.bundleSha256,
      previous: entry.previous,
      hash: entry.hash,
    }))
      if (!DIGEST.test(value)) throw new ReleaseLogError(`${label} has a malformed ${field}.`);
    if (entry.previous !== previous)
      throw new ReleaseLogError(`${label} does not follow entry ${position}: a past release was changed or removed.`);
    const body = withoutHash(entry);
    if (entryHash(body) !== entry.hash)
      throw new ReleaseLogError(`${label} (${entry.version}) was changed after it was written.`);
    if (entries.some((seen) => seen.version === entry.version))
      throw new ReleaseLogError(`${label} repeats version ${entry.version}.`);
    entries.push(entry);
    previous = entry.hash;
  });
  return entries;
}

/** Returns the log with one entry added. Verifies the existing log first, so a damaged log is never extended. */
export function appendReleaseLog(text: string, next: NewReleaseLogEntry): string {
  const entries = verifyReleaseLog(text);
  if (entries.some((seen) => seen.version === next.version))
    throw new ReleaseLogError(`Version ${next.version} is already in the log.`);
  const last = entries.at(-1);
  const body = {
    schemaVersion: RELEASE_LOG_SCHEMA,
    index: entries.length + 1,
    version: next.version,
    contentDigest: next.contentDigest,
    bundleSha256: next.bundleSha256,
    createdAt: next.createdAt,
    previous: last?.hash ?? RELEASE_LOG_GENESIS,
  } satisfies Omit<ReleaseLogEntry, "hash">;
  const entry: ReleaseLogEntry = { ...body, hash: entryHash(body) };
  return serializeReleaseLog([...entries, entry]);
}

/** True when `current` is `past` plus later entries and nothing earlier was touched. */
export function extendsReleaseLog(past: string, current: string): boolean {
  const before = verifyReleaseLog(past);
  const after = verifyReleaseLog(current);
  return before.length <= after.length && before.every((entry, index) => after[index]?.hash === entry.hash);
}
