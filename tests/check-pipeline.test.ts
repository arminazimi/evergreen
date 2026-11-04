import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { EVAL_INPUTS as AGENT_LOOP_EVAL_INPUTS } from "../benchmarks/agent-loop/index.js";
import { EVAL_INPUTS as PLUGIN_HOST_EVAL_INPUTS } from "../benchmarks/plugin-host-eval.js";
import {
  CHECK_TIMING_MARKER,
  COVERAGE_ENV,
  COVERAGE_EXCLUDES,
  COVERAGE_LCOV_PATH,
  coverageRequested,
  coverageTestArgs,
  digestInputs,
  EVAL_DIGEST_FILE,
  evalsMaySkip,
  LINT_PATTERNS,
  lintArgs,
  publishActionBundle,
  renderStepTimingSummary,
  runCheck,
  runCommand,
  runDependentSteps,
  testProcessArgs,
  type CommandRunner,
} from "../tools/check-pipeline.js";

const { scripts } = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };

test("npm test builds first, and npm run check builds only once", () => {
  assert.equal(scripts.test, "npm run build --silent && node tools/run-tests.mjs");
  assert.equal(
    scripts.check,
    "npm run format:check && npm run check:dead-code && npm run build && node dist/tools/check-pipeline.js",
  );
  assert.equal(scripts["check:dead-code"], "knip --no-progress");
  assert.equal(scripts.check.match(/npm run build/g)?.length, 1);
  assert.match(scripts["check:plugins"]!, /^npm run build --silent && /);
  assert.match(scripts["eval:plugins"]!, /^npm run build --silent && /);
  assert.match(scripts["eval:agent-loop"]!, /^npm run build --silent && /);
  assert.match(scripts["build:action"]!, /^ncc build src\/action\.ts -o dist\/action --minify --transpile-only$/);
  const lintTargets = LINT_PATTERNS.map((pattern) => `"${pattern}"`).join(" ");
  assert.equal(scripts.lint!, `eslint ${lintTargets} --max-warnings=0`);
  assert.equal(scripts["lint:baseline"]!, `eslint ${lintTargets} --max-warnings=0 --suppress-all`);
});

test("the TypeScript build uses build mode, so an unchanged tree is skipped", () => {
  // `tsc -p` re-parses and re-binds every file on each run; `tsc -b` skips the project when its outputs are newer than its inputs.
  assert.match(scripts.build!, /^tsc -b tsconfig\.json && /);
});

test("check runs the action build, tests, plugin drift, and plugin eval together", async () => {
  const events: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const stagingDir = "action-staging";
  const done = runCheck({
    stagingDir,
    nccCli: "ncc.js",
    // These tests are about which steps start; a local digest cache must not decide that for them.
    skipEvals: false,
    verifyActionBundle: true,
    publish: async (directory) => {
      events.push(`publish:${directory}`);
    },
    run: async (_command, args) => {
      const name = stepName(args);
      if (name === "build:action") {
        assert.deepEqual(args, ["ncc.js", "build", "src/action.ts", "-o", stagingDir, "--minify", "--transpile-only"]);
      }
      events.push(`${name}:start`);
      if (name !== "check:action-bundle") await gate;
      events.push(`${name}:end`);
    },
  });

  await until(() => events.filter((event) => event.endsWith(":start")).length === 8);
  assert.deepEqual(events.filter((event) => event.endsWith(":start")).sort(), [
    "build:action:start",
    "check:commands:start",
    "check:plugins:start",
    "check:quality:start",
    "eval:agent-loop:start",
    "eval:plugins:start",
    "lint:start",
    "test:start",
  ]);
  assert.equal(events.includes(`publish:${stagingDir}`), false);
  assert.equal(events.includes("check:action-bundle:start"), false);

  release();
  await done;

  const publishedAt = events.indexOf(`publish:${stagingDir}`);
  assert.ok(publishedAt > events.indexOf("build:action:end"));
  assert.ok(publishedAt > events.indexOf("test:end"));
  assert.ok(events.indexOf("check:action-bundle:start") > publishedAt);
});

