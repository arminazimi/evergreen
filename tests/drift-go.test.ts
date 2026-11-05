import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { goDriftCollector } from "../src/drift/go.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

const execute = promisify(execFile);

let fixtures: string;
const temporaryRoots: string[] = [];

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/drift/go"), temporaryRoots);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Pin {
  path: string;
  line: number;
  source: string;
  raw: string;
  kind: "pin" | "floor";
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
  return runCli(args);
}

async function report(fixture: string): Promise<Runtime> {
  const result = await run("drift", resolve(fixtures, fixture), "--json");
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as Report;
  assert.equal(parsed.schemaVersion, "evergreen.drift.v1");
  const [runtime] = parsed.runtimes;
  assert.ok(runtime);
  assert.equal(runtime.runtime, "go");
  return runtime;
}

function find(runtime: Runtime, path: string, source: string): Pin | undefined {
  return runtime.pins.find((pin) => pin.path === path && pin.source === source);
}

test("every Go source is collected, and the report is a drift", async () => {
  const runtime = await report("drifted");
  assert.equal(runtime.drifted, true);
  assert.deepEqual(runtime.releases, ["1.22", "1.23"]);

  const expected: Array<[string, string, string]> = [
    ["go.mod", "go.mod toolchain", "1.22"],
    ["go.mod", "go.mod go", "1.21"],
    ["go.work", "go.work toolchain", "1.23"],
    ["go.work", "go.work go", "1.22"],
    [".go-version", ".go-version", "1.22"],
    [".tool-versions", ".tool-versions", "1.22"],
    ["Dockerfile", "Dockerfile FROM", "1.22"],
    [".github/workflows/ci.yml", "actions/setup-go go-version", "1.22"],
    [".gitlab-ci.yml", "GitLab CI image", "1.22"],
    [".circleci/config.yml", "CircleCI image", "1.22"],
    ["azure-pipelines.yml", "Azure Pipelines container", "1.22"],
  ];
  for (const [path, source, release] of expected) {
    const pin = find(runtime, path, source);
    assert.ok(pin, `${path} ${source}`);
    assert.equal(pin.release, release, `${path} ${source}`);
  }

  const pointer = find(runtime, ".github/workflows/ci.yml", "actions/setup-go go-version-file");
  assert.equal(pointer?.release, undefined);
  assert.match(pointer?.unresolved ?? "", /go\.mod/);
});

test("the go directive is a floor and is not counted as a pin", async () => {
  const runtime = await report("drifted");
  const floor = find(runtime, "go.mod", "go.mod go");
  assert.equal(floor?.kind, "floor");
  assert.equal(floor?.line, 3);
});

test("a consistent repository has one release, matrix values included, and no conflicts", async () => {
  const runtime = await report("consistent");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["1.22"]);
  assert.deepEqual(runtime.floorConflicts, []);
  const matrix = runtime.pins.filter((pin) => pin.source === "actions/setup-go matrix");
  assert.deepEqual(
    matrix.map((pin) => pin.raw),
    ["1.22.5", "1.22.6"],
  );
  assert.ok(matrix.every((pin) => pin.line === 8));
});

test("a go directive above a golang:1.21 image is a floor conflict", async () => {
  const runtime = await report("floor-conflict");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["1.21"]);
  assert.deepEqual(
    runtime.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]),
    [["go.mod", 3, "1.23", "1.23"]],
  );
  assert.equal((await run("drift", resolve(fixtures, "floor-conflict"), "--runtime", "go", "--check")).code, 1);
});

test("values that cannot be resolved are reported with a reason, not guessed", async () => {
  const runtime = await report("unresolved");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, []);
  assert.ok(runtime.pins.length >= 5);
  for (const pin of runtime.pins) {
    assert.equal(pin.release, undefined, pin.raw);
    assert.ok((pin.unresolved ?? "").length > 0, pin.raw);
  }
  assert.match(find(runtime, "Dockerfile", "Dockerfile FROM")?.unresolved ?? "", /latest/);
  assert.match(find(runtime, ".tool-versions", ".tool-versions")?.unresolved ?? "", /ref:main/);
  assert.match(find(runtime, ".github/workflows/ci.yml", "actions/setup-go go-version")?.unresolved ?? "", /stable/);
});

test("drift --check exits 1 when a runtime drifts", async () => {
  const check = await run("drift", resolve(fixtures, "drifted"), "--runtime", "go", "--check");
  assert.equal(check.code, 1);
  assert.match(check.stdout, /DRIFT/);
});

