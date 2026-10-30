// Test runner used by `npm test` and `npm run check`.
//
// In CI, a failed test file is re-run once. If it passes on retry it is reported as flaky in the
// step summary (and still counts as a pass). Tests listed in tests/quarantine.json are skipped on
// pull_request and merge_group events; the nightly ci-health job runs them with --quarantine-only.
// The weekly ci-health job lists flaky tests seen that week with --list-weekly-flaky.

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { appendFile, glob, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { testProcessArgs } from "../dist/tools/check-pipeline.js";

/** @param {string} path */
function realpathOrResolve(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export const QUARANTINE_PATH = "tests/quarantine.json";
export const FLAKY_MARKER = "<!-- evergreen-flaky-tests -->";
export const FLAKY_LOG_PREFIX = "evergreen-flaky-tests:";
export const USER_AGENT = "evergreen-run-tests (+https://github.com/arminazimi/evergreen)";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * @typedef {{ file: string, issue: string }} QuarantineEntry
 */

/**
 * @param {string} text
 * @returns {QuarantineEntry[]}
 */
export function parseQuarantine(text) {
  const parsed = JSON.parse(text);
  const entries = Array.isArray(parsed) ? parsed : parsed?.quarantined;
  if (!Array.isArray(entries)) {
    throw new Error(`${QUARANTINE_PATH} must be an array or { "quarantined": [...] }`);
  }
  return entries.map((entry, index) => {
    if (!entry || typeof entry.file !== "string" || typeof entry.issue !== "string") {
      throw new Error(`${QUARANTINE_PATH}[${index}] needs string "file" and "issue"`);
    }
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+$/.test(entry.issue)) {
      throw new Error(`${QUARANTINE_PATH}[${index}].issue must be a GitHub issue URL`);
    }
    toDistTestPath(entry.file);
    return { file: entry.file.replaceAll("\\", "/"), issue: entry.issue };
  });
}

/**
 * @param {string} sourceFile tests/foo.test.ts or dist/tests/foo.test.js
 * @returns {string} repo-relative dist path with forward slashes
 */
export function toDistTestPath(sourceFile) {
  const normalized = sourceFile.replaceAll("\\", "/");
  if (normalized.startsWith("dist/tests/") && normalized.endsWith(".test.js")) return normalized;
  if (normalized.startsWith("tests/") && normalized.endsWith(".test.ts")) {
    return `dist/${normalized.slice(0, -".ts".length)}.js`;
  }
  throw new Error(`quarantine file must be tests/*.test.ts or dist/tests/*.test.js: ${sourceFile}`);
}

/**
 * @param {readonly string[]} files
 * @param {string} tap
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function failedFilesFromTap(files, tap, cwd = process.cwd()) {
  // realpath so macOS /var vs /private/var matches Node's TAP locations.
  const allowed = new Map(
    files.map((file) => {
      const resolved = resolve(cwd, file);
      return [realpathOrResolve(resolved), resolved];
    }),
  );
  const failed = new Set();
  for (const block of tap.split(/\n(?=# Subtest:)/)) {
    if (!/\nnot ok \d+ -/m.test(`\n${block}`)) continue;
    const location = block.match(/^ {2}location: '([^']+)'/m)?.[1];
    if (location) {
      const real = realpathOrResolve(resolve(cwd, location.replace(/:\d+:\d+$/, "")));
      const original = allowed.get(real);
      if (original) failed.add(original);
      continue;
    }
    const name = block.match(/^not ok \d+ - (.+)$/m)?.[1]?.trim();
    if (name && (name.endsWith(".js") || name.endsWith(".ts") || name.includes(sep) || name.includes("/"))) {
      const real = realpathOrResolve(resolve(cwd, name));
      const original = allowed.get(real);
      if (original) failed.add(original);
    }
  }
  return [...failed].sort();
}

/**
 * @param {readonly string[]} flakyFiles
 */
export function renderFlakySummary(flakyFiles) {
  const lines = ["### Flaky tests", FLAKY_MARKER, ""];
  if (flakyFiles.length === 0) {
    lines.push("_None this run._", "");
    return lines.join("\n");
  }
  lines.push("Failed once, then passed on a single retry:", "");
  for (const file of flakyFiles) lines.push(`- \`${file}\``);
  lines.push("");
  return lines.join("\n");
}

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ quarantineOnly: boolean, listWeeklyFlaky: boolean, selfTest: boolean, files: string[] }} */
  const options = { quarantineOnly: false, listWeeklyFlaky: false, selfTest: false, files: [] };
  for (const arg of argv) {
    if (arg === "--quarantine-only") options.quarantineOnly = true;
    else if (arg === "--list-weekly-flaky") options.listWeeklyFlaky = true;
    else if (arg === "--self-test") options.selfTest = true;
    else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    else options.files.push(arg);
  }
  return options;
}

function isPullRequestEvent() {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  return event === "pull_request" || event === "merge_group";
}

