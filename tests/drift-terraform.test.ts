import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { terraformCollector } from "../src/drift/terraform.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

const execute = promisify(execFile);

let fixtures: string;
const temporaryRoots: string[] = [];

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/drift/terraform"), temporaryRoots);
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
  scope?: string;
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
  const result = await run("drift", resolve(fixtures, fixture), "--runtime", "terraform", "--json");
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout) as Report;
  assert.equal(parsed.schemaVersion, "evergreen.drift.v1");
  const [runtime] = parsed.runtimes;
  assert.ok(runtime);
  assert.equal(runtime.runtime, "terraform");
  return runtime;
}

function find(runtime: Runtime, path: string, source: string): Pin | undefined {
  return runtime.pins.find((pin) => pin.path === path && pin.source === source);
}

test("every Terraform source is collected, and the report is a drift", async () => {
  const runtime = await report("drifted");
  assert.equal(runtime.drifted, true);
  assert.deepEqual(runtime.releases, ["1.16", "1.17"]);

  const expected: Array<[string, string, string]> = [
    [".terraform-version", ".terraform-version", "1.16"],
    [".tool-versions", ".tool-versions", "1.17"],
    ["Dockerfile", "Dockerfile FROM", "1.17"],
    ["main.tf", "terraform required_version", "1.16"],
    ["modules/network/.terraform-version", ".terraform-version", "1.17"],
    ["modules/network/main.tf", "terraform required_version", "1.17"],
    [".github/workflows/ci.yml", "hashicorp/setup-terraform terraform_version", "1.16"],
    [".github/workflows/ci.yml", "GitHub Actions container", "1.16"],
    [".gitlab-ci.yml", "GitLab CI image", "1.17"],
    [".circleci/config.yml", "CircleCI image", "1.16"],
    ["azure-pipelines.yml", "Azure Pipelines container", "1.17"],
  ];
  for (const [path, source, release] of expected) {
    const pin = find(runtime, path, source);
    assert.ok(pin, `${path} ${source}`);
    assert.equal(pin.release, release, `${path} ${source}`);
  }

  assert.equal(find(runtime, ".gitlab-ci.yml", "GitLab CI image")?.raw, "1.17.0");
  const mainTf = runtime.pins.filter((pin) => pin.path === "main.tf");
  assert.deepEqual(
    mainTf.map((pin) => pin.source),
    ["terraform required_version"],
  );
});

test("an exact required_version is a pin, a range is a floor, and both carry their directory", async () => {
  const runtime = await report("drifted");
  const exact = find(runtime, "main.tf", "terraform required_version");
  assert.equal(exact?.kind, "pin");
  assert.equal(exact?.raw, "= 1.16.0");
  assert.equal(exact?.line, 2);
  assert.equal(exact?.scope, ".");
  const floor = find(runtime, "modules/network/main.tf", "terraform required_version");
  assert.equal(floor?.kind, "floor");
  assert.equal(floor?.raw, ">= 1.17.0");
  assert.equal(floor?.release, "1.17");
  assert.equal(floor?.scope, "modules/network");
  assert.equal(find(runtime, "modules/network/.terraform-version", ".terraform-version")?.scope, "modules/network");
});