test("drift --json with the Go collector validates against the drift schema", async () => {
  const result = await run("drift", resolve(fixtures, "drifted"), "--runtime", "go", "--json");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object,
  );
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("align prints a patch for every understood source, applies cleanly, and removes the drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-go-align-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "go.mod"), "module example.com/app\n\ngo 1.21\n\ntoolchain go1.22.4\n");
  await writeFile(join(root, ".go-version"), "1.22.4\n");
  await writeFile(join(root, ".tool-versions"), "golang 1.22.4\nnodejs 22.11.0\n");
  await writeFile(join(root, "Dockerfile"), "FROM golang:1.22.4-alpine AS build\nRUN go build ./...\n");
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.22.4'\n",
  );
  await execute("git", ["init", "-q"], { cwd: root });

  const aligned = await run("drift", root, "--runtime", "go", "--align", "1.24");
  assert.equal(aligned.code, 0, aligned.stderr);
  for (const file of ["go.mod", ".go-version", ".tool-versions", "Dockerfile", ".github/workflows/ci.yml"]) {
    assert.ok(aligned.stdout.includes(`+++ b/${file}`), file);
  }
  assert.match(aligned.stderr, /Refused go\.mod:3 \(go\.mod go 1\.21\)/);

  const patch = join(root, "align.patch");
  await writeFile(patch, aligned.stdout);
  await execute("git", ["apply", "--check", "align.patch"], { cwd: root });
  await execute("git", ["apply", "align.patch"], { cwd: root });

  assert.match(await readFile(join(root, "Dockerfile"), "utf8"), /^FROM golang:1\.24-alpine AS build$/m);
  assert.equal((await readFile(join(root, ".go-version"), "utf8")).trim(), "1.24");
  assert.equal((await readFile(join(root, "go.mod"), "utf8")).includes("toolchain go1.24"), true);

  const check = await run("drift", root, "--runtime", "go", "--check", "--json");
  assert.equal(check.code, 0, check.stderr);
  assert.deepEqual((JSON.parse(check.stdout) as Report).runtimes[0]!.releases, ["1.24"]);
});

test("align never writes a file", async () => {
  const before = await readFile(resolve(fixtures, "drifted", ".go-version"), "utf8");
  await run("drift", resolve(fixtures, "drifted"), "--runtime", "go", "--align", "1.24");
  assert.equal(await readFile(resolve(fixtures, "drifted", ".go-version"), "utf8"), before);
});

test("no drift source imports a process, network, or fetch API", async () => {
  for (const name of await readdir(resolve("src/drift"))) {
    if (!name.endsWith(".ts")) continue;
    const contents = await readFile(resolve("src/drift", name), "utf8");
    assert.doesNotMatch(contents, /node:(?:child_process|http|https|net)\b|\bfetch\s*\(/, name);
  }
});

test("the walk classifies every file name and directory edge exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-go-kinds-"));
  temporaryRoots.push(root);
  const files: Record<string, string> = {
    "config.yml":
      "version: 2.1\njobs:\n  test:\n    docker:\n      - image: golang:1.11\n    steps:\n      - checkout\n",
    ".circleci/config.yml":
      "version: 2.1\njobs:\n  test:\n    docker:\n      - image: golang:1.21\n    steps:\n      - checkout\n",
    ".circleci/other.yml":
      "version: 2.1\njobs:\n  test:\n    docker:\n      - image: golang:1.12\n    steps:\n      - checkout\n",
    "azure-pipelines.yml": "container: golang:1.23\n",
    "azure-pipelines.yaml": "container: golang:1.24\n",
    ".github/workflows/ci.yaml":
      "jobs:\n  t:\n    steps:\n      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.20.1'\n",
    ".github/workflows/nested/deep.yml":
      "jobs:\n  t:\n    steps:\n      - uses: actions/setup-go@v5\n        with:\n          go-version: '1.19'\n",
    ".github/workflows/notes.md": "go-version: 1.18\n",
    ".github/actions.yml": "go-version: 1.17\n",
    "vendor/go.mod": "module vendored\n\ngo 1.16\n",
    "docs/Dockerfile": "FROM golang:1.15\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    await writeFile(target, contents);
  }

  const pins = await goDriftCollector.collect(root);
  assert.deepEqual(pins.map((pin) => `${pin.path} ${pin.source}`).sort(), [
    ".circleci/config.yml CircleCI image",
    ".github/workflows/ci.yaml actions/setup-go go-version",
    "azure-pipelines.yml Azure Pipelines container",
    "docs/Dockerfile Dockerfile FROM",
  ]);
});
