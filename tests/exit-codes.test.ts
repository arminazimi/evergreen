import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

interface Outcome {
  code: number;
  stdout: string;
  stderr: string;
}

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function run(args: string[]): Promise<Outcome> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as Outcome;
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

async function emptyRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-exit-codes-"));
  roots.push(root);
  return root;
}

function errorDocument(outcome: Outcome): { schemaVersion: string; error: { code: string; exitCode: number; message: string } } {
  return JSON.parse(outcome.stdout) as ReturnType<typeof errorDocument>;
}

test("success exits 0 and writes no error document", async () => {
  const result = await run(["check", "pkg:npm/express", "--json"]);
  assert.equal(result.code, 0);
  assert.equal((JSON.parse(result.stdout) as { schemaVersion: string }).schemaVersion, "evergreen.check.v1");
});

test("usage failures exit 2 with the code usage", async () => {
  const unknown = await run(["frobnicate", "--json"]);
  assert.equal(unknown.code, 2);
  assert.deepEqual(errorDocument(unknown).error.code, "usage");
  assert.equal(errorDocument(unknown).error.exitCode, 2);
  assert.equal(errorDocument(unknown).schemaVersion, "evergreen.error.v1");
  assert.match(unknown.stderr, /Unknown command: frobnicate/);
  assert.doesNotMatch(errorDocument(unknown).error.message, /Usage:/, "the JSON message is the reason, not the help text");

  const format = await run(["scan", ".", "--format", "yaml"]);
  assert.equal(format.code, 2);
  assert.equal(format.stdout, "", "text mode writes no JSON on stdout");

  const missingPurl = await run(["check", "--json"]);
  assert.equal(missingPurl.code, 2);
  assert.equal(errorDocument(missingPurl).error.code, "usage");

  const malformedPin = await run(["check", "pkg:npm/request", "--data-version", "latest", "--json"]);
  assert.equal(malformedPin.code, 2);
  assert.equal(errorDocument(malformedPin).error.code, "usage");
});

test("data failures exit 3 with the code data", async () => {
  const root = await emptyRepository();
  const missing = await run(["explain", "no-such-finding", root, "--json"]);
  assert.equal(missing.code, 3);
  assert.equal(errorDocument(missing).error.code, "data");
  assert.match(errorDocument(missing).error.message, /Finding not found: no-such-finding/);
  assert.match(missing.stderr, /Finding not found/);

  const context = await run(["context", "no-such-finding", root, "--json"]);
  assert.equal(context.code, 3);
  assert.equal(errorDocument(context).error.code, "data");

  const pin = await run(["check", "pkg:npm/request", "--data-version", "2999.01.01", "--json"]);
  assert.equal(pin.code, 3);
  assert.equal(errorDocument(pin).error.code, "data");
});

test("parse failures exit 4 with the code parse", async () => {
  const invalid = await run(["check", "request", "--json"]);
  assert.equal(invalid.code, 4);
  assert.equal(errorDocument(invalid).error.code, "parse");
  assert.equal(errorDocument(invalid).error.exitCode, 4);

  const root = await emptyRepository();
  const baseline = join(root, "baseline.json");
  await writeFile(baseline, "{ not json");
  const unreadable = await run(["scan", root, "--baseline", baseline, "--json"]);
  assert.equal(unreadable.code, 4);
  assert.equal(errorDocument(unreadable).error.code, "parse");

  await writeFile(baseline, JSON.stringify({ schemaVersion: "something.else" }));
  const unsupported = await run(["scan", root, "--baseline", baseline]);
  assert.equal(unsupported.code, 4);
  assert.equal(unsupported.stdout, "");
  assert.match(unsupported.stderr, /Unsupported Evergreen baseline/);
});

test("policy failures exit 1 and keep stdout a single result document", async () => {
  const result = await run(["check", "pkg:npm/request@2.88.2", "--json"]);
  assert.equal(result.code, 1);
  const document = JSON.parse(result.stdout) as { schemaVersion: string; status: string };
  assert.equal(document.schemaVersion, "evergreen.check.v1");
  assert.equal(document.status, "affected");
});
