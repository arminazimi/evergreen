import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { builtInDetectors } from "../src/detectors/index.js";
import type { DetectorInputs } from "../src/sdk.js";
import { directorySize } from "./corpus-cost.js";
import { resolveFetchTimeoutMs, withRetries, withTimeout } from "./retry.js";

const run = promisify(execFile);

export type FetchStrategy = "shallow" | "sparse" | "tarball";

/** Written into a checkout so a cache entry records what it holds. A checkout without it is complete. */
export const FETCH_MARKER = ".evergreen-fetch";

/** The strategy `EVERGREEN_CORPUS_FETCH` names; sparse is the default (decision 0015). */
export function resolveFetchStrategy(env: NodeJS.ProcessEnv = process.env): FetchStrategy {
  const value = env.EVERGREEN_CORPUS_FETCH ?? "sparse";
  if (value !== "shallow" && value !== "sparse") throw new Error(`Invalid EVERGREEN_CORPUS_FETCH "${value}": use sparse or shallow.`);
  return value;
}

export interface FetchEntry {
  repository: string;
  commit: string;
}

export interface FetchOutcome {
  /** Bytes transferred or, for git, the size of the fetched git data. */
  bytes: number;
}

const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

/** `Package.JSON` becomes `[Pp]ackage.[Jj][Ss][Oo][Nn]`: git sparse-checkout patterns are case-sensitive, declarations are not. */
function caseInsensitive(text: string): string {
  return text.replace(/[A-Za-z]/g, (letter) => `[${letter.toLowerCase()}${letter.toUpperCase()}]`);
}

/** Sparse-checkout patterns (gitignore syntax) for every file any detector's declaration allows it to read. */
export function sparsePatterns(declarations: readonly DetectorInputs[] = builtInDetectors.flatMap((detector) => (detector.inputs ? [detector.inputs] : []))): string[] {
  const patterns = new Set<string>();
  for (const inputs of declarations) {
    for (const name of inputs.fileNames ?? []) patterns.add(caseInsensitive(name));
    for (const extension of [...(inputs.extensions ?? []), ...(inputs.sourceExtensions ?? [])]) patterns.add(`*${caseInsensitive(extension)}`);
    for (const directory of inputs.directories ?? []) patterns.add(`${directory.replace(/\/+$/, "")}/`);
  }
  return [...patterns].sort();
}

/** Identifies the declarations a sparse checkout was built from; a change to what detectors read changes it. */
export function sparseFingerprint(patterns: readonly string[] = sparsePatterns()): string {
  return `sparse:${createHash("sha256").update(patterns.join("\n")).digest("hex").slice(0, 16)}`;
}

/**
 * Whether the checkout in `directory` holds everything `strategy` needs. A complete checkout (no marker) serves
 * every strategy; a sparse one serves only a sparse run built from the same declarations, so adding a file to a
 * detector's inputs refetches instead of scanning a checkout that lacks it.
 */
export async function isCheckoutUsable(directory: string, strategy: FetchStrategy): Promise<boolean> {
  const marker = await readFile(`${directory}/${FETCH_MARKER}`, "utf8").then((text) => text.trim(), () => undefined);
  if (marker === undefined) return true;
  return strategy === "sparse" && marker === sparseFingerprint();
}

/** One network step of a fetch: a hard time limit per attempt, retried, naming the repository when it gives up. */
function networked<T>(entry: FetchEntry, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeoutMs = resolveFetchTimeoutMs();
  return withRetries(entry.repository, () => withTimeout(timeoutMs, operation));
}

/** git aborts a transfer slower than 1 KB/s for 30 s, so a stalled connection fails the attempt. */
const LOW_SPEED = ["-c", "http.lowSpeedLimit=1000", "-c", "http.lowSpeedTime=30"];

/** The current strategy: `git fetch --depth 1` of the pinned commit, then a full checkout. */
async function fetchShallow(directory: string, entry: FetchEntry): Promise<FetchOutcome> {
  await run("git", ["init", "--quiet", directory]);
  await networked(entry, (signal) =>
    run("git", ["-C", directory, ...LOW_SPEED, "fetch", "--quiet", "--depth", "1", `https://github.com/${entry.repository}.git`, entry.commit], { env: GIT_ENV, maxBuffer: 10 * 1024 * 1024, signal }),
  );
  await run("git", ["-C", directory, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  return { bytes: await directorySize(`${directory}/.git`) };
}

/**
 * A blobless shallow fetch (commits and trees, no file contents) followed by a sparse checkout of only the
 * declared files, so git downloads just those blobs.
 */
async function fetchSparse(directory: string, entry: FetchEntry): Promise<FetchOutcome> {
  await run("git", ["init", "--quiet", directory]);
  await run("git", ["-C", directory, "config", "core.sparseCheckout", "true"]);
  await run("git", ["-C", directory, "config", "core.sparseCheckoutCone", "false"]);
  await writeFile(`${directory}/.git/info/sparse-checkout`, `${sparsePatterns().join("\n")}\n`);
  await networked(entry, (signal) =>
    run("git", ["-C", directory, ...LOW_SPEED, "fetch", "--quiet", "--depth", "1", "--filter=blob:none", `https://github.com/${entry.repository}.git`, entry.commit], { env: GIT_ENV, maxBuffer: 10 * 1024 * 1024, signal }),
  );
  // The checkout downloads the declared blobs, so it is a network step too.
  await networked(entry, (signal) => run("git", ["-C", directory, ...LOW_SPEED, "checkout", "--quiet", "--detach", "FETCH_HEAD"], { env: GIT_ENV, signal }));
  await writeFile(`${directory}/${FETCH_MARKER}`, `${sparseFingerprint()}\n`);
  return { bytes: await directorySize(`${directory}/.git`) };
}

/** One request for the pinned commit's archive, extracted without any git data. */
async function fetchTarball(directory: string, entry: FetchEntry): Promise<FetchOutcome> {
  // The signal also covers reading the body, so a stalled download fails the attempt instead of hanging the run.
  const response = await fetch(`https://codeload.github.com/${entry.repository}/tar.gz/${entry.commit}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`${entry.repository}: HTTP ${response.status}`);
  await mkdir(directory, { recursive: true });
  const tar = spawn("tar", ["-xzf", "-", "-C", directory, "--strip-components=1"], { stdio: ["pipe", "ignore", "pipe"] });
  const finished = new Promise<void>((resolve, reject) => {
    let stderr = "";
    tar.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    tar.on("error", reject);
    tar.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}: ${stderr}`))));
  });
  let bytes = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (!tar.stdin.write(value)) await new Promise((resolve) => tar.stdin.once("drain", resolve));
  }
  tar.stdin.end();
  await finished;
  return { bytes };
}

export function fetchWith(strategy: FetchStrategy, directory: string, entry: FetchEntry): Promise<FetchOutcome> {
  if (strategy === "shallow") return fetchShallow(directory, entry);
  if (strategy === "sparse") return fetchSparse(directory, entry);
  return fetchTarball(directory, entry);
}
