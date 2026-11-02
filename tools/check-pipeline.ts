// Runs the parts of `npm run check` that do not need their own build.
//
// The TypeScript build happens once, in the npm script, before this process starts. The action
// bundle, the test suite, plugin drift, and the plugin eval then run together. The bundle is
// written to a temporary directory and copied into dist/action only after the tests finish:
// data-age.test executes dist/action/index.js, and ncc would otherwise truncate that file while
// the test is reading it. The git diff stays after the copy.
//
// The suite runs through tools/run-tests.mjs, which applies the quarantine list and retries a failed
// file once. CI's Linux Node 24 job sets EVERGREEN_CHECK_COVERAGE=1: that job runs the same single
// `node --test` pass with coverage enabled and leaves lcov.info behind, so the threshold, per-file
// diff, and badge steps read one run instead of repeating the suite. Every other run keeps the
// project runner.
//
// The committed bundle is verified only when EVERGREEN_VERIFY_ACTION_BUNDLE=1 (release pull requests
// and the npm publish). Every other pull request still compiles the bundle, but neither publishes nor
// diffs it: each merge regenerates the same minified lines, so parallel pull requests would conflict.

import { spawn } from "node:child_process";
import { appendFile, chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export const CHECK_TIMING_MARKER = "<!-- evergreen-check-timing -->";

export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

export interface DependentStep {
  id: string;
  after?: readonly string[];
  run: () => Promise<void>;
}

export type StepTimingStatus = "ok" | "failed" | "skipped";

export interface StepTiming {
  id: string;
  durationMs: number;
  status: StepTimingStatus;
}

export interface DependentStepsResult {
  failures: ReadonlyMap<string, Error>;
  timings: readonly StepTiming[];
}

export interface RunCheckOptions {
  run?: CommandRunner;
  publish?: (stagingDir: string) => Promise<void>;
  stagingDir?: string;
  nccCli?: string;
  /** Publish the staged bundle and fail when it differs from the committed one. */
  verifyActionBundle?: boolean;
  /** Run the suite with coverage instead of tools/run-tests.mjs. Defaults to EVERGREEN_CHECK_COVERAGE=1. */
  collectCoverage?: boolean;
}

/** Set to `1` to collect coverage from the single suite run; CI sets it on the Linux Node 24 job. */
export const COVERAGE_ENV = "EVERGREEN_CHECK_COVERAGE";

/** The report the threshold, per-file diff, and badge steps read after that run. */
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
    lines.push(`| \`${step.id}\` | ${formatStepDuration(step.durationMs)} | ${step.status} |`);
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
          () => {
            running.delete(step.id);
            done.add(step.id);
            timings.push({
              id: step.id,
              durationMs: Math.round(performance.now() - started),
              status: "ok",
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
  const stagingDir = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "evergreen-action-")));
  const removeStaging = options.stagingDir === undefined;
  const verifyActionBundle = options.verifyActionBundle ?? process.env.EVERGREEN_VERIFY_ACTION_BUNDLE === "1";
  const collectCoverage = options.collectCoverage ?? coverageRequested();

  try {
    const { failures, timings } = await runDependentSteps([
      {
        id: "check:commands",
        run: () => run(process.execPath, ["tools/generate-commands-index.mjs", "--check"]),
      },
      {
        id: "build:action",
        run: () => run(process.execPath, [nccCli, "build", "src/action.ts", "-o", stagingDir, "--minify", "--transpile-only"]),
      },
      {
        id: "test",
        run: () =>
          run(process.execPath, collectCoverage ? coverageTestArgs() : ["tools/run-tests.mjs"]),
      },
      { id: "check:plugins", run: () => run(process.execPath, ["dist/tools/plugin-packages.js", "--check"]) },
      { id: "eval:plugins", run: () => run(process.execPath, ["dist/benchmarks/plugin-host-eval.js"]) },
      { id: "eval:agent-loop", run: () => run(process.execPath, ["dist/benchmarks/agent-loop/index.js"]) },
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