test("a broken test fails check and leaves the action bundle unpublished", async () => {
  let published = false;
  await assert.rejects(
    () =>
      runCheck({
        stagingDir: "action-staging",
        nccCli: "ncc.js",
        skipEvals: false,
        verifyActionBundle: true,
        publish: async () => {
          published = true;
        },
        run: failingRunner("test", "broken test"),
      }),
    /test: broken test/,
  );
  assert.equal(published, false);
});

test("an ordinary pull request builds the action bundle but neither publishes nor diffs it", async () => {
  const steps: string[] = [];
  let published = false;
  await runCheck({
    stagingDir: "action-staging",
    nccCli: "ncc.js",
    skipEvals: false,
    verifyActionBundle: false,
    publish: async () => {
      published = true;
    },
    run: async (_command, args) => {
      steps.push(stepName(args));
    },
  });
  assert.deepEqual(steps.sort(), [
    "build:action",
    "check:commands",
    "check:plugins",
    "check:quality",
    "eval:agent-loop",
    "eval:plugins",
    "lint",
    "test",
  ]);
  assert.equal(published, false);
});

test("a lint violation fails check", async () => {
  await assert.rejects(
    () =>
      runCheck({
        stagingDir: "action-staging",
        nccCli: "ncc.js",
        skipEvals: false,
        verifyActionBundle: false,
        publish: async () => {},
        run: failingRunner("lint", "2 problems"),
      }),
    /lint: 2 problems/,
  );
});

test("lint reads the same paths as the npm script and lets no warning through", () => {
  assert.deepEqual(lintArgs("eslint.js"), ["eslint.js", ...LINT_PATTERNS, "--max-warnings=0"]);
});

test("plugin drift fails check", async () => {
  await assert.rejects(
    () =>
      runCheck({
        stagingDir: "action-staging",
        nccCli: "ncc.js",
        skipEvals: false,
        verifyActionBundle: true,
        publish: async () => {},
        run: failingRunner("check:plugins", "Plugin package drift detected"),
      }),
    /check:plugins: Plugin package drift detected/,
  );
});

test("a stale action bundle fails check after the staged bundle is published", async () => {
  let published = false;
  await assert.rejects(
    () =>
      runCheck({
        stagingDir: "action-staging",
        nccCli: "ncc.js",
        skipEvals: false,
        verifyActionBundle: true,
        publish: async () => {
          published = true;
        },
        run: failingRunner("check:action-bundle", "bundle differs"),
      }),
    /check:action-bundle: bundle differs/,
  );
  assert.equal(published, true);
});

test("a failed action build does not publish the bundle or diff it", async () => {
  let published = false;
  let diffed = false;
  await assert.rejects(
    () =>
      runCheck({
        stagingDir: "action-staging",
        nccCli: "ncc.js",
        skipEvals: false,
        verifyActionBundle: true,
        publish: async () => {
          published = true;
        },
        run: async (_command, args) => {
          const name = stepName(args);
          if (name === "check:action-bundle") diffed = true;
          if (name === "build:action") throw new Error("ncc failed");
        },
      }),
    /build:action: ncc failed/,
  );
  assert.equal(published, false);
  assert.equal(diffed, false);
});

test("CLI tests get two processes per core because their temporary directories are private", () => {
  assert.deepEqual(testProcessArgs(6), ["--test", "--test-concurrency=12", "dist/tests/**/*.test.js"]);
  assert.deepEqual(testProcessArgs(1), ["--test", "--test-concurrency=2", "dist/tests/**/*.test.js"]);
});

test("coverage mode keeps the runner, concurrency, and glob of the plain test run", () => {
  const args = coverageTestArgs(1);
  assert.equal(args[0], "--test");
  assert.equal(args[1], "--test-concurrency=2");
  assert.equal(args.at(-1), "dist/tests/**/*.test.js");
  // One suite, one file argument.
  assert.equal(args.filter((arg) => arg.endsWith(".test.js")).length, 1);
  assert.ok(args.includes("--experimental-test-coverage"));
  assert.deepEqual(
    args.filter((arg) => arg.startsWith("--test-coverage-exclude=")),
    COVERAGE_EXCLUDES.map((path) => `--test-coverage-exclude=${path}`),
  );
  // The table still reaches the log, and the report the threshold, diff, and badge steps read is written beside it.
  assert.deepEqual(
    args.filter((arg) => arg.startsWith("--test-reporter")),
    [
      "--test-reporter=spec",
      "--test-reporter=lcov",
      "--test-reporter-destination=stdout",
      `--test-reporter-destination=${COVERAGE_LCOV_PATH}`,
    ],
  );
});

