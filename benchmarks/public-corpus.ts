// Loads the public validation corpus from one JSON file per repository under
// benchmarks/public-repositories/<ecosystem>/. Adding a repository is a new file,
// so two pull requests that each add a repository cannot conflict on a shared list.

import { readdir, readFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { CorpusRepositoryEntry } from "./corpus-harness.js";

export const PUBLIC_CORPUS_SCHEMA_VERSION = "evergreen.public-validation.v1" as const;
/** Directory of per-repository corpus files, grouped by ecosystem. */
export const PUBLIC_CORPUS_DIR = "benchmarks/public-repositories";

export interface PublicCorpus {
  schemaVersion: typeof PUBLIC_CORPUS_SCHEMA_VERSION;
  repositories: CorpusRepositoryEntry[];
}

/** `0000--owner--name.json` → sort key; files without a numeric prefix sort after numbered ones. */
function fileSortKey(fileName: string): [number, string] {
  const match = /^(\d+)--/.exec(fileName);
  return match ? [Number(match[1]), fileName] : [Number.MAX_SAFE_INTEGER, fileName];
}

function compareKeys(left: [number, string], right: [number, string]): number {
  return left[0] - right[0] || left[1].localeCompare(right[1]);
}

function parseEntry(raw: string, filePath: string, ecosystem: string): CorpusRepositoryEntry {
  const entry = JSON.parse(raw) as CorpusRepositoryEntry;
  if (entry.ecosystem !== ecosystem) {
    throw new Error(`${filePath}: ecosystem is "${entry.ecosystem}", but the file is under "${ecosystem}/"`);
  }
  if (!entry.repository || !entry.commit) {
    throw new Error(`${filePath}: missing repository or commit`);
  }
  return entry;
}

async function ecosystemDirs(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function ecosystemDirsSync(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

/** Assembles the public corpus from `benchmarks/public-repositories/<ecosystem>/*.json`. */
export async function loadPublicCorpus(cwd: string = process.cwd()): Promise<PublicCorpus> {
  const root = resolve(cwd, PUBLIC_CORPUS_DIR);
  const repositories: Array<{ key: [number, string]; entry: CorpusRepositoryEntry }> = [];
  for (const ecosystem of await ecosystemDirs(root)) {
    const dir = join(root, ecosystem);
    const files = (await readdir(dir))
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => compareKeys(fileSortKey(left), fileSortKey(right)));
    for (const file of files) {
      const filePath = join(dir, file);
      repositories.push({
        key: fileSortKey(file),
        entry: parseEntry(await readFile(filePath, "utf8"), `${PUBLIC_CORPUS_DIR}/${ecosystem}/${file}`, ecosystem),
      });
    }
  }
  repositories.sort((left, right) => compareKeys(left.key, right.key));
  return { schemaVersion: PUBLIC_CORPUS_SCHEMA_VERSION, repositories: repositories.map((item) => item.entry) };
}

/** Sync variant for tests and tools that already load the corpus synchronously. */
export function loadPublicCorpusSync(cwd: string = process.cwd()): PublicCorpus {
  const root = resolve(cwd, PUBLIC_CORPUS_DIR);
  const repositories: Array<{ key: [number, string]; entry: CorpusRepositoryEntry }> = [];
  for (const ecosystem of ecosystemDirsSync(root)) {
    const dir = join(root, ecosystem);
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .sort((left, right) => compareKeys(fileSortKey(left), fileSortKey(right)));
    for (const file of files) {
      const filePath = join(dir, file);
      repositories.push({
        key: fileSortKey(file),
        entry: parseEntry(readFileSync(filePath, "utf8"), `${PUBLIC_CORPUS_DIR}/${ecosystem}/${file}`, ecosystem),
      });
    }
  }
  repositories.sort((left, right) => compareKeys(left.key, right.key));
  return { schemaVersion: PUBLIC_CORPUS_SCHEMA_VERSION, repositories: repositories.map((item) => item.entry) };
}

/** File name for a corpus entry: zero-padded original index, then owner--name. */
export function corpusEntryFileName(index: number, repository: string): string {
  const [owner, name] = repository.split("/");
  if (!owner || !name) throw new Error(`Invalid repository "${repository}"`);
  return `${String(index).padStart(4, "0")}--${owner}--${name}.json`;
}
