import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { after, before, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { dotnetCollector } from "../src/drift/dotnet.js";
import { analyzeDrift } from "../src/drift/index.js";
import type { RuntimePin } from "../src/drift/index.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

let fixtures: string;
const temporaryRoots: string[] = [];

before(async () => {
  fixtures = await copyFixtureTree(resolve("tests/fixtures/drift/dotnet"), temporaryRoots);
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

const run = (...args: string[]) => runCli(args);

function entry(pins: readonly RuntimePin[], path: string, source: string, raw: string): RuntimePin {
  const found = pins.find((pin) => pin.path === path && pin.source === source && pin.raw === raw);
  assert.ok(found, `missing ${path} ${source} ${raw}`);
  return found;
}

test("collects every listed .NET source with its exact location and release", async () => {
  const pins = await dotnetCollector.collect(resolve(fixtures, "drifted"));
  assert.deepEqual(
    [...new Set(pins.map((pin) => pin.source))].sort(),
    [
      "Azure Pipelines container",
      "CircleCI image",
      "Dockerfile FROM",
      "Dockerfile.legacy FROM",
      "Dockerfile.prod FROM",
      "GitLab CI image",
      "TargetFramework",
      "actions/setup-dotnet dotnet-version",
      "global.json sdk.version",
    ].sort(),
  );

  const sdk = entry(pins, "global.json", "global.json sdk.version", "6.0.428");
  assert.deepEqual([sdk.line, sdk.release], [3, "6.0"]);

  const props = entry(pins, "Directory.Build.props", "TargetFramework", "net7.0");
  assert.deepEqual([props.line, props.release], [3, "7.0"]);
  assert.equal(entry(pins, "src/App/App.csproj", "TargetFramework", "net8.0").release, "8.0");

  const framework = entry(pins, "src/Legacy/Legacy.csproj", "TargetFramework", "net48");
  assert.equal(framework.release, undefined);
  assert.match(framework.unresolved ?? "", /\.NET Framework/);

  const property = entry(pins, "src/Property/Property.csproj", "TargetFramework", "$(Tfm)");
  assert.equal(property.release, undefined);
  assert.match(property.unresolved ?? "", /MSBuild property/);

  const build = entry(pins, "Dockerfile", "Dockerfile FROM", "mcr.microsoft.com/dotnet/sdk:6.0");
  assert.deepEqual([build.line, build.release], [1, "6.0"]);
  assert.equal(entry(pins, "Dockerfile", "Dockerfile FROM", "mcr.microsoft.com/dotnet/aspnet:7.0").release, "7.0");
  assert.equal(
    entry(pins, "Dockerfile.prod", "Dockerfile.prod FROM", "mcr.microsoft.com/dotnet/runtime:8.0-alpine").release,
    "8.0",
  );
  assert.equal(
    entry(pins, "Dockerfile.legacy", "Dockerfile.legacy FROM", "mcr.microsoft.com/dotnet/core/sdk:3.1").release,
    "3.1",
  );

  const floating = entry(pins, "Dockerfile.legacy", "Dockerfile.legacy FROM", "mcr.microsoft.com/dotnet/sdk:latest");
  assert.equal(floating.release, undefined);
  assert.match(floating.unresolved ?? "", /tag/);

  const setup = entry(pins, ".github/workflows/ci.yml", "actions/setup-dotnet dotnet-version", "8.0.x");
  assert.deepEqual([setup.line, setup.release], [10, "8.0"]);
  const expression = entry(
    pins,
    ".github/workflows/ci.yml",
    "actions/setup-dotnet dotnet-version",
    "${{ matrix.dotnet }}",
  );
  assert.equal(expression.release, undefined);
  assert.match(expression.unresolved ?? "", /expression/);

  assert.equal(entry(pins, ".gitlab-ci.yml", "GitLab CI image", "mcr.microsoft.com/dotnet/sdk:6.0").release, "6.0");
  assert.equal(entry(pins, ".gitlab-ci.yml", "GitLab CI image", "mcr.microsoft.com/dotnet/runtime:8.0").release, "8.0");
  const circleci = entry(pins, ".circleci/config.yml", "CircleCI image", "mcr.microsoft.com/dotnet/sdk:7.0");
  assert.deepEqual([circleci.line, circleci.release], [5, "7.0"]);
  const azure = entry(pins, "azure-pipelines.yml", "Azure Pipelines container", "mcr.microsoft.com/dotnet/sdk:6.0");
  assert.deepEqual([azure.line, azure.release], [5, "6.0"]);
});

test("keeps the entries of one TargetFrameworks list together and out of drift", async () => {
  const pins = await dotnetCollector.collect(resolve(fixtures, "multi-target"));
  assert.deepEqual(
    pins.map((pin) => [pin.source, pin.raw, pin.release]),
    [
      ["TargetFrameworks", "net6.0", "6.0"],
      ["TargetFrameworks", "net8.0", "8.0"],
    ],
  );
  assert.equal(new Set(pins.map((pin) => pin.group)).size, 1);

  const report = await analyzeDrift(resolve(fixtures, "multi-target"), [dotnetCollector]);
  assert.deepEqual(report.runtimes[0]!.releases, ["6.0", "8.0"]);
  assert.equal(report.runtimes[0]!.drifted, false);
  assert.equal((await run("drift", resolve(fixtures, "multi-target"), "--runtime", "dotnet", "--check")).code, 0);
});

test("a source outside a multi-target list still drifts against it", async () => {
  const report = await analyzeDrift(resolve(fixtures, "multi-target-out-of-line"), [dotnetCollector]);
  assert.deepEqual(report.runtimes[0]!.releases, ["6.0", "8.0", "9.0"]);
  assert.equal(report.runtimes[0]!.drifted, true);
  assert.equal(
    (await run("drift", resolve(fixtures, "multi-target-out-of-line"), "--runtime", "dotnet", "--check")).code,
    1,
  );
});

test("reports drift for the drifted repository and none for the consistent one", async () => {
  const drifted = await analyzeDrift(resolve(fixtures, "drifted"), [dotnetCollector]);
  assert.deepEqual(drifted.runtimes[0]!.releases, ["3.1", "6.0", "7.0", "8.0"]);
  assert.equal(drifted.runtimes[0]!.drifted, true);
  assert.deepEqual(drifted.runtimes[0]!.floorConflicts, []);

  const consistent = await analyzeDrift(resolve(fixtures, "consistent"), [dotnetCollector]);
  assert.deepEqual(consistent.runtimes[0]!.releases, ["8.0"]);
  assert.equal(consistent.runtimes[0]!.drifted, false);
});

test("drift --check exits 1 on drift and 0 on a consistent repository", async () => {
  const drifted = await run("drift", resolve(fixtures, "drifted"), "--runtime", "dotnet", "--check");
  assert.equal(drifted.code, 1, drifted.stdout + drifted.stderr);
  assert.match(drifted.stdout, /DRIFT/);

  const consistent = await run("drift", resolve(fixtures, "consistent"), "--runtime", "dotnet", "--check");
  assert.equal(consistent.code, 0, consistent.stdout + consistent.stderr);
  assert.doesNotMatch(consistent.stdout, /DRIFT/);
});

test("drift --json matches the drift schema and is byte-identical across runs", async () => {
  const root = resolve(fixtures, "drifted");
  const first = await run("drift", root, "--runtime", "dotnet", "--json");
  const second = await run("drift", root, "--runtime", "dotnet", "--json");
  assert.equal(first.code, 0, first.stderr);
  assert.equal(first.stdout, second.stdout);

  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const document = JSON.parse(first.stdout);
  assert.equal(validate(document), true, JSON.stringify(validate.errors));
  assert.equal(document.schemaVersion, "evergreen.drift.v1");
  assert.equal(document.runtimes[0].runtime, "dotnet");

  assert.equal(validate({ ...document, undeclared: true }), false);
});

test("bad flags and --align without --runtime exit 2", async () => {
  const root = resolve(fixtures, "drifted");
  assert.equal((await run("drift", root, "--bogus")).code, 2);
  assert.equal((await run("drift", root, "--align", "8.0")).code, 2);
  assert.equal((await run("drift", root, "--runtime", "cobol")).code, 2);
});

test("--align patches apply, remove the drift, and refuse multi-targeting and properties", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "evergreen-drift-dotnet-"));
  try {
    await cp(resolve(fixtures, "align"), temporary, { recursive: true });
    const git = (...args: string[]) => spawnSync("git", args, { cwd: temporary, encoding: "utf8" });
    assert.equal(git("init", "-q").status, 0);
    git("config", "user.email", "fixture@example.com");
    git("config", "user.name", "Fixture");
    assert.equal(git("add", ".").status, 0);
    assert.equal(git("commit", "-qm", "fixture").status, 0);

    const aligned = await run("drift", temporary, "--runtime", "dotnet", "--align", "8.0");
    assert.equal(aligned.code, 0, aligned.stderr);
    assert.match(aligned.stderr, /Refused Directory\.Build\.props:\d+ \(TargetFrameworks/);
    assert.match(aligned.stderr, /Refused Property\/Property\.csproj:\d+ \(TargetFramework/);
    assert.match(aligned.stdout, /^\+\+\+ b\/global\.json/m);
    assert.match(aligned.stdout, /^\+\+\+ b\/Dockerfile/m);
    assert.match(aligned.stdout, /^\+\+\+ b\/\.github\/workflows\/ci\.yml/m);
    assert.match(aligned.stdout, /^\+\+\+ b\/App\/App\.csproj/m);

    const patch = join(temporary, "..", `${basename(temporary)}.patch`);
    await writeFile(patch, aligned.stdout);
    const applied = spawnSync("git", ["apply", "--check", patch], { cwd: temporary, encoding: "utf8" });
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(spawnSync("git", ["apply", patch], { cwd: temporary, encoding: "utf8" }).status, 0);

    const checked = await run("drift", temporary, "--runtime", "dotnet", "--check");
    assert.equal(checked.code, 0, checked.stdout + checked.stderr);

    const globalJson = await readFile(join(temporary, "global.json"), "utf8");
    assert.match(globalJson, /"version": "8\.0"/);
    assert.match(globalJson, /"rollForward": "latestPatch"/);
    assert.match(
      await readFile(join(temporary, "App/App.csproj"), "utf8"),
      /<TargetFramework>net8\.0<\/TargetFramework>/,
    );
    assert.match(await readFile(join(temporary, "Dockerfile"), "utf8"), /dotnet\/sdk:8\.0-alpine/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("the walk classifies every file name and directory edge exactly once", async () => {
  const repo = await mkdtemp(join(tmpdir(), "evergreen-drift-dotnet-kinds-"));
  temporaryRoots.push(repo);
  const files: Record<string, string> = {
    "config.yml": "jobs:\n  t:\n    docker:\n      - image: mcr.microsoft.com/dotnet/sdk:6.0\n",
    ".circleci/config.yml": "version: 2\njobs:\n  t:\n    docker:\n      - image: mcr.microsoft.com/dotnet/sdk:8.0\n",
    "azure-pipelines.yaml": "container: mcr.microsoft.com/dotnet/sdk:9.0\n",
    ".github/workflows/ci.yml":
      "jobs:\n  t:\n    steps:\n      - uses: actions/setup-dotnet@v4\n        with:\n          dotnet-version: '8.0.x'\n",
    ".github/workflows/nested/deep.yml":
      "jobs:\n  t:\n    steps:\n      - uses: actions/setup-dotnet@v4\n        with:\n          dotnet-version: '6.0.x'\n",
    "api/App.fsproj": "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n",
    "sdk.Dockerfile": "FROM mcr.microsoft.com/dotnet/sdk:10.0\n",
    "notes.md": "# mcr.microsoft.com/dotnet/sdk:7.0\n",
  };
  for (const [path, contents] of Object.entries(files)) {
    const target = join(repo, path);
    await mkdir(target.slice(0, target.lastIndexOf("/")), { recursive: true });
    await writeFile(target, contents);
  }

  const pins = await dotnetCollector.collect(repo);
  assert.deepEqual(pins.map((entry) => `${entry.path} ${entry.source}`).sort(), [
    ".circleci/config.yml CircleCI image",
    ".github/workflows/ci.yml actions/setup-dotnet dotnet-version",
    "api/App.fsproj TargetFramework",
    "azure-pipelines.yaml Azure Pipelines container",
    "sdk.Dockerfile sdk.Dockerfile FROM",
  ]);
});

test("a netstandard target is a compatibility contract, not a runtime, and is never drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-netstandard-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "lib"), { recursive: true });
  await mkdir(join(root, "app"), { recursive: true });
  await writeFile(
    join(root, "lib", "Lib.csproj"),
    "<Project><PropertyGroup><TargetFramework>netstandard2.0</TargetFramework></PropertyGroup></Project>\n",
  );
  await writeFile(
    join(root, "app", "App.csproj"),
    "<Project><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>\n",
  );
  const runtime = (await analyzeDrift(root, [dotnetCollector])).runtimes[0]!;
  assert.deepEqual(runtime.releases, ["8.0"]);
  assert.equal(runtime.drifted, false);
  const standard = runtime.pins.find((pin) => pin.raw === "netstandard2.0");
  assert.equal(standard?.release, undefined);
  assert.match(standard?.unresolved ?? "", /compatibility contract/);
});

test("the setup-dotnet steps of one job install SDKs side by side and are alternatives", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-setup-dotnet-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  const step = (version: string): string =>
    `      - uses: actions/setup-dotnet@v4\n        with:\n          dotnet-version: ${version}\n`;
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    `jobs:\n  build:\n    steps:\n${step("8.0.x")}${step("9.0.x")}${step("10.0.x")}`,
  );
  await writeFile(join(root, "global.json"), '{ "sdk": { "version": "9.0.100" } }\n');
  assert.equal((await analyzeDrift(root, [dotnetCollector])).runtimes[0]!.drifted, false);
  await writeFile(join(root, "global.json"), '{ "sdk": { "version": "6.0.100" } }\n');
  assert.equal((await analyzeDrift(root, [dotnetCollector])).runtimes[0]!.drifted, true);
});
