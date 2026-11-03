import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { runCli } from "./cli-runner.js";

const execute = promisify(execFile);

const fixtures = resolve("tests/fixtures/drift/terraform");
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
  assert.deepEqual(mainTf.map((pin) => pin.source), ["terraform required_version"]);
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
  assert.deepEqual(runtime.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]), [["main.tf", 2, ">= 1.8.0", "1.8"]]);
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
  assert.match(find(runtime, ".github/workflows/ci.yml", "hashicorp/setup-terraform terraform_version")?.unresolved ?? "", /matrix/);
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
  await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: hashicorp/setup-terraform@v3\n        with:\n          terraform_version: 1.16.0\n");
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