/**
 * @param {readonly string[]} nodeArgs
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, capture?: boolean }} [options]
 * @returns {Promise<{ code: number, signal: NodeJS.Signals | null, output: string }>}
 */
export function spawnTest(nodeArgs, options = {}) {
  // Piped stdout selects TAP; force the reporter so a TTY still yields TAP when we need it.
  const args = options.capture ? [...nodeArgs, "--test-reporter=tap"] : [...nodeArgs];
  return new Promise((resolvePromise, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    const child = spawn(process.execPath, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (options.capture) {
      child.stdout.on("data", (chunk) => {
        chunks.push(chunk);
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        chunks.push(chunk);
        process.stderr.write(chunk);
      });
    }
    child.on("error", reject);
    child.on("exit", (code, signal) =>
      resolvePromise({ code: code ?? 1, signal, output: Buffer.concat(chunks).toString("utf8") }),
    );
  });
}

/**
 * @returns {Promise<string[]>}
 */
async function listDistTests() {
  const files = [];
  for await (const file of glob("dist/tests/**/*.test.js", { cwd: ROOT })) {
    files.push(resolve(ROOT, file));
  }
  return files.sort();
}

/**
 * @param {QuarantineEntry[]} entries
 */
function quarantineDistSet(entries) {
  return new Set(entries.map((entry) => resolve(ROOT, toDistTestPath(entry.file))));
}

/**
 * @param {string[]} flakyRelative
 */
async function reportFlaky(flakyRelative) {
  const summary = renderFlakySummary(flakyRelative);
  process.stdout.write(`\n${FLAKY_LOG_PREFIX}${JSON.stringify(flakyRelative)}\n`);
  for (const file of flakyRelative) {
    process.stdout.write(`::warning title=Flaky test::${file} failed once then passed on retry\n`);
  }
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) await appendFile(stepSummary, `\n${summary}`);
  else process.stdout.write(`\n${summary}`);
}

async function loadQuarantine() {
  const text = await readFile(resolve(ROOT, QUARANTINE_PATH), "utf8");
  return parseQuarantine(text);
}

/**
 * @param {string[]} files absolute paths
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, concurrencyArg?: string }} [options]
 */
async function runFilesWithRetry(files, options = {}) {
  const cwd = options.cwd ?? ROOT;
  const env = options.env ?? process.env;
  const concurrencyArg = options.concurrencyArg;
  const shouldRetry = env.EVERGREEN_RETRY_FLAKY !== "0" && (env.CI === "true" || env.EVERGREEN_RETRY_FLAKY === "1");
  const baseArgs = ["--test", concurrencyArg, ...files].filter((arg) => typeof arg === "string");
  const first = await spawnTest(baseArgs, { cwd, env, capture: shouldRetry });
  if (first.signal) {
    process.kill(process.pid, first.signal);
    return 1;
  }
  if (first.code === 0) return 0;
  if (!shouldRetry) return first.code;

  const failed = failedFilesFromTap(files, first.output, cwd);
  if (failed.length === 0) return first.code;

  process.stdout.write(`\nRetrying ${failed.length} failed test file(s) once to detect flakes…\n`);
  /** @type {string[]} */
  const flaky = [];
  /** @type {string[]} */
  const hard = [];
  for (const file of failed) {
    const result = await spawnTest(["--test", concurrencyArg, file].filter((arg) => typeof arg === "string"), {
      cwd,
      env,
      capture: true,
    });
    if (result.signal) {
      process.kill(process.pid, result.signal);
      return 1;
    }
    const rel = relative(cwd, file).replaceAll("\\", "/");
    if (result.code === 0) flaky.push(rel);
    else hard.push(rel);
  }

  if (flaky.length > 0) await reportFlaky(flaky);
  if (hard.length > 0) {
    process.stderr.write(`\nFailed after retry:\n${hard.map((file) => `  ${file}`).join("\n")}\n`);
    return 1;
  }
  return 0;
}

/**
 * @param {{ quarantineOnly: boolean, files: string[] }} options
 */
async function runSuite(options) {
  const concurrencyArg = testProcessArgs().find((arg) => arg.startsWith("--test-concurrency="));
  const quarantined = await loadQuarantine();
  const quarantinePaths = quarantineDistSet(quarantined);
  let files =
    options.files.length > 0
      ? options.files.map((file) => resolve(ROOT, file))
      : await listDistTests();

  if (options.quarantineOnly) {
    files = [...quarantinePaths].sort();
    if (files.length === 0) {
      process.stdout.write("No quarantined tests to run.\n");
      return 0;
    }
    process.stdout.write(`Running ${files.length} quarantined test file(s).\n`);
  } else if (isPullRequestEvent()) {
    const before = files.length;
    files = files.filter((file) => !quarantinePaths.has(file));
    const skipped = before - files.length;
    if (skipped > 0) {
      process.stdout.write(
        `Skipping ${skipped} quarantined test file(s) on ${process.env.GITHUB_EVENT_NAME} (see ${QUARANTINE_PATH}).\n`,
      );
    }
  }

  if (files.length === 0) {
    process.stdout.write("No test files to run.\n");
    return 0;
  }

  return runFilesWithRetry(files, { concurrencyArg });
}