test("the walk classifies every Terraform source name and directory edge exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-terraform-walk-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows", "nested"), { recursive: true });
  await mkdir(join(root, ".circleci"), { recursive: true });
  await mkdir(join(root, ".terraform"), { recursive: true });
  await mkdir(join(root, "modules", "network"), { recursive: true });
  await writeFile(join(root, ".terraform-version"), "1.16.0\n");
  await writeFile(join(root, "modules", "network", ".terraform-version"), "1.17.0\n");
  await writeFile(join(root, ".tool-versions"), "terraform 1.16.0\nnodejs 22.11.0\n");
  await writeFile(join(root, "main.tf"), 'terraform {\n  required_version = ">= 1.16.0"\n}\n');
  await writeFile(join(root, "Dockerfile"), "FROM hashicorp/terraform:1.16.0 AS tools\nFROM ubuntu:22.04\n");
  await writeFile(join(root, ".gitlab-ci.yml"), "plan:\n  image: hashicorp/terraform:1.16.0\n");
  await writeFile(
    join(root, ".circleci", "config.yml"),
    "version: 2.1\njobs:\n  build:\n    docker:\n      - image: hashicorp/terraform:1.16.0\n    steps:\n      - checkout\n",
  );
  await writeFile(
    join(root, "azure-pipelines.yml"),
    "jobs:\n  - job: build\n    container: hashicorp/terraform:1.16.0\n",
  );
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    container:\n      image: hashicorp/terraform:1.17.0\n    services:\n      state:\n        image: hashicorp/terraform:1.9.5\n      cache:\n        image: redis:7\n    steps:\n      - uses: hashicorp/setup-terraform@v3\n        with:\n          terraform_version: 1.16.0\n",
  );
  // every name below is one the walk must reject: a CI config outside `.circleci`, an extension the
  // Azure rule does not accept, a workflow below its directory, a skipped directory, and a file that
  // only looks like Terraform
  await writeFile(
    join(root, "config.yml"),
    "version: 2.1\njobs:\n  build:\n    docker:\n      - image: hashicorp/terraform:1.16.0\n",
  );
  await writeFile(
    join(root, "azure-pipelines.yaml"),
    "jobs:\n  - job: build\n    container: hashicorp/terraform:1.16.0\n",
  );
  await writeFile(
    join(root, ".github", "workflows", "nested", "deep.yml"),
    "jobs:\n  test:\n    container: hashicorp/terraform:1.16.0\n",
  );
  await writeFile(join(root, ".terraform", ".terraform-version"), "1.20.0\n");
  await writeFile(join(root, "notes.tf.md"), 'terraform {\n  required_version = "1.20.0"\n}\n');

  const pins = await terraformCollector.collect(root);
  assert.deepEqual(pins.map((pin) => `${pin.path} ${pin.source} ${pin.kind} ${pin.raw}`).sort(), [
    ".circleci/config.yml CircleCI image pin 1.16.0",
    ".github/workflows/ci.yml GitHub Actions container pin 1.17.0",
    ".github/workflows/ci.yml GitHub Actions container pin 1.9.5",
    ".github/workflows/ci.yml hashicorp/setup-terraform terraform_version pin 1.16.0",
    ".gitlab-ci.yml GitLab CI image pin 1.16.0",
    ".terraform-version .terraform-version pin 1.16.0",
    ".tool-versions .tool-versions pin 1.16.0",
    "Dockerfile Dockerfile FROM pin 1.16.0",
    "azure-pipelines.yml Azure Pipelines container pin 1.16.0",
    "main.tf terraform required_version floor >= 1.16.0",
    "modules/network/.terraform-version .terraform-version pin 1.17.0",
  ]);
});

test("every required_version constraint form becomes the pin or floor its shape states", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-terraform-constraints-"));
  temporaryRoots.push(root);
  const constraints: Array<[string, string]> = [
    ["bare.tf", "1.17.0"],
    ["equals.tf", "= 1.17"],
    ["minor-line.tf", "~> 1.9.0"],
    ["open-line.tf", "~> 1.16"],
    ["window.tf", ">= 1.16, < 2.0.0"],
    ["highest-floor.tf", ">= 1.9, > 1.10"],
    ["maximum.tf", "< 1.0"],
    ["invalid.tf", "banana"],
  ];
  for (const [file, constraint] of constraints) {
    await writeFile(join(root, file), `terraform {\n  required_version = "${constraint}"\n}\n`);
  }

  const pins = await terraformCollector.collect(root);
  const expected: Array<[string, "pin" | "floor", string, string]> = [
    ["bare.tf", "pin", "1.17.0", "1.17"],
    ["equals.tf", "pin", "= 1.17", "1.17"],
    ["minor-line.tf", "pin", "~> 1.9.0", "1.9"],
    ["open-line.tf", "floor", "~> 1.16", "1.16"],
    ["window.tf", "floor", ">= 1.16, < 2.0.0", "1.16"],
    ["highest-floor.tf", "floor", ">= 1.9, > 1.10", "1.10"],
  ];
  for (const [path, kind, raw, release] of expected) {
    const pin = pins.find((entry) => entry.path === path);
    assert.ok(pin, path);
    assert.equal(pin.source, "terraform required_version");
    assert.equal(pin.kind, kind, path);
    assert.equal(pin.raw, raw, path);
    assert.equal(pin.release, release, path);
    assert.equal(pin.scope, ".", path);
  }

  const unresolved = pins.filter((pin) => pin.release === undefined);
  assert.deepEqual(unresolved.map((pin) => `${pin.path} ${pin.kind} ${pin.raw}`).sort(), [
    "invalid.tf floor banana",
    "maximum.tf floor < 1.0",
  ]);
  assert.match(unresolved.find((pin) => pin.path === "maximum.tf")?.unresolved ?? "", /states no minimum version/);
  assert.match(
    unresolved.find((pin) => pin.path === "invalid.tf")?.unresolved ?? "",
    /not a Terraform version constraint/,
  );
});

test("a consistent repository has one release and no conflicts", async () => {
  const runtime = await report("consistent");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["1.16"]);
  assert.deepEqual(runtime.floorConflicts, []);
  const pessimistic = find(runtime, "modules/vpc/main.tf", "terraform required_version");
  assert.equal(pessimistic?.kind, "floor");
  assert.equal(pessimistic?.raw, "~> 1.16");
});

