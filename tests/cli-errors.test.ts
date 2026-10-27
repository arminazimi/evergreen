import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import {
  invalidConfig,
  isOfflineDataUpdateFailure,
  offlineDataUpdate,
  renderActionable,
  REQUIRED_NODE_MAJOR,
  unexpectedFailure,
  unreadablePath,
  unsupportedNodeVersion,
} from "../src/errors.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

async function run(args: string[], env: NodeJS.ProcessEnv = {}): Promise<Outcome> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args], {
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return error as Outcome;
  }
}

test("unsupported Node.js versions get a cause and a next step", () => {
  const message = unsupportedNodeVersion("20.19.0");
  assert.ok(message);
  assert.match(message.cause, /Unsupported Node\.js version: 20\.19\.0/);
  assert.match(message.cause, new RegExp(`Node\\.js ${REQUIRED_NODE_MAJOR}`));
  assert.match(message.nextStep, /nodejs\.org/);
  assert.equal(unsupportedNodeVersion("22.0.0"), undefined);
  assert.equal(unsupportedNodeVersion(`${REQUIRED_NODE_MAJOR}.1.0`), undefined);
});

test("the entry checks the Node version before loading any other project module", async () => {
  const source = await readFile(resolve("dist/src/cli.js"), "utf8");
  const projectImports = [...source.matchAll(/from "\.\/([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(projectImports, ["errors.js"]);
  assert.match(source, /await import\("\.\/cli-main\.js"\)/);
});

test("unreadable paths get a cause and a next step", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cli-errors-"));
  roots.push(root);
  await writeFile(join(root, "file.txt"), "x");

  const missing = await run(["scan", join(root, "missing"), "--json"]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /^Path does not exist:/m);
  assert.match(missing.stderr, /^Next: Pass an existing directory/m);
  assert.equal(JSON.parse(missing.stdout).error.message.startsWith("Path does not exist:"), true);
  assert.doesNotMatch(JSON.parse(missing.stdout).error.message, /Next:/);

  const file = await run(["scan", join(root, "file.txt")]);
  assert.equal(file.code, 2);
  assert.match(file.stderr, /^Not a directory:/m);
  assert.match(file.stderr, /^Next: Pass a repository directory/m);

  const helpers = [
    unreadablePath("/tmp/x", "missing"),
    unreadablePath("/tmp/x", "not-directory"),
    unreadablePath("/tmp/x", "unreadable"),
  ];
  for (const helper of helpers) {
    assert.ok(helper.cause.length > 0);
    assert.ok(helper.nextStep.length > 0);
    assert.match(renderActionable(helper).appendix, /^Next: /);
  }
});

test("invalid baseline config gets a cause and a next step", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cli-errors-"));
  roots.push(root);
  const baseline = join(root, "baseline.json");
  await writeFile(baseline, "{ not json");

  const broken = await run(["scan", root, "--baseline", baseline, "--json"]);
  assert.equal(broken.code, 4);
  assert.match(broken.stderr, /^Next: Fix the file so it is valid JSON/m);
  assert.doesNotMatch(JSON.parse(broken.stdout).error.message, /Next:/);

  await writeFile(baseline, JSON.stringify({ schemaVersion: "something.else" }));
  const unsupported = await run(["scan", root, "--baseline", baseline]);
  assert.equal(unsupported.code, 4);
  assert.match(unsupported.stderr, /Unsupported Evergreen baseline/);
  assert.match(unsupported.stderr, /^Next: Fix the file so it is valid JSON/m);

  const shaped = invalidConfig("Unsupported Evergreen baseline: x");
  assert.equal(shaped.cause, "Unsupported Evergreen baseline: x");
  assert.match(shaped.nextStep, /evergreen\.baseline\.v1/);
});

test("offline data update gets a cause and a next step", async () => {
  assert.equal(isOfflineDataUpdateFailure('Could not download the release list: fetch failed'), true);
  assert.equal(isOfflineDataUpdateFailure("Refusing data bundle 2026.01.01: bad signature"), false);

  const offline = await run(["data", "update"], { EVERGREEN_DATA_URL: "http://127.0.0.1:1/releases" });
  assert.equal(offline.code, 3);
  assert.match(offline.stderr, /Could not download the release list/);
  assert.match(offline.stderr, /^Next: Connect to the network and retry `evergreen data update`/m);

  const shaped = offlineDataUpdate("Could not download the release list: fetch failed");
  assert.match(shaped.cause, /Could not download/);
  assert.match(shaped.nextStep, /bundled data/);
});

test("--debug keeps the stack for unexpected failures", () => {
  const error = new Error("boom");
  error.stack = "Error: boom\n    at test";
  const quiet = unexpectedFailure(error, false);
  assert.equal(quiet.message, "Evergreen failed unexpectedly: boom");
  assert.match(quiet.appendix, /Re-run with --debug/);
  assert.doesNotMatch(quiet.appendix, /at test/);

  const verbose = unexpectedFailure(error, true);
  assert.match(verbose.appendix, /at test/);
  assert.match(verbose.appendix, /open an issue with the stack trace/);
});
