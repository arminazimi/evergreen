import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  publishActionBundle,
  runCheck,
  runCommand,
  runDependentSteps,
  testProcessArgs,
  type CommandRunner,
} from "../tools/check-pipeline.js";

const { scripts } = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string> };

test("npm test builds first, and npm run check builds only once", () => {
  assert.equal(scripts.test, "npm run build --silent && node tools/run-tests.mjs");
  assert.equal(scripts.check, "npm run build && node dist/tools/check-pipeline.js");
  assert.equal(scripts.check.match(/npm run build/g)?.length, 1);
  assert.match(scripts["check:plugins"]!, /^npm run build --silent && /);
  assert.match(scripts["eval:plugins"]!, /^npm run build --silent && /);
  assert.match(scripts["build:action"]!, /^ncc build src\/action\.ts -o dist\/action --minify --transpile-only$/);
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

  await until(() => events.filter((event) => event.endsWith(":start")).length === 4);
  assert.deepEqual(
    events.filter((event) => event.endsWith(":start")).sort(),
    ["build:action:start", "check:plugins:start", "eval:plugins:start", "test:start"],
  );
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
        publish: async () => {
          published = true;
        },
        run: failingRunner("test", "broken test"),
      }),
    /test: broken test/,
  );
  assert.equal(published, false);
});

test("plugin drift fails check", async () => {
  await assert.rejects(
    () =>
      runCheck({
        stagingDir: "action-staging",
        nccCli: "ncc.js",
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

function stepName(args: readonly string[]): string {
  if (args.includes("src/action.ts")) return "build:action";
  if (args[0] === "tools/run-tests.mjs") return "test";
  if (args.includes("--check")) return "check:plugins";
  if (args.some((arg) => arg.includes("plugin-host-eval.js"))) return "eval:plugins";
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
