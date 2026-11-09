// Test runner used by `npm test` and `npm run check`.
//
// In CI, a failed test file is re-run once. If it passes on retry it is reported as flaky in the
// step summary (and still counts as a pass). Tests listed in tests/quarantine.json are skipped on
// pull_request and merge_group events; the nightly ci-health job runs them with --quarantine-only.
// The weekly ci-health job lists flaky tests seen that week with --list-weekly-flaky.
// Every quarantine entry needs an "expires" date; once it has passed, every run of this runner fails
// until a person fixes the file or moves the date forward, so a skip never becomes permanent.
//
// Linux CI shards the suite across runners with EVERGREEN_TEST_SHARD / EVERGREEN_TEST_SHARD_COUNT,
// balancing by measured file times in benchmarks/test-file-timings.json. When
// EVERGREEN_CHECK_COVERAGE=1 the same run writes lcov.info for the shard; CI merges the shard
// reports before the coverage floors and diff.
//
// On a pull request, ci.yml writes the change list to EVERGREEN_AFFECTED_FILES and only the tests
// that can reach a changed module run (tools/run-tests-selection.ts builds the map from imports). The
// merge queue, main, and every run without that list execute the whole suite, and coverage always
// measures every file, so the narrowing can cost a review round-trip but never the landing proof.

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { appendFile, glob, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  COVERAGE_EXCLUDES,
  COVERAGE_LCOV_PATH,
  coverageRequested,
  testProcessArgs,
} from "../dist/tools/check-pipeline.js";
import {
  DEFAULT_TEST_FILE_DURATION_MS,
  mergeLcovReports,
  parseShardEnv,
  parseTestFileTimings,
  selectShardFiles,
  shardLoadsWithinTolerance,
} from "../dist/tools/run-tests-sharding.js";
import {
  TEST_TIMING_MARKER,
  evaluateTestTimeBudget,
  fileDurationsFromJunit,
  formatTestDuration,
  formatTestTimeBudgetViolation,
  normalizeTestFilePath,
  parseTestTimeBudget,
  renderTestTimeBudgetFailure,
  renderTestTimingSummary,
  testTimeBudgetAnnotation,
} from "../dist/tools/run-tests-timing.js";

export {
  TEST_TIMING_MARKER,
  evaluateTestTimeBudget,
  fileDurationsFromJunit,
  formatTestDuration,
  formatTestTimeBudgetViolation,
  mergeLcovReports,
  normalizeTestFilePath,
  parseShardEnv,
  parseTestFileTimings,
  parseTestTimeBudget,
  renderTestTimeBudgetFailure,
  renderTestTimingSummary,
  selectShardFiles,
  shardLoadsWithinTolerance,
  testTimeBudgetAnnotation,
};

/** @param {string} path */
function realpathOrResolve(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

export const QUARANTINE_PATH = "tests/quarantine.json";
export const TIME_BUDGET_PATH = "benchmarks/test-time-budget.json";
export const FILE_TIMINGS_PATH = "benchmarks/test-file-timings.json";
export const AFFECTED_FILES_ENV = "EVERGREEN_AFFECTED_FILES";
export const FLAKY_MARKER = "<!-- evergreen-flaky-tests -->";
export const FLAKY_LOG_PREFIX = "evergreen-flaky-tests:";
export const USER_AGENT = "evergreen-run-tests (+https://github.com/arminazimi/evergreen)";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * @typedef {{ file: string, issue: string, expires: string }} QuarantineEntry
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real ISO calendar date (`YYYY-MM-DD`), read in UTC so a date that does not exist
 * (`2026-02-30`) and one with a stray offset are both rejected.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Today in UTC as an ISO date, the same value on every platform at the same instant. */
export function currentIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

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
    if (!isIsoDate(entry.expires)) {
      throw new Error(
        `${QUARANTINE_PATH}[${index}].expires is required and must be an ISO date (YYYY-MM-DD): the last day the file may stay skipped`,
      );
    }
    toDistTestPath(entry.file);
    return { file: entry.file.replaceAll("\\", "/"), issue: entry.issue, expires: entry.expires };
  });
}

/**
 * Entries past their expiry date, oldest first, so the failure names the longest-overdue skip.
 * An entry is still in force on its expiry date and expired the day after it.
 *
 * @param {readonly QuarantineEntry[]} entries
 * @param {string} today ISO date (`YYYY-MM-DD`) to compare against
 * @returns {QuarantineEntry[]}
 */
