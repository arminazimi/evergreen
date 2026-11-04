// Runs the parts of `npm run check` that do not need their own build.
//
// The TypeScript build happens once, in the npm script, before this process starts. The action
// bundle, the test suite, plugin drift, and the plugin eval then run together. The bundle is
// written to a temporary directory and copied into dist/action only after the tests finish:
// data-age.test executes dist/action/index.js, and ncc would otherwise truncate that file while
// the test is reading it. The git diff stays after the copy.
//
// The suite always runs through tools/run-tests.mjs (quarantine, flaky retry, time-balanced CI
// shards, and optional coverage). CI's Linux Node 24 shards set EVERGREEN_CHECK_COVERAGE=1 so each
// shard writes a partial lcov.info; a follow-up job merges those reports before the threshold,
// per-file diff, and badge steps.
//
// The committed bundle is verified only when EVERGREEN_VERIFY_ACTION_BUNDLE=1 (release pull requests
// and the npm publish). Every other pull request still compiles the bundle, but neither publishes nor
// diffs it: each merge regenerates the same minified lines, so parallel pull requests would conflict.
//
// Each eval re-runs only when a file it reads changed. The digests live in dist, which a CI checkout
// never has, so CI and the merge queue always run both evals.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { EVAL_INPUTS as AGENT_LOOP_EVAL_INPUTS } from "../benchmarks/agent-loop/index.js";
import { EVAL_INPUTS as PLUGIN_HOST_EVAL_INPUTS } from "../benchmarks/plugin-host-eval.js";

const require = createRequire(import.meta.url);

export const CHECK_TIMING_MARKER = "<!-- evergreen-check-timing -->";

export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

/** Returned by a step that decided not to run its body; `reason` is printed as the skip line. */
export interface StepSkip {
  reason: string;
}

export interface DependentStep {
  id: string;
  after?: readonly string[];
  run: () => Promise<void | StepSkip>;
}

export type StepTimingStatus = "ok" | "failed" | "skipped";

export interface StepTiming {
  id: string;
  durationMs: number;
  status: StepTimingStatus;
  /** Why a step that ran its own decision skipped its body. */
  reason?: string;
}

export interface DependentStepsResult {
  failures: ReadonlyMap<string, Error>;
  timings: readonly StepTiming[];
}

/** An eval and the files and directories it reads; the eval itself declares them in `EVAL_INPUTS`. */
export interface EvalStep {
  id: string;
  inputs: readonly string[];
  run: () => Promise<void>;
}

export interface RunCheckOptions {
  run?: CommandRunner;
  publish?: (stagingDir: string) => Promise<void>;
  stagingDir?: string;
  nccCli?: string;
  /** Publish the staged bundle and fail when it differs from the committed one. */
  verifyActionBundle?: boolean;
  /** Ask the test runner to collect coverage. Defaults to EVERGREEN_CHECK_COVERAGE=1. */
  collectCoverage?: boolean;
  /** The evals that may be skipped. Defaults to the plugin and agent-loop evals. */
  evals?: readonly EvalStep[];
  /** Where the last run digest of each eval is stored. Defaults to EVAL_DIGEST_FILE. */
  evalDigestFile?: string;
  /** Skip an eval whose inputs are unchanged. Defaults to evalsMaySkip(). */
  skipEvals?: boolean;
  /** Where the skip is reported. Defaults to stdout. */
  log?: (line: string) => void;
  /** The ESLint CLI entry point. Defaults to the copy installed in node_modules. */
  eslintCli?: string;
}

/** Set to `1` to collect coverage while running the suite; CI sets it on Linux Node 24 shards. */
export const COVERAGE_ENV = "EVERGREEN_CHECK_COVERAGE";

/** The report each coverage shard writes; CI merges shard copies into this path before gates. */
export const COVERAGE_LCOV_PATH = "lcov.info";

/** Same exclusions as the `test:coverage` script in package.json, so both runs measure the same files. */
export const COVERAGE_EXCLUDES: readonly string[] = [
  "dist/tests/**",
  "dist/benchmarks/**",
  "dist/action/**",
  "dist/src/usage/vendor/**",
];

/** Whether this process should collect coverage, from the environment or an explicit option. */
export function coverageRequested(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[COVERAGE_ENV] === "1";
}

