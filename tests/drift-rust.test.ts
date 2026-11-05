import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { rustDriftCollector } from "../src/drift/rust.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

const execute = promisify(execFile);

let fixtures: string;
const temporaryRoots: string[] = [];

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/drift/rust"), temporaryRoots);
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
  const result = await run("drift", resolve(fixtures, fixture), "--runtime", "rust", "--json");
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as Report;
  assert.equal(parsed.schemaVersion, "evergreen.drift.v1");
  const [runtime] = parsed.runtimes;
  assert.ok(runtime);
  assert.equal(runtime.runtime, "rust");
  return runtime;
}

function find(runtime: Runtime, path: string, source: string): Pin | undefined {
  return runtime.pins.find((pin) => pin.path === path && pin.source === source);
}

test("every Rust source is collected, and the report is a drift", async () => {
  const runtime = await report("drifted");
  assert.equal(runtime.drifted, true);
  assert.deepEqual(runtime.releases, ["1.75", "1.79"]);

  const expected: Array<[string, string, string]> = [
    ["rust-toolchain.toml", "rust-toolchain.toml channel", "1.79"],
    ["rust-toolchain", "rust-toolchain", "1.75"],
    [".tool-versions", ".tool-versions", "1.79"],
    ["Dockerfile", "Dockerfile FROM", "1.79"],
    [".github/workflows/ci.yml", "GitHub Actions container", "1.79"],
    [".github/workflows/ci.yml", "dtolnay/rust-toolchain ref", "1.79"],
    [".github/workflows/ci.yml", "dtolnay/rust-toolchain toolchain", "1.79"],
    [".github/workflows/ci.yml", "actions-rs/toolchain toolchain", "1.79"],
    [".gitlab-ci.yml", "GitLab CI image", "1.79"],
    [".circleci/config.yml", "CircleCI image", "1.79"],
    ["azure-pipelines.yml", "Azure Pipelines container", "1.79"],
    ["Cargo.toml", "Cargo.toml rust-version", "1.70"],
  ];
  for (const [path, source, release] of expected) {
    const pin = find(runtime, path, source);
    assert.ok(pin, `${path} ${source}`);
    assert.equal(pin.release, release, `${path} ${source}`);
  }

  const moving = runtime.pins.find((pin) => pin.source === "dtolnay/rust-toolchain ref" && pin.raw === "stable");
  assert.equal(moving?.release, undefined);
  assert.match(moving?.unresolved ?? "", /moving channel/);
});

test("the walk classifies every Rust source name and directory edge exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-rust-walk-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows", "nested"), { recursive: true });
  await mkdir(join(root, ".circleci"), { recursive: true });
  await mkdir(join(root, "node_modules"), { recursive: true });
  await writeFile(join(root, "rust-toolchain.toml"), '[toolchain]\nchannel = "1.79.0"\n');
  await writeFile(join(root, "rust-toolchain"), "1.79.0\n");
  await writeFile(join(root, "Cargo.toml"), '[package]\nname = "walk"\nrust-version = "1.75"\n');
  await writeFile(join(root, ".tool-versions"), "rust 1.79.0\nnodejs 22.11.0\n");
  await writeFile(join(root, "Dockerfile"), "FROM rust:1.79.0-slim AS build\n");
  await writeFile(join(root, ".gitlab-ci.yml"), "build:\n  image: rust:1.79.0\n");
  await writeFile(
    join(root, ".circleci", "config.yml"),
    "version: 2.1\njobs:\n  build:\n    docker:\n      - image: rust:1.79.0\n    steps:\n      - checkout\n",
  );
  await writeFile(join(root, "azure-pipelines.yml"), "jobs:\n  - job: build\n    container: rust:1.79.0\n");
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    container:\n      image: rust:1.79.0\n    services:\n      integration:\n        image: rust:1.79.0\n    steps:\n      - uses: dtolnay/rust-toolchain@1.79.0\n      - uses: dtolnay/rust-toolchain@stable\n        with:\n          toolchain: 1.79.0\n      - uses: actions-rs/toolchain@v1\n        with:\n          toolchain: 1.79.0\n",
  );
  // every name below is one the walk must reject: an unknown extension, a CI config outside
  // `.circleci`, an extension the Azure rule does not accept, a workflow below its directory, a
  // skipped directory, and a non-YAML file in the workflows directory
  await writeFile(join(root, "rust-toolchain.yml"), "channel: 1.79.0\n");
  await writeFile(join(root, "config.yml"), "version: 2.1\njobs:\n  build:\n    docker:\n      - image: rust:1.79.0\n");
  await writeFile(join(root, "azure-pipelines.yaml"), "jobs:\n  - job: build\n    container: rust:1.79.0\n");
  await writeFile(
    join(root, ".github", "workflows", "nested", "deep.yml"),
    "jobs:\n  test:\n    container: rust:1.79.0\n",
  );
  await writeFile(join(root, "node_modules", "rust-toolchain"), "1.79.0\n");

  const pins = await rustDriftCollector.collect(root);
  assert.deepEqual(pins.map((pin) => `${pin.path} ${pin.source} ${pin.kind} ${pin.release ?? "unresolved"}`).sort(), [
    ".circleci/config.yml CircleCI image pin 1.79",
    ".github/workflows/ci.yml GitHub Actions container pin 1.79",
    ".github/workflows/ci.yml GitHub Actions service image pin 1.79",
    ".github/workflows/ci.yml actions-rs/toolchain toolchain pin 1.79",
    ".github/workflows/ci.yml dtolnay/rust-toolchain ref pin 1.79",
    ".github/workflows/ci.yml dtolnay/rust-toolchain ref pin unresolved",
    ".github/workflows/ci.yml dtolnay/rust-toolchain toolchain pin 1.79",
    ".gitlab-ci.yml GitLab CI image pin 1.79",
    ".tool-versions .tool-versions pin 1.79",
    "Cargo.toml Cargo.toml rust-version floor 1.75",
    "Dockerfile Dockerfile FROM pin 1.79",
    "azure-pipelines.yml Azure Pipelines container pin 1.79",
    "rust-toolchain rust-toolchain pin 1.79",
    "rust-toolchain.toml rust-toolchain.toml channel pin 1.79",
  ]);
  assert.match(
    pins.find((pin) => pin.raw === "stable")?.unresolved ?? "",
    /moving channel, not a release Evergreen can resolve offline/,
  );
});

