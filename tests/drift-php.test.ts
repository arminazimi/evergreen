import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift } from "../src/drift/index.js";
import { phpDriftCollector } from "../src/drift/php.js";
import { runCli } from "./cli-runner.js";

async function run(...args: string[]) {
  return runCli(args);
}
const fixture = (name: string) => resolve("tests/fixtures/drift/php", name);
const collect = async (name: string) => (await analyzeDrift(fixture(name), [phpDriftCollector])).runtimes[0]!;

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function copyFixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `evergreen-drift-php-${name}-`));
  await cp(fixture(name), root, { recursive: true });
  roots.push(root);
  return root;
}

test("collects every PHP source the collector claims", async () => {
  const runtime = await collect("drifted");
  const pin = (path: string, source: string) =>
    runtime.pins.find((item) => item.path === path && item.source === source);

  assert.equal(pin(".php-version", ".php-version")?.release, "8.2");
  assert.equal(pin(".tool-versions", ".tool-versions")?.raw, "8.2.29");
  assert.equal(pin("composer.json", "composer.json config.platform.php")?.release, "8.1");
  assert.equal(pin("composer.json", "composer.json require.php")?.kind, "floor");
  assert.equal(pin("composer.lock", "composer.lock platform.php")?.kind, "floor");
  assert.equal(pin("Dockerfile", "Dockerfile FROM")?.raw, "8.3-fpm");
  assert.equal(pin(".github/workflows/ci.yml", "GitHub Actions shivammathur/setup-php php-version")?.release, "8.3");
  assert.equal(pin(".gitlab-ci.yml", "GitLab CI image")?.release, "8.3");
  assert.equal(pin(".circleci/config.yml", "CircleCI image")?.release, "8.2");
  assert.deepEqual(
    [...new Set(runtime.pins.map((item) => item.source))].sort(),
    [
      ".php-version",
      ".tool-versions",
      "CircleCI image",
      "Dockerfile FROM",
      "GitHub Actions shivammathur/setup-php php-version",
      "GitLab CI image",
      "composer.json config.platform.php",
      "composer.json require.php",
      "composer.lock platform.php",
    ].sort(),
  );
});

test("composer config.platform.php disagreeing with the Docker image is drift", async () => {
  const runtime = await collect("drifted");
  const platform = runtime.pins.find((pin) => pin.source === "composer.json config.platform.php");
  const docker = runtime.pins.find((pin) => pin.source === "Dockerfile FROM");
  assert.deepEqual([platform?.release, docker?.release], ["8.1", "8.3"]);
  assert.deepEqual(runtime.releases, ["8.1", "8.2", "8.3"]);
  assert.equal(runtime.drifted, true);
  assert.equal((await run("drift", fixture("drifted"), "--runtime", "php", "--check")).code, 1);
});

test("require.php and composer.lock platform.php are floors, not pins", async () => {
  const runtime = await collect("drifted");
  const required = runtime.pins.find((pin) => pin.source === "composer.json require.php");
  const locked = runtime.pins.find((pin) => pin.source === "composer.lock platform.php");
  assert.deepEqual([required?.kind, required?.line, required?.raw, required?.release], ["floor", 3, "^8.1", "8.1"]);
  assert.deepEqual([locked?.kind, locked?.line, locked?.raw, locked?.release], ["floor", 3, "8.1.31", "8.1"]);
  assert.deepEqual(runtime.floorConflicts, []);
});

test("require.php ^8.2 against an 8.1 pin is a floor conflict", async () => {
  const runtime = await collect("floor-conflict");
  assert.deepEqual(runtime.releases, ["8.1"]);
  assert.equal(runtime.drifted, false);
  assert.deepEqual(
    runtime.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]),
    [["composer.json", 3, "^8.2", "8.2"]],
  );
  const check = await run("drift", fixture("floor-conflict"), "--runtime", "php", "--check");
  assert.equal(check.code, 1);
  assert.match(check.stdout, /floor conflict: composer\.json:3/);
});

test("a repository whose PHP pins agree reports no drift and no floor conflict", async () => {
  const runtime = await collect("consistent");
  assert.deepEqual(runtime.releases, ["8.3"]);
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.floorConflicts, []);
  assert.equal((await run("drift", fixture("consistent"), "--runtime", "php", "--check")).code, 0);
});

test("align patches every understood source, applies cleanly, and removes the drift", async () => {
  const root = await copyFixture("align");
  const patchFile = `${root}.patch`;
  const aligned = await run("drift", root, "--runtime", "php", "--align", "8.3");
  assert.equal(aligned.code, 0, aligned.stderr);
  for (const file of [
    ".php-version",
    ".tool-versions",
    "composer.json",
    "Dockerfile",
    ".gitlab-ci.yml",
    ".circleci/config.yml",
    ".github/workflows/ci.yml",
  ]) {
    assert.ok(aligned.stdout.includes(`+++ b/${file}`), file);
  }
  assert.match(aligned.stderr, /Refused composer\.json:3 \(composer\.json require\.php \^8\.2\)/);
  assert.match(aligned.stderr, /Refused composer\.lock:3 \(composer\.lock platform\.php 8\.2\.29\)/);
  assert.doesNotMatch(aligned.stdout, /composer\.lock/);
  await writeFile(patchFile, aligned.stdout);

  spawnSync("git", ["init", "-q"], { cwd: root });
  const check = spawnSync("git", ["apply", "--check", patchFile], { cwd: root, encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(spawnSync("git", ["apply", patchFile], { cwd: root, encoding: "utf8" }).status, 0);

  assert.equal(await readFile(join(root, ".php-version"), "utf8"), "php-8.3\n");
  assert.equal(await readFile(join(root, ".tool-versions"), "utf8"), "php 8.3\nnodejs 22.11.0\n");
  const composer = await readFile(join(root, "composer.json"), "utf8");
  assert.match(composer, /"php": "8\.3"/);
  assert.match(composer, /"php": "\^8\.2"/);
  assert.equal(await readFile(join(root, "Dockerfile"), "utf8"), "FROM php:8.3-fpm AS build\nCOPY . /app\n");
  assert.match(await readFile(join(root, ".github/workflows/ci.yml"), "utf8"), /php-version: "8\.3"/);
  assert.match(await readFile(join(root, ".gitlab-ci.yml"), "utf8"), /image: php:8\.3/);
  assert.match(await readFile(join(root, ".circleci/config.yml"), "utf8"), /cimg\/php:8\.3-cli/);

  const recheck = await run("drift", root, "--runtime", "php", "--check", "--json");
  assert.equal(recheck.code, 0, `${recheck.stdout}${recheck.stderr}`);
  assert.deepEqual((JSON.parse(recheck.stdout) as { runtimes: Array<{ releases: string[] }> }).runtimes[0]!.releases, [
    "8.3",
  ]);
});

test("align never writes a file", async () => {
  const before = await readFile(fixture("align") + "/.php-version", "utf8");
  const aligned = await run("drift", fixture("align"), "--runtime", "php", "--align", "8.3");
  assert.equal(aligned.code, 0, aligned.stderr);
  assert.equal(await readFile(fixture("align") + "/.php-version", "utf8"), before);
});

test("--json output conforms to the drift schema", async () => {
  const result = await run("drift", fixture("drifted"), "--runtime", "php", "--json");
  assert.equal(result.code, 0, result.stderr);
  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});