/**
 * Last-run digests of the evals, kept in the build output: gitignored, and absent from a fresh CI
 * checkout, which is what makes every CI and merge-queue run start with nothing to match.
 */
export const EVAL_DIGEST_FILE = join("dist", "eval-digests.json");

/**
 * Skipping is a local convenience only. Every GitHub Actions run - pull request, push to main, and
 * merge queue alike - runs both evals, whatever its dist happens to hold.
 */
export function evalsMaySkip(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GITHUB_ACTIONS !== "1";
}

/** Sorted list of the files under a path; a missing path contributes nothing. */
async function inputFiles(path: string): Promise<string[]> {
  const info = await stat(path).catch(() => undefined);
  if (!info) return [];
  if (info.isFile()) return [path];
  const listed = await readdir(path, { recursive: true });
  const files = await Promise.all(
    listed.map(async (entry) => {
      const full = join(path, entry);
      return (await stat(full).then(
        (s) => s.isFile(),
        () => false,
      ))
        ? full
        : undefined;
    }),
  );
  return files.filter((file): file is string => file !== undefined).sort((a, b) => a.localeCompare(b));
}

export interface InputDigest {
  digest: string;
  files: number;
}

/**
 * A hash of the paths and contents of everything an eval reads. Sorting makes it independent of the
 * order the inputs are declared in, and an absent path is hashed too so deleting a whole input
 * changes the digest.
 */
export async function digestInputs(paths: readonly string[]): Promise<InputDigest> {
  const hash = createHash("sha256");
  let files = 0;
  for (const path of [...paths].sort((a, b) => a.localeCompare(b))) {
    const listed = await inputFiles(path);
    hash.update(`path\0${path}\0${listed.length}\n`);
    for (const file of listed) {
      hash.update(`file\0${file}\0`);
      hash.update(await readFile(file));
      hash.update("\n");
      files += 1;
    }
  }
  return { digest: hash.digest("hex"), files };
}

async function readDigests(file: string): Promise<Record<string, string>> {
  const contents: unknown = await readFile(file, "utf8").catch(() => undefined);
  if (typeof contents !== "string") return {};
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const records: Record<string, string> = {};
  for (const [id, digest] of Object.entries(parsed)) if (typeof digest === "string") records[id] = digest;
  return records;
}

async function writeDigests(file: string, digests: Readonly<Record<string, string>>): Promise<void> {
  const ordered: Record<string, string> = {};
  for (const id of Object.keys(digests).sort((a, b) => a.localeCompare(b))) {
    const digest = digests[id];
    if (digest !== undefined) ordered[id] = digest;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(ordered, null, 2)}\n`);
}

/**
 * Runs an eval, or skips it when its inputs hash to the digest of the last run that passed. The
 * digest is only recorded after a successful run, so a failing or interrupted eval runs again.
 */
export async function runEvalWhenInputsChanged(
  evalStep: EvalStep,
  digests: Readonly<Record<string, string>>,
  recorded: Record<string, string>,
  log: (line: string) => void,
): Promise<void | StepSkip> {
  const current = await digestInputs(evalStep.inputs);
  const previous = digests[evalStep.id];
  if (previous === current.digest) {
    const reason = `none of its ${current.files} input files changed since the last passing run (${current.digest.slice(0, 12)})`;
    log(`${evalStep.id} skipped — ${reason}`);
    return { reason };
  }
  await evalStep.run();
  recorded[evalStep.id] = current.digest;
}

/** The TypeScript the lint step reads; every file is also in the tsconfig program. */
export const LINT_PATTERNS: readonly string[] = ["src/**/*.ts", "tools/**/*.ts"];

/** One lint run. A warning fails like an error, so nothing new can land without a suppression. */
export function lintArgs(eslintCli: string): string[] {
  return [eslintCli, ...LINT_PATTERNS, "--max-warnings=0"];
}

/** The compiled tests both test commands run. */
export const TEST_FILE_GLOB = "dist/tests/**/*.test.js";

/**
 * Files that spawn the CLI keep fixtures in their own mkdtemp directory, so more test
 * processes do not share temporary files. Twice the CPU count cut a warm run from about
 * 55s to about 36s on a 6-core machine; Node's default is one under the CPU count.
 */
export function testProcessArgs(parallelism = availableParallelism()): string[] {
  return ["--test", `--test-concurrency=${parallelism * 2}`, TEST_FILE_GLOB];
}

/**
 * The single suite run that also collects coverage. It keeps the runner, the concurrency, and the
 * file glob of `testProcessArgs`, and adds the coverage flags before the glob because the test
 * runner reads every later argument as a file. It writes the same table to stdout and the same
 * lcov.info that `npm run test:coverage` writes, so the existing coverage steps consume it unchanged.
 */
export function coverageTestArgs(parallelism = availableParallelism()): string[] {
  const args = testProcessArgs(parallelism);
  const files = args.at(-1) ?? TEST_FILE_GLOB;
  return [
    ...args.slice(0, -1),
    "--experimental-test-coverage",
    ...COVERAGE_EXCLUDES.map((path) => `--test-coverage-exclude=${path}`),
    "--test-reporter=spec",
    "--test-reporter=lcov",
    "--test-reporter-destination=stdout",
    `--test-reporter-destination=${COVERAGE_LCOV_PATH}`,
    files,
  ];
}

export function runCommand(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, [...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited ${signal ?? code}`));
    });
  });
}