test("rust-version is a floor, never a pin, in package and workspace.package", async () => {
  const runtime = await report("drifted");
  const floors = runtime.pins.filter((pin) => pin.source === "Cargo.toml rust-version");
  assert.deepEqual(
    floors.map((pin) => [pin.line, pin.raw, pin.kind]),
    [
      [4, "1.70", "floor"],
      [7, "1.75", "floor"],
    ],
  );
  assert.deepEqual(runtime.floorConflicts, []);
});

test("a consistent repository has one release and no conflicts", async () => {
  const runtime = await report("consistent");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["1.79"]);
  assert.deepEqual(runtime.floorConflicts, []);
  assert.equal(
    runtime.pins.every((pin) => pin.release === "1.79" || pin.kind === "floor"),
    true,
  );
});

test("a rust-version above the toolchain is a floor conflict", async () => {
  const runtime = await report("floor-conflict");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["1.75"]);
  assert.deepEqual(
    runtime.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]),
    [["Cargo.toml", 4, "1.79", "1.79"]],
  );
  assert.equal((await run("drift", resolve(fixtures, "floor-conflict"), "--runtime", "rust", "--check")).code, 1);
});

test("values that cannot be resolved are reported with a reason, not guessed", async () => {
  const runtime = await report("unresolved");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, []);
  assert.ok(runtime.pins.length >= 8);
  for (const pin of runtime.pins) {
    assert.equal(pin.release, undefined, pin.raw);
    assert.ok((pin.unresolved ?? "").length > 0, pin.raw);
  }
  assert.match(find(runtime, "Dockerfile", "Dockerfile FROM")?.unresolved ?? "", /latest/);
  assert.match(find(runtime, "rust-toolchain", "rust-toolchain")?.unresolved ?? "", /nightly/);
  assert.match(find(runtime, ".tool-versions", ".tool-versions")?.unresolved ?? "", /stable/);
  assert.match(find(runtime, ".github/workflows/ci.yml", "dtolnay/rust-toolchain ref")?.unresolved ?? "", /nightly/);
  assert.match(find(runtime, "azure-pipelines.yml", "Azure Pipelines container")?.unresolved ?? "", /no tag/);
});

test("drift --check exits 1 when a runtime drifts", async () => {
  const check = await run("drift", resolve(fixtures, "drifted"), "--runtime", "rust", "--check");
  assert.equal(check.code, 1);
  assert.match(check.stdout, /DRIFT/);
});

