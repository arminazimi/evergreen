import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const fixtures = resolve("tests/fixtures/drift/nodejs");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Pin {
  path: string;
  line: number;
  source: string;
  raw: string;
  kind: "pin" | "floor";
  group?: string;
  release?: string;
  unresolved?: string;
}

interface Runtime {
  runtime: string;
  pins: Pin[];
  releases: string[];
  drifted: boolean;
  floorConflicts: Pin[];
}

interface Report {
  schemaVersion: string;
  runtimes: Runtime[];
}

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

async function report(fixture: string): Promise<Runtime> {
  const result = await run("drift", resolve(fixtures, fixture), "--runtime", "nodejs", "--json");
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as Report;
  assert.equal(parsed.schemaVersion, "evergreen.drift.v1");
  const [runtime] = parsed.runtimes;
  assert.ok(runtime);
  assert.equal(runtime.runtime, "nodejs");
  return runtime;
}

function find(runtime: Runtime, path: string, source: string): Pin | undefined {
  return runtime.pins.find((pin) => pin.path === path && pin.source === source);
}

test("every Node.js source is collected with its exact location and release", async () => {
  const runtime = await report("drifted");
  assert.equal(runtime.drifted, true);
  assert.deepEqual(runtime.releases, ["18", "22"]);
  assert.deepEqual(
    [...new Set(runtime.pins.map((pin) => pin.source))].sort(),
    [
      ".node-version",
      ".nvmrc",
      ".tool-versions",
      "Azure Pipelines container",
      "CircleCI image",
      "Dockerfile FROM",
      "Dockerfile.prod FROM",
      "GitLab CI image",
      "actions/setup-node node-version",
      "devcontainer.json image",
      "devcontainer.json node feature",
      "package.json engines.node",
      "package.json volta.node",
      "setup-node matrix",
    ].sort(),
  );

  const expected: Array<[string, string, string, number]> = [
    [".nvmrc", ".nvmrc", "18", 1],
    [".node-version", ".node-version", "18", 1],
    [".tool-versions", ".tool-versions", "18", 1],
    ["package.json", "package.json volta.node", "18", 8],
    ["Dockerfile.prod", "Dockerfile.prod FROM", "18", 1],
    [".devcontainer/devcontainer.json", "devcontainer.json image", "18", 3],
    [".devcontainer/devcontainer.json", "devcontainer.json node feature", "18", 6],
    [".github/workflows/ci.yml", "actions/setup-node node-version", "18", 17],
    [".gitlab-ci.yml", "GitLab CI image", "18", 1],
    [".circleci/config.yml", "CircleCI image", "18", 5],
    ["azure-pipelines.yml", "Azure Pipelines container", "18", 5],
  ];
  for (const [path, source, release, line] of expected) {
    const pin = find(runtime, path, source);
    assert.ok(pin, `${path} ${source}`);
    assert.deepEqual([pin.release, pin.line], [release, line], `${path} ${source}`);
  }

  const floor = find(runtime, "package.json", "package.json engines.node");
  assert.deepEqual([floor?.kind, floor?.release, floor?.line], ["floor", "18", 5]);

  const azure = runtime.pins.filter((pin) => pin.source === "Azure Pipelines container");
  assert.deepEqual(azure.map((pin) => [pin.line, pin.release]), [[5, "18"], [13, "18"]]);
});

test("a Dockerfile stage out of line is a pin and drifts", async () => {
  const runtime = await report("drifted");
  const stages = runtime.pins.filter((pin) => pin.source === "Dockerfile FROM");
  assert.deepEqual(stages.map((pin) => [pin.line, pin.raw, pin.release]), [[1, "18-alpine", "18"], [4, "22-alpine", "22"]]);
  assert.equal(runtime.pins.filter((pin) => pin.path === "Dockerfile" && pin.release === "22").length, 1);
});

test("lts/hydrogen resolves through the release schedule and lts/* does not", async () => {
  const drifted = await report("drifted");
  const hydrogen = find(drifted, ".nvmrc", ".nvmrc");
  assert.deepEqual([hydrogen?.raw, hydrogen?.release], ["lts/hydrogen", "18"]);

  const unresolved = await report("unresolved");
  const wildcard = find(unresolved, ".nvmrc", ".nvmrc");
  assert.equal(wildcard?.release, undefined);
  assert.match(wildcard?.unresolved ?? "", /LTS/);
  assert.equal(unresolved.releases.length, 0);
  for (const pin of unresolved.pins) {
    assert.equal(pin.release, undefined, pin.raw);
    assert.ok((pin.unresolved ?? "").length > 0, pin.raw);
  }
  assert.match(find(unresolved, "Dockerfile.unknown", "Dockerfile.unknown FROM")?.unresolved ?? "", /codename/);
  assert.match(find(unresolved, ".node-version", ".node-version")?.unresolved ?? "", /floating/);
  assert.match(find(unresolved, ".devcontainer/optional/devcontainer.json", "devcontainer.json image")?.unresolved ?? "", /no tag/);
  assert.match(find(unresolved, ".devcontainer/optional/devcontainer.json", "devcontainer.json node feature")?.unresolved ?? "", /installs no Node/);
  const bare = unresolved.pins.find((pin) => pin.source === ".tool-versions" && pin.raw === "nodejs");
  assert.match(bare?.unresolved ?? "", /no version/);
});