/**
 * Deliberate flake: fails once, then passes. Proves CI reports flakes instead of failing.
 */
async function runSelfTest() {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-flaky-self-"));
  try {
    const file = join(dir, "deliberate-flake.test.js");
    // Avoid embedding `node:path` / `join(` in this source string: the usage-parity scan
    // would treat those characters inside the template as a real call site.
    await writeFile(
      file,
      `import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { test } from "node:test";

const marker = import.meta.dirname + "/ran-once";

test("deliberate flake fails once then passes", () => {
  if (!existsSync(marker)) {
    writeFileSync(marker, "1");
    assert.fail("deliberate first-attempt failure");
  }
});
`,
    );
    const env = { ...process.env, EVERGREEN_RETRY_FLAKY: "1", CI: "true" };
    const code = await runFilesWithRetry([file], { cwd: dir, env, concurrencyArg: "--test-concurrency=1" });
    if (code !== 0) throw new Error(`self-test expected exit 0 after flaky retry, got ${code}`);
    process.stdout.write("self-test: deliberate flake reported, not failed.\n");
    return 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** @type {(url: string, headers?: Record<string, string>) => Promise<{ status: number, text: string }>} */
const defaultFetcher = async (url, headers = {}) => {
  const response = await fetch(url, { headers, redirect: "follow" });
  return { status: response.status, text: await response.text() };
};

/**
 * @param {string} repo
 * @param {string | undefined} token
 * @param {(url: string, headers?: Record<string, string>) => Promise<{ status: number, text: string }>} [fetcher]
 */
export async function listWeeklyFlaky(repo, token, fetcher = defaultFetcher) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // One Linux check job per run is enough: the flaky marker is duplicated across the OS matrix.
  const runsUrl = `https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?per_page=30&status=completed&created=${encodeURIComponent(`>=${since}`)}`;
  const runsResponse = await fetcher(runsUrl, headers);
  if (runsResponse.status >= 400) {
    throw new Error(`HTTP ${runsResponse.status} for ${runsUrl}`);
  }
  const runs = JSON.parse(runsResponse.text).workflow_runs ?? [];
  /** @type {Map<string, { file: string, runs: number[] }>} */
  const byFile = new Map();

  for (const run of runs) {
    const jobsUrl = `https://api.github.com/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`;
    const jobsResponse = await fetcher(jobsUrl, headers);
    if (jobsResponse.status >= 400) continue;
    const jobs = (JSON.parse(jobsResponse.text).jobs ?? []).filter(
      (/** @type {{ name?: string, conclusion?: string | null }} */ job) =>
        job.conclusion === "success" && /^check \(ubuntu-latest, node 24\)$/.test(job.name ?? ""),
    );
    for (const job of jobs) {
      const logsUrl = `https://api.github.com/repos/${repo}/actions/jobs/${job.id}/logs`;
      const logsResponse = await fetcher(logsUrl, {
        ...headers,
        Accept: "application/vnd.github+json, application/octet-stream",
      });
      if (logsResponse.status >= 400) continue;
      for (const line of logsResponse.text.split("\n")) {
        const index = line.indexOf(FLAKY_LOG_PREFIX);
        if (index === -1) continue;
        try {
          const listed = JSON.parse(line.slice(index + FLAKY_LOG_PREFIX.length));
          if (!Array.isArray(listed)) continue;
          for (const file of listed) {
            if (typeof file !== "string") continue;
            const current = byFile.get(file) ?? { file, runs: [] };
            if (!current.runs.includes(run.id)) current.runs.push(run.id);
            byFile.set(file, current);
          }
        } catch {
          // Ignore truncated or unrelated log lines.
        }
      }
    }
  }

  return [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * @param {Awaited<ReturnType<typeof listWeeklyFlaky>>} entries
 */
export function renderWeeklyFlakySummary(entries) {
  const lines = ["### Flaky tests this week", FLAKY_MARKER, ""];
  if (entries.length === 0) {
    lines.push("_No flaky tests recorded in ci.yml logs this week._", "");
    return lines.join("\n");
  }
  for (const entry of entries) {
    lines.push(`- \`${entry.file}\` (${entry.runs.length} run(s))`);
  }
  lines.push("");
  return lines.join("\n");
}

async function runListWeeklyFlaky() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required for --list-weekly-flaky");
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const entries = await listWeeklyFlaky(repo, token);
  const summary = renderWeeklyFlakySummary(entries);
  process.stdout.write(summary);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) await appendFile(stepSummary, `\n${summary}`);
  await mkdir("metrics/ci", { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  await writeFile(
    join("metrics/ci", `flaky-${date}.json`),
    `${JSON.stringify({ date, flaky: entries }, null, 2)}\n`,
  );
  return 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();
  if (options.listWeeklyFlaky) return runListWeeklyFlaky();
  return runSuite(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