test("drift --json with the Rust collector validates against the drift schema", async () => {
  const result = await run("drift", resolve(fixtures, "drifted"), "--runtime", "rust", "--json");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object,
  );
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("align prints a patch for every understood source, applies cleanly, and removes the drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-rust-align-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await mkdir(join(root, ".circleci"), { recursive: true });
  await writeFile(join(root, "rust-toolchain.toml"), '[toolchain]\nchannel = "1.75.0"\n');
  await writeFile(join(root, "rust-toolchain"), "1.75.0\n");
  await writeFile(join(root, ".tool-versions"), "rust 1.75.0\nnodejs 22.11.0\n");
  await writeFile(join(root, "Cargo.toml"), '[package]\nname = "align"\nversion = "0.1.0"\nrust-version = "1.75"\n');
  await writeFile(join(root, "Dockerfile"), "FROM rust:1.75.0-slim-bookworm AS build\nRUN cargo build\n");
  await writeFile(
    join(root, ".github", "workflows", "ref.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: dtolnay/rust-toolchain@1.75.0\n",
  );
  await writeFile(
    join(root, ".github", "workflows", "input.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: dtolnay/rust-toolchain@stable\n        with:\n          toolchain: 1.75.0\n",
  );
  await writeFile(
    join(root, ".github", "workflows", "actions-rs.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions-rs/toolchain@v1\n        with:\n          toolchain: 1.75.0\n",
  );
  await writeFile(join(root, ".github", "workflows", "container.yml"), "jobs:\n  test:\n    container: rust:1.75.0\n");
  await writeFile(join(root, ".gitlab-ci.yml"), "build:\n  image: rust:1.75.0\n");
  await writeFile(join(root, ".circleci", "config.yml"), "jobs:\n  build:\n    docker:\n      - image: rust:1.75.0\n");
  await writeFile(join(root, "azure-pipelines.yml"), "jobs:\n  - job: build\n    container: rust:1.75.0\n");
  await execute("git", ["init", "-q"], { cwd: root });

  const aligned = await run("drift", root, "--runtime", "rust", "--align", "1.82");
  assert.equal(aligned.code, 0, aligned.stderr);
  for (const file of [
    "rust-toolchain.toml",
    "rust-toolchain",
    ".tool-versions",
    "Dockerfile",
    ".github/workflows/ref.yml",
    ".github/workflows/input.yml",
    ".github/workflows/actions-rs.yml",
    ".github/workflows/container.yml",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    "azure-pipelines.yml",
  ]) {
    assert.ok(aligned.stdout.includes(`+++ b/${file}`), file);
  }
  assert.ok(!aligned.stdout.includes("+++ b/Cargo.toml"));
  assert.match(aligned.stderr, /Refused Cargo\.toml:4 \(Cargo\.toml rust-version 1\.75\)/);
  assert.match(aligned.stderr, /Refused .*dtolnay\/rust-toolchain ref stable/);

  const patch = join(root, "align.patch");
  await writeFile(patch, aligned.stdout);
  await execute("git", ["apply", "--check", "align.patch"], { cwd: root });
  await execute("git", ["apply", "align.patch"], { cwd: root });

  assert.match(await readFile(join(root, "Dockerfile"), "utf8"), /^FROM rust:1\.82-slim-bookworm AS build$/m);
  assert.equal((await readFile(join(root, ".tool-versions"), "utf8")).split("\n")[0], "rust 1.82");
  assert.match(await readFile(join(root, "rust-toolchain.toml"), "utf8"), /^channel = "1\.82"$/m);
  assert.match(await readFile(join(root, ".github", "workflows", "ref.yml"), "utf8"), /dtolnay\/rust-toolchain@1\.82/);
  assert.match(await readFile(join(root, ".github", "workflows", "input.yml"), "utf8"), /toolchain: 1\.82/);
  assert.match(await readFile(join(root, "Cargo.toml"), "utf8"), /rust-version = "1\.75"/);

  const check = await run("drift", root, "--runtime", "rust", "--check", "--json");
  assert.equal(check.code, 0, check.stderr);
  assert.deepEqual((JSON.parse(check.stdout) as Report).runtimes[0]!.releases, ["1.82"]);
});

test("align never writes a file", async () => {
  const before = await readFile(resolve(fixtures, "drifted", ".tool-versions"), "utf8");
  await run("drift", resolve(fixtures, "drifted"), "--runtime", "rust", "--align", "1.82");
  assert.equal(await readFile(resolve(fixtures, "drifted", ".tool-versions"), "utf8"), before);
});

test("no drift source imports a process, network, or fetch API", async () => {
  for (const name of await readdir(resolve("src/drift"))) {
    if (!name.endsWith(".ts")) continue;
    const contents = await readFile(resolve("src/drift", name), "utf8");
    assert.doesNotMatch(contents, /node:(?:child_process|http|https|net)\b|\bfetch\s*\(/, name);
  }
});