export function expiredQuarantineEntries(entries, today) {
  if (!isIsoDate(today)) {
    throw new Error(`quarantine expiry needs an ISO date (YYYY-MM-DD) for today: ${String(today)}`);
  }
  return entries
    .filter((entry) => entry.expires < today)
    .sort((a, b) => a.expires.localeCompare(b.expires) || a.file.localeCompare(b.file));
}

/**
 * @param {readonly QuarantineEntry[]} expired
 */
export function renderQuarantineExpiryFailure(expired) {
  const lines = [
    `Quarantine expired (${QUARANTINE_PATH}): a quarantined test file is skipped only until its expiry date.`,
    "",
    ...expired.map((entry) => `  - ${entry.file} expired on ${entry.expires} — ${entry.issue}`),
    "",
    'Fix the file and delete its entry, or move "expires" forward with the reason in the pull request.',
    "Do not add another entry, a skip, or a filter to hide the failure.",
  ];
  return lines.join("\n");
}

/**
 * Glass box: name every quarantined file with its expiry date and issue, so a skip is never silent.
 *
 * @param {readonly QuarantineEntry[]} entries
 * @param {string} headline
 */
export function renderQuarantineList(entries, headline) {
  const sorted = [...entries].sort((a, b) => a.file.localeCompare(b.file));
  const lines = [headline, ...sorted.map((entry) => `  - ${entry.file} until ${entry.expires} — ${entry.issue}`)];
  return `${lines.join("\n")}\n`;
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
  /** @type {{ quarantineOnly: boolean, listWeeklyFlaky: boolean, selfTest: boolean, mergeLcov: string[], mergeLcovOut: string, files: string[] }} */
  const options = {
    quarantineOnly: false,
    listWeeklyFlaky: false,
    selfTest: false,
    mergeLcov: [],
    mergeLcovOut: COVERAGE_LCOV_PATH,
    files: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--quarantine-only") options.quarantineOnly = true;
    else if (arg === "--list-weekly-flaky") options.listWeeklyFlaky = true;
    else if (arg === "--self-test") options.selfTest = true;
    else if (arg === "--merge-lcov") {
      const path = argv[index + 1];
      if (!path || path.startsWith("-")) throw new Error("--merge-lcov needs a path argument");
      options.mergeLcov.push(path);
      index += 1;
    } else if (arg === "--merge-lcov-out") {
      const path = argv[index + 1];
      if (!path || path.startsWith("-")) throw new Error("--merge-lcov-out needs a path argument");
      options.mergeLcovOut = path;
      index += 1;
    } else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    else options.files.push(arg);
  }
  return options;
}

function isPullRequestEvent() {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  return event === "pull_request" || event === "merge_group";
}

/**
 * Insert reporter flags after `--test` / concurrency flags and before file paths.
 *
 * @param {readonly string[]} nodeArgs
 * @param {readonly string[]} reporters
 */
export function insertReportersBeforeFiles(nodeArgs, reporters) {
  if (reporters.length === 0) return [...nodeArgs];
  let insertAt = 0;
  for (let index = 0; index < nodeArgs.length; index += 1) {
    const arg = nodeArgs[index];
    if (arg === "--test" || arg.startsWith("--test-concurrency=")) {
      insertAt = index + 1;
      continue;
    }
    break;
  }
  return [...nodeArgs.slice(0, insertAt), ...reporters, ...nodeArgs.slice(insertAt)];
}

/**
 * Test file paths relative to `cwd` when they sit under it. The whole suite is passed as arguments, and Windows
 * refuses a command line over 32,767 characters (`spawn ENAMETOOLONG`); absolute runner paths add about 25
 * characters to each of the 500 files, which is enough to cross it.
 *
 * @param {readonly string[]} nodeArgs
 * @param {string} cwd
 */
export function shortenFilePaths(nodeArgs, cwd) {
  return nodeArgs.map((arg) => {
    if (arg.startsWith("-") || !isAbsolute(arg)) return arg;
    const shortened = relative(cwd, arg);
    return shortened === "" || shortened.startsWith("..") || isAbsolute(shortened) ? arg : shortened;
  });
}

/**
 * Dual reporters: human stream on stdout plus junit to a temp file for per-file timing.
 * Capture mode uses TAP (flaky-retry parsing); otherwise spec keeps local output readable.
 * When coveragePath is set, an lcov reporter writes the shard (or full) coverage report.
 *
 * @param {readonly string[]} nodeArgs
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, capture?: boolean, junitPath?: string, coveragePath?: string }} [options]
 * @returns {Promise<{ code: number, signal: NodeJS.Signals | null, output: string, junitPath?: string }>}
 */