export async function publishActionBundle(stagingDir: string, destination = join("dist", "action")): Promise<void> {
  await mkdir(destination, { recursive: true });
  const bundle = join(destination, "index.js");
  await copyFile(join(stagingDir, "index.js"), bundle);
  await chmod(bundle, 0o755);
  await copyFile(join(stagingDir, "package.json"), join(destination, "package.json"));
}

/**
 * @param {number} durationMs
 */
export function formatStepDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}m ${rest.toFixed(1)}s`;
}

export function renderStepTimingSummary(
  steps: readonly StepTiming[],
  options: { platform?: string; nodeVersion?: string } = {},
): string {
  const platform = options.platform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.version;
  const lines = [
    "### Check step timing",
    CHECK_TIMING_MARKER,
    "",
    `platform: \`${platform}\` · node: \`${nodeVersion}\``,
    "",
  ];
  if (steps.length === 0) {
    lines.push("_No check steps timed._", "");
    return lines.join("\n");
  }
  const ordered = [...steps].sort((a, b) => b.durationMs - a.durationMs || a.id.localeCompare(b.id));
  lines.push("| Step | Duration | Status |");
  lines.push("| --- | ---: | --- |");
  for (const step of ordered) {
    const status = step.reason === undefined ? step.status : `skipped — ${step.reason}`;
    lines.push(`| \`${step.id}\` | ${formatStepDuration(step.durationMs)} | ${status} |`);
  }
  const sumMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  lines.push("");
  lines.push(`Sum of step wall times: **${formatStepDuration(sumMs)}** (steps may overlap when run in parallel)`);
  lines.push("");
  return lines.join("\n");
}

async function reportStepTiming(steps: readonly StepTiming[]): Promise<void> {
  const summary = renderStepTimingSummary(steps);
  process.stdout.write(`\n${summary}`);
  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) await appendFile(stepSummary, `\n${summary}`);
}

export async function runDependentSteps(steps: readonly DependentStep[]): Promise<DependentStepsResult> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const pending = new Set(byId.keys());
  const running = new Map<string, Promise<void>>();
  const failures = new Map<string, Error>();
  const done = new Set<string>();
  const skipped = new Set<string>();
  /** @type {StepTiming[]} */
  const timings: StepTiming[] = [];
  const settled = (id: string) => done.has(id) || failures.has(id) || skipped.has(id);

  while (pending.size > 0 || running.size > 0) {
    for (const id of [...pending]) {
      const step = byId.get(id);
      if (!step) continue;
      const after = step.after ?? [];
      if (after.length > 0 && after.every(settled) && after.some((dependency) => !done.has(dependency))) {
        pending.delete(id);
        skipped.add(id);
        timings.push({ id, durationMs: 0, status: "skipped" });
      }
    }

    const ready: DependentStep[] = [];
    for (const id of pending) {
      const step = byId.get(id);
      if (!step) continue;
      if ((step.after ?? []).every((dependency) => done.has(dependency))) ready.push(step);
    }

    if (ready.length === 0) {
      if (running.size === 0) {
        if (pending.size === 0) break;
        throw new Error(`check steps are stuck: ${[...pending].join(", ")}`);
      }
      await Promise.race(running.values());
      continue;
    }

    for (const step of ready) {
      pending.delete(step.id);
      const started = performance.now();
      const task = Promise.resolve()
        .then(() => step.run())
        .then(
          (result: void | StepSkip) => {
            running.delete(step.id);
            done.add(step.id);
            timings.push({
              id: step.id,
              durationMs: Math.round(performance.now() - started),
              status: result === undefined ? "ok" : "skipped",
              ...(result === undefined ? {} : { reason: result.reason }),
            });
          },
          (error: unknown) => {
            running.delete(step.id);
            failures.set(step.id, error instanceof Error ? error : new Error(String(error)));
            timings.push({
              id: step.id,
              durationMs: Math.round(performance.now() - started),
              status: "failed",
            });
          },
        );
      running.set(step.id, task);
    }
  }

  return { failures, timings };
}

