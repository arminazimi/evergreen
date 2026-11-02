import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift } from "../src/drift/index.js";
import { pythonCollector } from "../src/drift/python.js";
import type { RuntimePin } from "../src/drift/index.js";
import { runCli } from "./cli-runner.js";

const fixtures = resolve("tests/fixtures/drift/python");

const run = (...args: string[]) => runCli(args);

function entry(pins: readonly RuntimePin[], path: string, source: string, raw: string): RuntimePin {
  const found = pins.find((pin) => pin.path === path && pin.source === source && pin.raw === raw);
  assert.ok(found, `missing ${path} ${source} ${raw}`);
  return found;
}

test("collects every listed Python source with its exact location and release", async () => {
  const root = resolve(fixtures, "drifted");
  const pins = await pythonCollector.collect(root);
  const sources = new Set(pins.map((pin) => pin.source));
  assert.deepEqual(
    [...sources].sort(),
    [
      ".python-version",
      ".tool-versions",
      "Azure Pipelines image",
      "CircleCI image",
      "Dockerfile FROM",
      "GitLab CI image",
      "Pipfile requires",
      "conda environment.yml",
      "pyproject.toml poetry python",
      "pyproject.toml requires-python",
      "runtime.txt",
      "setup-python matrix",
      "setup-python python-version",
      "setup.cfg python_requires",
      "setup.py python_requires",
    ].sort(),
  );

  assert.deepEqual(
    [entry(pins, ".python-version", ".python-version", "3.10.13").line, entry(pins, ".python-version", ".python-version", "3.10.13").release],
    [1, "3.10"],
  );
  assert.equal(entry(pins, ".tool-versions", ".tool-versions", "3.8.18").release, "3.8");
  assert.equal(entry(pins, ".tool-versions", ".tool-versions", "3.x").release, undefined);
  assert.match(entry(pins, ".tool-versions", ".tool-versions", "3.x").unresolved ?? "", /minor/);
  assert.equal(entry(pins, "runtime.txt", "runtime.txt", "python-3.9.18").release, "3.9");
  assert.equal(entry(pins, "Pipfile", "Pipfile requires", "3.9").release, "3.9");
  assert.equal(entry(pins, "Dockerfile", "Dockerfile FROM", "python:3.11-slim").release, "3.11");
  assert.equal(entry(pins, "Dockerfile.prod", "Dockerfile FROM", "python:3.9-alpine").release, "3.9");
  assert.equal(entry(pins, "environment.yml", "conda environment.yml", "python=3.9").release, "3.9");
  assert.equal(entry(pins, ".gitlab-ci.yml", "GitLab CI image", "python:3.10-slim").release, "3.10");
  assert.equal(entry(pins, ".gitlab-ci.yml", "GitLab CI image", "python:3.11-alpine").release, "3.11");
  assert.equal(entry(pins, ".circleci/config.yml", "CircleCI image", "cimg/python:3.11").release, "3.11");
  assert.equal(entry(pins, "azure-pipelines.yml", "Azure Pipelines image", "python:3.9").release, "3.9");
  assert.equal(entry(pins, "azure-pipelines.yml", "Azure Pipelines image", "python:3.10").release, "3.10");

  const pipfile = pins.filter((pin) => pin.path === "Pipfile");
  assert.equal(pipfile.length, 1);
  assert.equal(pipfile[0]!.line, 9);
});

test("collects floors, matrix values, and an expression without counting the matrix against itself", async () => {
  const pins = await pythonCollector.collect(resolve(fixtures, "drifted"));
  assert.equal(entry(pins, "pyproject.toml", "pyproject.toml requires-python", ">=3.12").kind, "floor");
  assert.equal(entry(pins, "pyproject.toml", "pyproject.toml requires-python", ">=3.12").release, "3.12");
  assert.equal(entry(pins, "pyproject.toml", "pyproject.toml poetry python", "^3.9").release, "3.9");
  assert.equal(entry(pins, "setup.cfg", "setup.cfg python_requires", ">=3.8,<4").release, "3.8");
  assert.equal(entry(pins, "setup.py", "setup.py python_requires", ">=3.7").release, "3.7");

  const matrix = pins.filter((pin) => pin.source === "setup-python matrix");
  assert.deepEqual(matrix.map((pin) => [pin.raw, pin.release, pin.line]).sort(), [["3.10", "3.10", 14], ["3.11", "3.11", 14]]);
  assert.equal(entry(pins, ".github/workflows/ci.yml", "setup-python python-version", "3.12").release, "3.12");
  assert.equal(entry(pins, ".github/workflows/ci.yml", "setup-python python-version", "${{ inputs.python }}").release, undefined);
});

