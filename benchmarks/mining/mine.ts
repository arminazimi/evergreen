// Maintainer-only network tool. It is intentionally not wired into npm scripts or scans.
//
//   npm run build --silent
//   node dist/benchmarks/mining/mine.js --limit 30

import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { builtInDetectors } from "../../src/detectors/index.js";
import type { Finding } from "../../src/domain.js";
import { scanRepository } from "../../src/engine.js";

const run = promisify(execFile);
const SHA = /^[0-9a-f]{40}$/;
const COMMAND_TIMEOUT_MS = 30_000;
const SEARCHES = [
  "upgrade actions/checkout v5",
  "bump actions/checkout from 4 to 5",
  "upgrade actions/setup-node v5",
  "bump actions/setup-node from 4 to 5",
  "upgrade actions/cache v5",
  "bump actions/cache from 4 to 5",
  "upgrade upload-artifact v7",
  "upgrade download-artifact v7",
  "drop node 20 support",
  "drop node 18 support",
  "upgrade node 22",
  "replace request with fetch",
  "migrate from node-sass to sass",
  "remove left-pad",
  "drop python 3.9 support",
  "replace nose with pytest",
  "replace django-nose",
  "replace pycrypto",
] as const;

interface SearchCommit {
  sha: string;
  html_url: string;
  repository: { full_name: string; fork: boolean; archived: boolean };
  parents: Array<{ sha: string }>;
}

interface SearchResult {
  items: SearchCommit[];
}

interface Location {
  ruleId: string;
  path: string;
  line?: number;
}

interface Candidate {
  schemaVersion: "evergreen.migration-candidate.v1";
  id: string;
  repository: string;
  parentCommit: string;
  migrationCommit: string;
  ruleId: string;
  before: Location[];
  after: Location[];
  evidence: { kind: "migration-commit"; url: string; query: string };
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

function findingLocation(finding: Finding): Location {
  return {
    ruleId: finding.ruleId,
    path: finding.location.path,
    ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
  };
}

function key(location: Location): string {
  return `${location.ruleId}\0${location.path}`;
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

async function github<T>(endpoint: string, fields: Record<string, string>): Promise<T> {
  const args = ["api", "--method", "GET", endpoint, "-H", "Accept: application/vnd.github+json"];
  for (const [name, value] of Object.entries(fields)) args.push("-f", `${name}=${value}`);
  const { stdout } = await run("gh", args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
  });
  return JSON.parse(stdout) as T;
}

async function checkout(repository: string, commit: string, directory: string): Promise<void> {
  if (!SHA.test(commit)) throw new Error(`Refusing non-pinned commit: ${commit}`);
  await run("git", ["init", "--quiet", directory], { timeout: COMMAND_TIMEOUT_MS });
  await run(
    "git",
    ["-C", directory, "fetch", "--quiet", "--depth", "1", `https://github.com/${repository}.git`, commit],
    {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      maxBuffer: 10 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
    },
  );
  await run("git", ["-C", directory, "checkout", "--quiet", "--detach", "FETCH_HEAD"], {
    timeout: COMMAND_TIMEOUT_MS,
  });
}

async function scanCommit(root: string, repository: string, commit: string, name: string) {
  const directory = join(root, name);
  await checkout(repository, commit, directory);
  return (await scanRepository(directory, builtInDetectors)).findings.map(findingLocation);
}

async function inspect(
  root: string,
  commit: SearchCommit,
  query: string,
): Promise<Candidate[]> {
  const parentCommit = commit.parents[0]?.sha;
  if (
    !parentCommit ||
    !SHA.test(parentCommit) ||
    !SHA.test(commit.sha) ||
    commit.parents.length !== 1 ||
    commit.repository.fork ||
    commit.repository.archived
  ) return [];

  const candidateRoot = join(root, commit.sha);
  await mkdir(candidateRoot, { recursive: true });
  try {
    const before = await scanCommit(candidateRoot, commit.repository.full_name, parentCommit, "before");
    if (before.length === 0) return [];
    const after = await scanCommit(candidateRoot, commit.repository.full_name, commit.sha, "after");
    const afterKeys = new Set(after.map(key));
    const removed = before.filter((finding) => !afterKeys.has(key(finding)));
    const ruleIds = [...new Set(removed.map((finding) => finding.ruleId))].sort();
    return ruleIds.map((ruleId) => ({
      schemaVersion: "evergreen.migration-candidate.v1",
      id: `${slug(commit.repository.full_name)}-${commit.sha.slice(0, 12)}-${slug(ruleId)}`,
      repository: commit.repository.full_name,
      parentCommit,
      migrationCommit: commit.sha,
      ruleId,
      before: removed.filter((finding) => finding.ruleId === ruleId),
      after: after.filter((finding) => finding.ruleId === ruleId),
      evidence: { kind: "migration-commit", url: commit.html_url, query },
    }));
  } finally {
    await rm(candidateRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const limit = Number.parseInt(argument("--limit", "30"), 10);
  if (!Number.isInteger(limit) || limit < 30) throw new Error("--limit must be at least 30");
  const output = resolve(argument("--out", "benchmarks/mining/candidates"));
  const root = await mkdtemp(join(tmpdir(), "evergreen-mining-"));
  const candidates = new Map<string, Candidate>();
  const seen = new Set<string>();

  try {
    for (const query of SEARCHES) {
      if (candidates.size >= limit) break;
      const result = await github<SearchResult>("search/commits", {
        q: `${query} is:public`,
        per_page: "25",
      });
      for (const commit of result.items) {
        if (candidates.size >= limit) break;
        if (seen.has(commit.sha)) continue;
        seen.add(commit.sha);
        process.stderr.write(
          `inspect ${commit.repository.full_name}@${commit.sha.slice(0, 12)} (${candidates.size}/${limit})\n`,
        );
        try {
          for (const candidate of await inspect(root, commit, query)) {
            candidates.set(candidate.id, candidate);
          }
        } catch (error) {
          process.stderr.write(`skip ${commit.repository.full_name}@${commit.sha}: ${String(error)}\n`);
        }
      }
    }

    if (candidates.size < limit) {
      throw new Error(`Only ${candidates.size} candidates found; required ${limit}. No partial output written.`);
    }
    await mkdir(output, { recursive: true });
    const oldFiles = JSON.parse(await readFile(join(output, "index.json"), "utf8").catch(() => "[]")) as string[];
    await Promise.all(oldFiles.map((file) => rm(join(output, file), { force: true })));
    const selected = [...candidates.values()].sort((left, right) => left.id.localeCompare(right.id)).slice(0, limit);
    const files = selected.map((candidate) => `${candidate.id}.json`);
    await Promise.all(
      selected.map((candidate, index) =>
        writeFile(join(output, files[index]!), `${JSON.stringify(candidate, null, 2)}\n`),
      ),
    );
    await writeFile(join(output, "index.json"), `${JSON.stringify(files, null, 2)}\n`);
    process.stdout.write(`Wrote ${files.length} pinned candidates to ${output}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await main();