test("coverage is requested only when the environment flag is 1", () => {
  assert.equal(coverageRequested({}), false);
  assert.equal(coverageRequested({ [COVERAGE_ENV]: "0" }), false);
  assert.equal(coverageRequested({ [COVERAGE_ENV]: "1" }), true);
});

test("check runs the suite once through run-tests.mjs when coverage is requested", async () => {
  const suiteCommands: string[][] = [];
  const previous = process.env[COVERAGE_ENV];
  delete process.env[COVERAGE_ENV];
  try {
    await runCheck({
      stagingDir: "action-staging",
      nccCli: "ncc.js",
      skipEvals: false,
      verifyActionBundle: false,
      collectCoverage: true,
      publish: async () => {},
      run: async (_command, args) => {
        if (args[0] === "--test" || args[0] === "tools/run-tests.mjs") suiteCommands.push([...args]);
      },
    });
  } finally {
    if (previous === undefined) delete process.env[COVERAGE_ENV];
    else process.env[COVERAGE_ENV] = previous;
  }
  // Coverage flags live inside run-tests.mjs so CI can shard and merge LCOV.
  assert.deepEqual(suiteCommands, [["tools/run-tests.mjs"]]);
});

test("check keeps the project runner when coverage is off", async () => {
  const suiteCommands: string[][] = [];
  await runCheck({
    stagingDir: "action-staging",
    nccCli: "ncc.js",
    skipEvals: false,
    verifyActionBundle: false,
    collectCoverage: false,
    publish: async () => {},
    run: async (_command, args) => {
      if (args[0] === "--test" || args[0] === "tools/run-tests.mjs") suiteCommands.push([...args]);
    },
  });
  assert.deepEqual(suiteCommands, [["tools/run-tests.mjs"]]);
});