export function spawnTest(nodeArgs, options = {}) {
  const junitPath = options.junitPath;
  const coveragePath = options.coveragePath;
  /** @type {string[]} */
  const reporters = [];
  if (junitPath || coveragePath) {
    reporters.push(options.capture ? "--test-reporter=tap" : "--test-reporter=spec");
    reporters.push("--test-reporter-destination=stdout");
    if (junitPath) {
      reporters.push("--test-reporter=junit", `--test-reporter-destination=${junitPath}`);
    }
    if (coveragePath) {
      reporters.push("--test-reporter=lcov", `--test-reporter-destination=${coveragePath}`);
    }
  } else if (options.capture) {
    reporters.push("--test-reporter=tap");
  }
  // Reporter flags must come before test file paths; Node treats later tokens as files.
  const args = insertReportersBeforeFiles(shortenFilePaths(nodeArgs, options.cwd ?? process.cwd()), reporters);
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
      resolvePromise({
        code: code ?? 1,
        signal,
        output: Buffer.concat(chunks).toString("utf8"),
        junitPath,
      }),
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
 * The quarantined entries this run would actually skip: entries naming a file in the list, so the
 * skip report names real files instead of stale entries.
 *
 * @param {readonly string[]} files absolute paths the run would execute
 * @param {readonly QuarantineEntry[]} entries
 * @param {string} [root]
 * @returns {QuarantineEntry[]}
 */
export function quarantinedEntriesInRun(files, entries, root = ROOT) {
  const inRun = new Set(files);
  return entries.filter((entry) => inRun.has(resolve(root, toDistTestPath(entry.file))));
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

/**
 * @param {readonly { file: string, durationMs: number }[]} entries
 * @param {number} [totalMs]
 */
async function reportTestTiming(entries, totalMs) {
  const summary = renderTestTimingSummary(entries, { limit: 30, totalMs });
  process.stdout.write(`\n${summary}`);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) await appendFile(stepSummary, `\n${summary}`);
}

async function loadTimeBudget() {
  try {
    return parseTestTimeBudget(await readFile(resolve(ROOT, TIME_BUDGET_PATH), "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${TIME_BUDGET_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * @param {readonly import("../dist/tools/run-tests-timing.js").TestTimeBudgetViolation[]} violations
 */
async function reportTimeBudgetViolations(violations) {
  const lines = violations.map((violation) => formatTestTimeBudgetViolation(violation));
  process.stderr.write(
    `\nTest time budget exceeded (${TIME_BUDGET_PATH}):\n${lines.map((line) => `  ${line}`).join("\n")}\n`,
  );
  for (const violation of violations) process.stdout.write(`${testTimeBudgetAnnotation(violation)}\n`);
  const summary = renderTestTimeBudgetFailure(violations, { budgetPath: TIME_BUDGET_PATH });
  process.stdout.write(`\n${summary}`);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) await appendFile(stepSummary, `\n${summary}`);
}

async function loadQuarantine() {
  const text = await readFile(resolve(ROOT, QUARANTINE_PATH), "utf8");
  const entries = parseQuarantine(text);
  const expired = expiredQuarantineEntries(entries, currentIsoDate());
  if (expired.length > 0) {
    throw new Error(renderQuarantineExpiryFailure(expired));
  }
  return entries;
}

/**
 * @param {string[]} files absolute paths
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, concurrencyArg?: string, budget?: import("../dist/tools/run-tests-timing.js").TestTimeBudget, coveragePath?: string }} [options]
 */
async function runFilesWithRetry(files, options = {}) {
  const cwd = options.cwd ?? ROOT;
  const env = options.env ?? process.env;
  const concurrencyArg = options.concurrencyArg;
  const budget = options.budget;
  const coveragePath = options.coveragePath;
  const shouldRetry = env.EVERGREEN_RETRY_FLAKY !== "0" && (env.CI === "true" || env.EVERGREEN_RETRY_FLAKY === "1");
  /** @type {string[]} */
  const baseArgs = ["--test", concurrencyArg];
  if (coveragePath) {
    baseArgs.push(
      "--experimental-test-coverage",
      ...COVERAGE_EXCLUDES.map((path) => `--test-coverage-exclude=${path}`),
    );
  }
  baseArgs.push(...files);
  const filteredArgs = baseArgs.filter((arg) => typeof arg === "string");
  const junitDir = await mkdtemp(join(tmpdir(), "evergreen-test-junit-"));
  try {
    const junitPath = join(junitDir, "suite.xml");
    const first = await spawnTest(filteredArgs, { cwd, env, capture: shouldRetry, junitPath, coveragePath });
    /** @type {{ file: string, durationMs: number }[]} */
    let timingEntries = [];
    try {
      const xml = await readFile(junitPath, "utf8");
      timingEntries = fileDurationsFromJunit(xml, cwd);
    } catch {
      // Timing is best-effort; a missing report must not hide the test exit status.
    }
    const suiteTotalMs = timingEntries.reduce((sum, entry) => sum + entry.durationMs, 0);
    await reportTestTiming(timingEntries, suiteTotalMs);
    const budgetViolations = budget ? evaluateTestTimeBudget(timingEntries, budget, suiteTotalMs) : [];
    const finishSuccessfully = async () => {
      if (budgetViolations.length === 0) return 0;
      await reportTimeBudgetViolations(budgetViolations);
      return 1;
    };

    if (first.signal) {
      process.kill(process.pid, first.signal);
      return 1;
    }
    if (first.code === 0) return finishSuccessfully();
    if (!shouldRetry) return first.code;

    const failed = failedFilesFromTap(files, first.output, cwd);
    if (failed.length === 0) return first.code;

    process.stdout.write(`\nRetrying ${failed.length} failed test file(s) once to detect flakes…\n`);
    /** @type {string[]} */
    const flaky = [];
    /** @type {string[]} */
    const hard = [];
    for (const file of failed) {
      const result = await spawnTest(
        ["--test", concurrencyArg, file].filter((arg) => typeof arg === "string"),
        {
          cwd,
          env,
          capture: true,
        },
      );
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
    return finishSuccessfully();
  } finally {
    await rm(junitDir, { recursive: true, force: true });
  }
}

async function loadFileTimings() {
  try {
    return parseTestFileTimings(await readFile(resolve(ROOT, FILE_TIMINGS_PATH), "utf8"));
  } catch (error) {
    throw new Error(`cannot read ${FILE_TIMINGS_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * @param {string} absoluteFile
 * @param {import("../dist/tools/run-tests-sharding.js").TestFileTimings} timings
 */
function durationMsForFile(absoluteFile, timings) {
  const sourcePath = normalizeTestFilePath(absoluteFile, ROOT);
  return timings.durations[sourcePath] ?? DEFAULT_TEST_FILE_DURATION_MS;
}

/**
 * The test files a pull request's change list can reach, or a full-run answer when the map cannot
 * narrow safely.
 *
 * A run without `EVERGREEN_AFFECTED_FILES` always runs the whole suite: the merge queue, `main`, a
 * scheduled workflow, and a local `npm test` never narrow. Coverage also stays whole, because the
 * floors are measured on every file.
 *
 * @param {readonly string[]} allFiles absolute paths of the compiled test files this run could run
 * @param {{ root?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<{ files: string[], reason: string, full: boolean } | undefined>}
 */
export async function affectedTestFiles(allFiles, options = {}) {
  const root = options.root ?? ROOT;
  const env = options.env ?? process.env;
  const listPath = env[AFFECTED_FILES_ENV];
  if (!listPath) return undefined;
  if (coverageRequested(env)) {
    return { files: allFiles, reason: "full suite — coverage is measured on every test file", full: true };
  }
  let changed;
  try {
    changed = (await readFile(listPath, "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { files: allFiles, reason: `full suite — cannot read the change list (${message})`, full: true };
  }
  let selection;
  try {
    // Imported lazily: the map's TypeScript parser is only worth loading on the lane that narrows.
    const { selectAffectedTests } = await import("../dist/tools/run-tests-selection.js");
    selection = await selectAffectedTests(changed, { root });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { files: allFiles, reason: `full suite — the test map could not be built (${message})`, full: true };
  }
  if (selection.full) return { files: allFiles, reason: selection.reason, full: true };

  const selected = new Set(selection.tests.map((file) => toDistTestPath(file)));
  const files = allFiles.filter((file) => selected.has(relative(root, file).replaceAll("\\", "/")));
  return {
    files,
    reason: `${selection.reason}; ${files.length} of ${allFiles.length} compiled file(s) run`,
    full: false,
  };
}

/** @param {string} reason */
async function reportAffected(reason) {
  process.stdout.write(`\nAffected tests: ${reason}\n`);
  const summary = `### Affected tests\n\n${reason}\n`;
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) await appendFile(stepSummary, `\n${summary}`);
}

/**
 * @param {{ quarantineOnly: boolean, files: string[] }} options
 */
async function runSuite(options) {
  const concurrencyArg = testProcessArgs().find((arg) => arg.startsWith("--test-concurrency="));
  const quarantined = await loadQuarantine();
  const quarantinePaths = quarantineDistSet(quarantined);
  let files = options.files.length > 0 ? options.files.map((file) => resolve(ROOT, file)) : await listDistTests();

  let narrowed = false;
  if (options.files.length === 0 && !options.quarantineOnly) {
    const affected = await affectedTestFiles(files);
    if (affected) {
      await reportAffected(affected.reason);
      if (!affected.full) {
        files = affected.files;
        narrowed = true;
      }
    }
  }

  if (options.quarantineOnly) {
    files = [...quarantinePaths].sort();
    if (files.length === 0) {
      process.stdout.write("No quarantined tests to run.\n");
      return 0;
    }
    process.stdout.write(`Running ${files.length} quarantined test file(s).\n`);
    process.stdout.write(renderQuarantineList(quarantined, `Quarantined files in this run (${QUARANTINE_PATH}):`));
  } else if (isPullRequestEvent()) {
    const skipped = quarantinedEntriesInRun(files, quarantined);
    files = files.filter((file) => !quarantinePaths.has(file));
    if (skipped.length > 0) {
      process.stdout.write(
        renderQuarantineList(
          skipped,
          `Skipping ${skipped.length} quarantined test file(s) on ${process.env.GITHUB_EVENT_NAME} (see ${QUARANTINE_PATH}):`,
        ),
      );
    }
  }

  const shard = parseShardEnv(process.env);
  if (shard && files.length > 0) {
    const timings = await loadFileTimings();
    const assignment = selectShardFiles(files, (file) => durationMsForFile(file, timings), shard.index, shard.count);
    files = assignment.files;
    const balance = narrowed
      ? "affected subset, not balanced against the committed timings"
      : shardLoadsWithinTolerance(assignment.loadsMs)
        ? "within 20%"
        : "OUTSIDE 20% — update benchmarks/test-file-timings.json";
    process.stdout.write(
      `Test shard ${shard.index + 1}/${shard.count}: ${files.length} file(s), planned ${formatTestDuration(assignment.loadMs)} (${balance}; loads ${assignment.loadsMs.map(formatTestDuration).join(", ")}).\n`,
    );
  }

  if (files.length === 0) {
    process.stdout.write("No test files to run.\n");
    return 0;
  }

  const budget = await loadTimeBudget();
  // A shard only sees part of the suite; keep the per-file ceiling and drop the suite total.
  const effectiveBudget = shard ? { ...budget, totalMs: Number.MAX_SAFE_INTEGER } : budget;
  const coveragePath = coverageRequested(process.env) ? resolve(ROOT, COVERAGE_LCOV_PATH) : undefined;
  return runFilesWithRetry(files, { concurrencyArg, budget: effectiveBudget, coveragePath });
}

/**
 * @param {string[]} inputs
 * @param {string} outPath
 */
async function runMergeLcov(inputs, outPath) {
  if (inputs.length === 0) throw new Error("--merge-lcov needs at least one input path");
  const reports = await Promise.all(inputs.map((path) => readFile(resolve(ROOT, path), "utf8")));
  const merged = mergeLcovReports(reports);
  await writeFile(resolve(ROOT, outPath), merged);
  process.stdout.write(`Merged ${inputs.length} LCOV report(s) into ${outPath}\n`);
  return 0;
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
  // One Linux Node 24 shard per run is enough: the flaky marker is duplicated across shards and OS.
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
        job.conclusion === "success" && /^check \(ubuntu-latest, node 24(, shard 0)?\)$/.test(job.name ?? ""),
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
  await writeFile(join("metrics/ci", `flaky-${date}.json`), `${JSON.stringify({ date, flaky: entries }, null, 2)}\n`);
  return 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) return runSelfTest();
  if (options.listWeeklyFlaky) return runListWeeklyFlaky();
  if (options.mergeLcov.length > 0) return runMergeLcov(options.mergeLcov, options.mergeLcovOut);
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