export async function runCheck(options: RunCheckOptions = {}): Promise<void> {
  const run = options.run ?? runCommand;
  const publish = options.publish ?? publishActionBundle;
  const nccCli = options.nccCli ?? require.resolve("@vercel/ncc/dist/ncc/cli.js");
  const eslintCli = options.eslintCli ?? join(dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
  const stagingDir = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "evergreen-action-")));
  const removeStaging = options.stagingDir === undefined;
  const verifyActionBundle = options.verifyActionBundle ?? process.env.EVERGREEN_VERIFY_ACTION_BUNDLE === "1";
  const collectCoverage = options.collectCoverage ?? coverageRequested();
  const skipEvals = options.skipEvals ?? evalsMaySkip();
  const evalDigestFile = options.evalDigestFile ?? EVAL_DIGEST_FILE;
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const evals: readonly EvalStep[] = options.evals ?? [
    {
      id: "eval:plugins",
      inputs: PLUGIN_HOST_EVAL_INPUTS,
      run: () => run(process.execPath, ["dist/benchmarks/plugin-host-eval.js"]),
    },
    {
      id: "eval:agent-loop",
      inputs: AGENT_LOOP_EVAL_INPUTS,
      run: () => run(process.execPath, ["dist/benchmarks/agent-loop/index.js"]),
    },
  ];
  const digests = skipEvals ? await readDigests(evalDigestFile) : {};
  const recorded: Record<string, string> = {};

  try {
    const { failures, timings } = await runDependentSteps([
      {
        id: "check:commands",
        run: () => run(process.execPath, ["tools/generate-commands-index.mjs", "--check"]),
      },
      {
        id: "build:action",
        run: () =>
          run(process.execPath, [nccCli, "build", "src/action.ts", "-o", stagingDir, "--minify", "--transpile-only"]),
      },
      {
        id: "test",
        // Coverage stays in run-tests.mjs so CI can shard by measured time and merge LCOV after.
        run: async () => {
          const previous = process.env[COVERAGE_ENV];
          if (collectCoverage) process.env[COVERAGE_ENV] = "1";
          try {
            await run(process.execPath, ["tools/run-tests.mjs"]);
          } finally {
            if (collectCoverage) {
              if (previous === undefined) delete process.env[COVERAGE_ENV];
              else process.env[COVERAGE_ENV] = previous;
            }
          }
        },
      },
      { id: "lint", run: () => run(process.execPath, lintArgs(eslintCli)) },
      { id: "check:quality", run: () => run(process.execPath, ["dist/tools/check-quality.js"]) },
      { id: "check:plugins", run: () => run(process.execPath, ["dist/tools/plugin-packages.js", "--check"]) },
      ...evals.map((evalStep) => ({
        id: evalStep.id,
        run: () => (skipEvals ? runEvalWhenInputsChanged(evalStep, digests, recorded, log) : evalStep.run()),
      })),
      ...(verifyActionBundle
        ? [
            { id: "publish-action", after: ["build:action", "test"], run: () => publish(stagingDir) },
            {
              id: "check:action-bundle",
              after: ["publish-action"],
              run: () => run("git", ["diff", "--exit-code", "--", "dist/action/index.js"]),
            },
          ]
        : []),
    ]);
    if (Object.keys(recorded).length > 0) await writeDigests(evalDigestFile, { ...digests, ...recorded });
    await reportStepTiming(timings);
    if (failures.size > 0) {
      throw new Error([...failures].map(([id, error]) => `${id}: ${error.message}`).join("\n"));
    }
  } finally {
    if (removeStaging) await rm(stagingDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runCheck();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
