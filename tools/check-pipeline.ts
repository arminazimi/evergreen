// Runs the parts of `npm run check` that do not need their own build.
//
// The TypeScript build happens once, in the npm script, before this process starts. The action
// bundle, the test suite, plugin drift, and the plugin eval then run together. The bundle is
// written to a temporary directory and copied into dist/action only after the tests finish:
// data-age.test executes dist/action/index.js, and ncc would otherwise truncate that file while
// the test is reading it. The git diff stays after the copy.
//
// The committed bundle is verified only when EVERGREEN_VERIFY_ACTION_BUNDLE=1 (release pull requests
// and the npm publish). Every other pull request still compiles the bundle, but neither publishes nor
// diffs it: each merge regenerates the same minified lines, so parallel pull requests would conflict.

import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

export type CommandRunner = (command: string, args: readonly string[]) => Promise<void>;

export interface DependentStep {
  id: string;
  after?: readonly string[];
  run: () => Promise<void>;
}

export interface RunCheckOptions {
  run?: CommandRunner;
  publish?: (stagingDir: string) => Promise<void>;
  stagingDir?: string;
  nccCli?: string;
  /** Publish the staged bundle and fail when it differs from the committed one. */
  verifyActionBundle?: boolean;
}

/**
 * Files that spawn the CLI keep fixtures in their own mkdtemp directory, so more test
 * processes do not share temporary files. Twice the CPU count cut a warm run from about
 * 55s to about 36s on a 6-core machine; Node's default is one under the CPU count.
 */
export function testProcessArgs(parallelism = availableParallelism()): string[] {
  return ["--test", `--test-concurrency=${parallelism * 2}`, "dist/tests/**/*.test.js"];
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

export async function runDependentSteps(steps: readonly DependentStep[]): Promise<ReadonlyMap<string, Error>> {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const pending = new Set(byId.keys());
  const running = new Map<string, Promise<void>>();
  const failures = new Map<string, Error>();
  const done = new Set<string>();
  const skipped = new Set<string>();
  const settled = (id: string) => done.has(id) || failures.has(id) || skipped.has(id);

  while (pending.size > 0 || running.size > 0) {
    for (const id of [...pending]) {
      const step = byId.get(id);
      if (!step) continue;
      const after = step.after ?? [];
      if (after.length > 0 && after.every(settled) && after.some((dependency) => !done.has(dependency))) {
        pending.delete(id);
        skipped.add(id);
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
      const task = Promise.resolve()
        .then(() => step.run())
        .then(
          () => {
            running.delete(step.id);
            done.add(step.id);
          },
          (error: unknown) => {
            running.delete(step.id);
            failures.set(step.id, error instanceof Error ? error : new Error(String(error)));
          },
        );
      running.set(step.id, task);
    }
  }

  return failures;
}

export async function runCheck(options: RunCheckOptions = {}): Promise<void> {
  const run = options.run ?? runCommand;
  const publish = options.publish ?? publishActionBundle;
  const nccCli = options.nccCli ?? require.resolve("@vercel/ncc/dist/ncc/cli.js");
  const stagingDir = options.stagingDir ?? (await mkdtemp(join(tmpdir(), "evergreen-action-")));
  const removeStaging = options.stagingDir === undefined;
  const verifyActionBundle = options.verifyActionBundle ?? process.env.EVERGREEN_VERIFY_ACTION_BUNDLE === "1";

  try {
    const failures = await runDependentSteps([
      {
        id: "build:action",
        run: () => run(process.execPath, [nccCli, "build", "src/action.ts", "-o", stagingDir, "--minify", "--transpile-only"]),
      },
      { id: "test", run: () => run(process.execPath, ["tools/run-tests.mjs"]) },
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