test("reports drift, floor conflicts, and a consistent repository", async () => {
  const drifted = await analyzeDrift(resolve(fixtures, "drifted"), [pythonCollector]);
  assert.deepEqual(drifted.runtimes[0]!.releases, ["3.8", "3.9", "3.10", "3.11", "3.12"]);
  assert.equal(drifted.runtimes[0]!.drifted, true);
  assert.deepEqual(
    drifted.runtimes[0]!.floorConflicts.map((pin) => [pin.source, pin.release]).sort(),
    [["pyproject.toml poetry python", "3.9"], ["pyproject.toml requires-python", "3.12"]],
  );

  const consistent = await analyzeDrift(resolve(fixtures, "consistent"), [pythonCollector]);
  assert.deepEqual(consistent.runtimes[0]!.releases, ["3.12"]);
  assert.equal(consistent.runtimes[0]!.drifted, false);
  assert.deepEqual(consistent.runtimes[0]!.floorConflicts, []);
});

test("drift --check exits 1 on drift and 0 on a consistent repository", async () => {
  const drifted = await run("drift", resolve(fixtures, "drifted"), "--check");
  assert.equal(drifted.code, 1, drifted.stdout + drifted.stderr);
  assert.match(drifted.stdout, /DRIFT/);
  assert.match(drifted.stdout, /floor conflict/);

  const consistent = await run("drift", resolve(fixtures, "consistent"), "--check");
  assert.equal(consistent.code, 0, consistent.stdout + consistent.stderr);
});

test("drift --json matches the drift schema and is byte-identical across runs", async () => {
  const root = resolve(fixtures, "drifted");
  const first = await run("drift", root, "--json");
  const second = await run("drift", root, "--json");
  assert.equal(first.code, 0);
  assert.equal(first.stdout, second.stdout);

  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const document = JSON.parse(first.stdout);
  assert.equal(validate(document), true, JSON.stringify(validate.errors));
  assert.equal(document.schemaVersion, "evergreen.drift.v1");

  const rejected = { ...document, undeclared: true };
  assert.equal(validate(rejected), false);
});

test("bad flags and --align without --runtime exit 2", async () => {
  assert.equal((await run("drift", resolve(fixtures, "drifted"), "--bogus")).code, 2);
  assert.equal((await run("drift", resolve(fixtures, "drifted"), "--align", "3.12")).code, 2);
  assert.equal((await run("drift", resolve(fixtures, "drifted"), "--runtime", "cobol")).code, 2);
});

test("--align patches apply and remove the drift, and floors are refused", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "evergreen-drift-python-"));
  try {
    await cp(resolve(fixtures, "align"), temporary, { recursive: true });
    const git = (...args: string[]) => spawnSync("git", args, { cwd: temporary, encoding: "utf8" });
    assert.equal(git("init", "-q").status, 0);
    git("config", "user.email", "fixture@example.com");
    git("config", "user.name", "Fixture");
    assert.equal(git("add", ".").status, 0);
    assert.equal(git("commit", "-qm", "fixture").status, 0);

    const aligned = await run("drift", temporary, "--runtime", "python", "--align", "3.12");
    assert.equal(aligned.code, 0, aligned.stderr);
    assert.match(aligned.stderr, /Refused pyproject\.toml:\d+ \(pyproject\.toml requires-python/);
    assert.match(aligned.stdout, /^\+\+\+ b\/Dockerfile/m);

    const patch = join(temporary, "..", `${basename(temporary)}.patch`);
    await writeFile(patch, aligned.stdout);
    const applied = spawnSync("git", ["apply", "--check", patch], { cwd: temporary, encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(spawnSync("git", ["apply", patch], { cwd: temporary, encoding: "utf8" }).status, 0);

    const checked = await run("drift", temporary, "--runtime", "python", "--check");
    assert.equal(checked.code, 0, checked.stdout + checked.stderr);
    assert.equal(await readFile(join(temporary, ".python-version"), "utf8"), "3.12\n");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