test("a matrix is intentional: its entries are one group and do not drift against each other", async () => {
  const runtime = await report("consistent");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["18", "20"]);
  assert.deepEqual(runtime.floorConflicts, []);
  const matrix = runtime.pins.filter((pin) => pin.source === "setup-node matrix");
  assert.deepEqual(matrix.map((pin) => pin.raw), ["18", "20"]);
  assert.ok(matrix.every((pin) => pin.line === 8));
  assert.ok(matrix.every((pin) => pin.group === "setup-node matrix"));
});

test("engines.node above the pinned release is a floor conflict", async () => {
  const runtime = await report("floor-conflict");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["18"]);
  assert.deepEqual(runtime.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]), [["package.json", 5, ">=20", "20"]]);
  const check = await run("drift", resolve(fixtures, "floor-conflict"), "--runtime", "nodejs", "--check");
  assert.equal(check.code, 1);
  assert.match(check.stdout, /floor conflict/);
});

test("drift --check exits 1 when Node.js drifts", async () => {
  const check = await run("drift", resolve(fixtures, "drifted"), "--runtime", "nodejs", "--check");
  assert.equal(check.code, 1);
  assert.match(check.stdout, /DRIFT/);
});

test("drift --json with the Node.js collector validates against the drift schema", async () => {
  const result = await run("drift", resolve(fixtures, "drifted"), "--runtime", "nodejs", "--json");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object,
  );
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("align patches every understood source, applies cleanly, and removes the drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-nodejs-align-"));
  temporaryRoots.push(root);
  await cp(resolve(fixtures, "align"), root, { recursive: true });
  await execute("git", ["init", "-q"], { cwd: root });

  const aligned = await run("drift", root, "--runtime", "nodejs", "--align", "20");
  assert.equal(aligned.code, 0, aligned.stderr);
  for (const file of [".nvmrc", ".node-version", ".tool-versions", "package.json", "Dockerfile", ".github/workflows/ci.yml"]) {
    assert.ok(aligned.stdout.includes(`+++ b/${file}`), file);
  }
  assert.match(aligned.stderr, /Refused \.github\/workflows\/ci\.yml:8 \(setup-node matrix 18\)/);
  assert.match(aligned.stderr, /Refused package\.json:5 \(package\.json engines\.node >=18\)/);

  const patch = join(root, "align.patch");
  await writeFile(patch, aligned.stdout);
  await execute("git", ["apply", "--check", "align.patch"], { cwd: root });
  await execute("git", ["apply", "align.patch"], { cwd: root });

  assert.equal((await readFile(join(root, ".nvmrc"), "utf8")).trim(), "20");
  assert.equal((await readFile(join(root, ".node-version"), "utf8")).trim(), "v20");
  assert.match(await readFile(join(root, ".tool-versions"), "utf8"), /^nodejs 20$/m);
  assert.match(await readFile(join(root, "package.json"), "utf8"), /"node": "20"/);
  assert.match(await readFile(join(root, "Dockerfile"), "utf8"), /^FROM node:20-alpine AS build$/m);
  assert.match(await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"), /^\s+node-version: 20$/m);

  const check = await run("drift", root, "--runtime", "nodejs", "--check", "--json");
  assert.equal(check.code, 0, check.stderr);
  assert.deepEqual((JSON.parse(check.stdout) as Report).runtimes[0]!.releases, ["18", "20"]);
});

test("align never writes a file", async () => {
  const before = await readFile(resolve(fixtures, "align", ".nvmrc"), "utf8");
  await run("drift", resolve(fixtures, "align"), "--runtime", "nodejs", "--align", "20");
  assert.equal(await readFile(resolve(fixtures, "align", ".nvmrc"), "utf8"), before);
});

test("no drift source imports a process, network, or fetch API", async () => {
  for (const name of await readdir(resolve("src/drift"))) {
    if (!name.endsWith(".ts")) continue;
    const contents = await readFile(resolve("src/drift", name), "utf8");
    assert.doesNotMatch(contents, /node:(?:child_process|http|https|net)\b|\bfetch\s*\(/, name);
  }
});