test("an eval skips when its inputs are unchanged and runs again when they change", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-eval-digest-"));
  try {
    const input = join(root, "SKILL.md");
    await writeFile(input, "first");
    let runs = 0;
    const lines: string[] = [];
    const options = {
      stagingDir: "action-staging",
      nccCli: "ncc.js",
      verifyActionBundle: false,
      skipEvals: true,
      evalDigestFile: join(root, "dist", "eval-digests.json"),
      log: (line: string) => {
        lines.push(line);
      },
      run: async () => {},
      evals: [
        {
          id: "eval:plugins",
          inputs: [input],
          run: async () => {
            runs += 1;
          },
        },
      ],
    };
    await runCheck(options);
    assert.equal(runs, 1);

    await runCheck(options);
    assert.equal(runs, 1);
    assert.match(
      lines.join("\n"),
      /eval:plugins skipped — none of its 1 input files changed since the last passing run \([0-9a-f]{12}\)/,
    );
    // The skip only survives the next check because the digest of the passing run was stored.
    assert.equal((await readFile(options.evalDigestFile, "utf8")).includes('"eval:plugins"'), true);

    await writeFile(input, "second");
    await runCheck(options);
    assert.equal(runs, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failing eval records no digest, so the next check runs it again", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-eval-digest-"));
  try {
    const input = join(root, "SKILL.md");
    await writeFile(input, "first");
    const digestFile = join(root, "eval-digests.json");
    let runs = 0;
    const evals = [
      {
        id: "eval:agent-loop",
        inputs: [input],
        run: async () => {
          runs += 1;
          if (runs === 1) throw new Error("eval failed");
        },
      },
    ];
    await assert.rejects(
      () =>
        runCheck({
          stagingDir: "action-staging",
          nccCli: "ncc.js",
          verifyActionBundle: false,
          skipEvals: true,
          evalDigestFile: digestFile,
          log: () => {},
          run: async () => {},
          evals,
        }),
      /eval:agent-loop: eval failed/,
    );
    await assert.rejects(readFile(digestFile, "utf8"), /ENOENT/);
    await runCheck({
      stagingDir: "action-staging",
      nccCli: "ncc.js",
      verifyActionBundle: false,
      skipEvals: true,
      evalDigestFile: digestFile,
      log: () => {},
      run: async () => {},
      evals,
    });
    assert.equal(runs, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("skipping is off in a GitHub Actions run, so the merge queue always runs the evals", () => {
  assert.equal(evalsMaySkip({}), true);
  assert.equal(evalsMaySkip({ GITHUB_ACTIONS: "1" }), false);
  assert.equal(evalsMaySkip({ GITHUB_ACTIONS: "" }), true);
  // The digest lives in the build output, which a CI checkout never has.
  assert.equal(EVAL_DIGEST_FILE, join("dist", "eval-digests.json"));
});

test("an input digest covers contents, paths, and whole trees, not the order inputs are declared", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-eval-digest-"));
  try {
    const nested = join(root, "nested");
    const first = join(nested, "a.txt");
    const second = join(root, "b.txt");
    await mkdir(nested, { recursive: true });
    await writeFile(first, "one");
    await writeFile(second, "two");

    // The same tree hashes the same however the inputs are listed.
    const both = await digestInputs([first, second]);
    assert.deepEqual(await digestInputs([second, first]), both);
    assert.equal(both.files, 2);

    await writeFile(first, "uno");
    const changed = await digestInputs([first, second]);
    assert.notEqual(changed.digest, both.digest);

    // A rename is a change even when the bytes are identical.
    const single = await digestInputs([first]);
    await rename(first, join(nested, "c.txt"));
    assert.notEqual((await digestInputs([join(nested, "c.txt")])).digest, single.digest);

    // An absent path is hashed as itself, so deleting an input is a change too.
    const absent = await digestInputs([join(root, "gone")]);
    assert.equal(absent.files, 0);
    assert.notEqual(absent.digest, (await digestInputs([join(root, "gone"), first])).digest);
    assert.notEqual(absent.digest, (await digestInputs([join(root, "other")])).digest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("every declared eval input exists, so a typo cannot hide a changed file", async () => {
  for (const [id, inputs] of [
    ["eval:plugins", PLUGIN_HOST_EVAL_INPUTS],
    ["eval:agent-loop", AGENT_LOOP_EVAL_INPUTS],
  ] as const) {
    assert.ok(inputs.length > 0, id);
    for (const path of inputs) {
      assert.ok((await digestInputs([path])).files > 0, `${id} input ${path} reads no files`);
    }
  }
});

test("a self-skipped step reports its reason and lets its dependents run", async () => {
  const { failures, timings } = await runDependentSteps([
    { id: "eval:plugins", run: async () => ({ reason: "inputs unchanged" }) },
    { id: "after-it", after: ["eval:plugins"], run: async () => {} },
  ]);
  assert.equal(failures.size, 0);
  assert.deepEqual(
    timings.map((step) => [step.id, step.status]),
    [
      ["eval:plugins", "skipped"],
      ["after-it", "ok"],
    ],
  );
  assert.equal(timings[0]?.reason, "inputs unchanged");
});

test("the timing summary prints a skip reason next to the step", () => {
  const summary = renderStepTimingSummary([
    { id: "eval:plugins", durationMs: 12, status: "skipped", reason: "none of its 40 input files changed" },
    { id: "publish-action", durationMs: 0, status: "skipped" },
  ]);
  assert.match(summary, /\| `eval:plugins` \| 12ms \| skipped — none of its 40 input files changed \|/);
  assert.match(summary, /\| `publish-action` \| 0ms \| skipped \|/);
});

test("a command exits cleanly only when its status is 0", async () => {
  await runCommand(process.execPath, ["-e", "process.exit(0)"]);
  await assert.rejects(runCommand(process.execPath, ["-e", "process.exit(2)"]), /exited 2/);
});

test("publishing the action bundle replaces the previous files", async () => {
  const staging = await mkdtemp(join(tmpdir(), "evergreen-action-stage-"));
  const destination = await mkdtemp(join(tmpdir(), "evergreen-action-dest-"));
  try {
    await writeFile(join(staging, "index.js"), "fresh bundle");
    await writeFile(join(staging, "package.json"), '{"type":"module"}\n');
    await writeFile(join(destination, "index.js"), "previous bundle");
    await publishActionBundle(staging, destination);
    assert.equal(await readFile(join(destination, "index.js"), "utf8"), "fresh bundle");
    assert.equal(await readFile(join(destination, "package.json"), "utf8"), '{"type":"module"}\n');
  } finally {
    await rm(staging, { recursive: true, force: true });
    await rm(destination, { recursive: true, force: true });
  }
});

test("a step cycle fails instead of waiting forever", async () => {
  await assert.rejects(
    () =>
      runDependentSteps([
        { id: "a", after: ["b"], run: async () => {} },
        { id: "b", after: ["a"], run: async () => {} },
      ]),
    /stuck/,
  );
});

test("runDependentSteps records wall-clock timings without changing skip semantics", async () => {
  const { failures, timings } = await runDependentSteps([
    {
      id: "ok",
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
    },
    {
      id: "fail",
      run: async () => {
        throw new Error("boom");
      },
    },
    { id: "skipped", after: ["fail"], run: async () => {} },
  ]);
  assert.equal(failures.size, 1);
  assert.equal(failures.get("fail")?.message, "boom");
  assert.deepEqual(timings.map((step) => step.id).sort(), ["fail", "ok", "skipped"]);
  const ok = timings.find((step) => step.id === "ok")!;
  const failed = timings.find((step) => step.id === "fail")!;
  const skipped = timings.find((step) => step.id === "skipped")!;
  assert.equal(ok.status, "ok");
  assert.ok(ok.durationMs >= 15);
  assert.equal(failed.status, "failed");
  assert.equal(skipped.status, "skipped");
  assert.equal(skipped.durationMs, 0);
});

test("renderStepTimingSummary includes platform, node, and the marker", () => {
  const summary = renderStepTimingSummary(
    [
      { id: "test", durationMs: 45_000, status: "ok" },
      { id: "build:action", durationMs: 12_340, status: "ok" },
      { id: "publish-action", durationMs: 0, status: "skipped" },
    ],
    { platform: "darwin", nodeVersion: "v22.0.0" },
  );
  assert.match(summary, new RegExp(CHECK_TIMING_MARKER));
  assert.match(summary, /platform: `darwin` · node: `v22\.0\.0`/);
  assert.match(summary, /\| `test` \| 45\.0s \| ok \|/);
  assert.match(summary, /\| `build:action` \| 12\.3s \| ok \|/);
  assert.match(summary, /\| `publish-action` \| 0ms \| skipped \|/);
  assert.match(summary, /Sum of step wall times: \*\*57\.3s\*\*/);
});

function stepName(args: readonly string[]): string {
  if (args.includes("src/action.ts")) return "build:action";
  // The plain run goes through the project runner; the coverage run is a direct `node --test`.
  if (args[0] === "tools/run-tests.mjs" || args[0] === "--test") return "test";
  if (args.some((arg) => arg.includes("eslint"))) return "lint";
  if (args.some((arg) => arg.includes("generate-commands-index"))) return "check:commands";
  if (args.some((arg) => arg.includes("check-quality"))) return "check:quality";
  if (args.includes("--check")) return "check:plugins";
  if (args.some((arg) => arg.includes("plugin-host-eval.js"))) return "eval:plugins";
  if (args.some((arg) => arg.includes("agent-loop"))) return "eval:agent-loop";
  if (args[0] === "diff") return "check:action-bundle";
  throw new Error(`unexpected command: ${args.join(" ")}`);
}

function failingRunner(failingStep: string, message: string): CommandRunner {
  return async (_command, args) => {
    if (stepName(args) === failingStep) throw new Error(message);
  };
}

async function until(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("timed out waiting for check steps to start");
}