test("required_version above a repository-wide pin is a floor conflict", async () => {
  const runtime = await report("floor-conflict");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, ["1.6"]);
  assert.deepEqual(
    runtime.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]),
    [["main.tf", 2, ">= 1.8.0", "1.8"]],
  );
  assert.equal((await run("drift", resolve(fixtures, "floor-conflict"), "--runtime", "terraform", "--check")).code, 1);
});

test("a floor is checked against the nearest version file, not every pin", async () => {
  const runtime = await report("per-directory");
  assert.equal(runtime.drifted, true);
  assert.deepEqual(runtime.releases, ["1.6", "1.8"]);
  assert.deepEqual(runtime.floorConflicts, []);
  const floor = find(runtime, "modules/eks/main.tf", "terraform required_version");
  assert.equal(floor?.scope, "modules/eks");
  assert.equal(floor?.release, "1.8");
});

test("values that cannot be resolved are reported with a reason, not guessed", async () => {
  const runtime = await report("unresolved");
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.releases, []);
  assert.ok(runtime.pins.length >= 7);
  for (const pin of runtime.pins) {
    assert.equal(pin.release, undefined, pin.raw);
    assert.ok((pin.unresolved ?? "").length > 0, pin.raw);
  }
  assert.match(find(runtime, ".terraform-version", ".terraform-version")?.unresolved ?? "", /latest/);
  assert.match(find(runtime, "legacy/.terraform-version", ".terraform-version")?.unresolved ?? "", /1\.9/);
  assert.match(find(runtime, ".tool-versions", ".tool-versions")?.unresolved ?? "", /ref:main/);
  assert.match(find(runtime, "Dockerfile", "Dockerfile FROM")?.unresolved ?? "", /no tag/);
  assert.match(
    find(runtime, ".github/workflows/ci.yml", "hashicorp/setup-terraform terraform_version")?.unresolved ?? "",
    /matrix/,
  );
  assert.match(find(runtime, "main.tf", "terraform required_version")?.unresolved ?? "", /no minimum/);
});

test("drift --json with the Terraform collector validates against the drift schema", async () => {
  const result = await run("drift", resolve(fixtures, "drifted"), "--runtime", "terraform", "--json");
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object,
  );
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("align prints a patch for every understood source, applies cleanly, and removes the drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-terraform-align-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "modules", "vpc"), { recursive: true });
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".terraform-version"), "1.16.0\n");
  await writeFile(join(root, ".tool-versions"), "nodejs 22.11.0\nterraform 1.16.0\n");
  await writeFile(join(root, "Dockerfile"), "FROM hashicorp/terraform:1.16.0\nRUN terraform fmt -check\n");
  await writeFile(join(root, "main.tf"), 'terraform {\n  required_version = "= 1.16.0"\n}\n');
  await writeFile(join(root, "modules", "vpc", "main.tf"), 'terraform {\n  required_version = ">= 1.16.0"\n}\n');
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: hashicorp/setup-terraform@v3\n        with:\n          terraform_version: 1.16.0\n",
  );
  await execute("git", ["init", "-q"], { cwd: root });

  const aligned = await run("drift", root, "--runtime", "terraform", "--align", "1.18");
  assert.equal(aligned.code, 0, aligned.stderr);
  for (const file of [".terraform-version", ".tool-versions", "Dockerfile", "main.tf", ".github/workflows/ci.yml"]) {
    assert.ok(aligned.stdout.includes(`+++ b/${file}`), file);
  }
  assert.match(aligned.stderr, /Refused modules\/vpc\/main\.tf:2 \(terraform required_version >= 1\.16\.0\)/);

  const patch = join(root, "align.patch");
  await writeFile(patch, aligned.stdout);
  await execute("git", ["apply", "--check", "align.patch"], { cwd: root });
  await execute("git", ["apply", "align.patch"], { cwd: root });

  assert.equal((await readFile(join(root, ".terraform-version"), "utf8")).trim(), "1.18.0");
  assert.equal((await readFile(join(root, ".tool-versions"), "utf8")).includes("terraform 1.18.0"), true);
  assert.match(await readFile(join(root, "Dockerfile"), "utf8"), /^FROM hashicorp\/terraform:1\.18\.0$/m);
  assert.match(await readFile(join(root, "main.tf"), "utf8"), /required_version = "= 1\.18\.0"/);
  assert.match(await readFile(join(root, ".github/workflows/ci.yml"), "utf8"), /terraform_version: 1\.18\.0/);

  const check = await run("drift", root, "--runtime", "terraform", "--check", "--json");
  assert.equal(check.code, 0, check.stderr);
  assert.deepEqual((JSON.parse(check.stdout) as Report).runtimes[0]!.releases, ["1.18"]);
});

test("align never writes a file", async () => {
  const before = await readFile(resolve(fixtures, "drifted", ".terraform-version"), "utf8");
  await run("drift", resolve(fixtures, "drifted"), "--runtime", "terraform", "--align", "1.18");
  assert.equal(await readFile(resolve(fixtures, "drifted", ".terraform-version"), "utf8"), before);
});
