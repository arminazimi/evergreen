import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift, driftCollectors } from "../src/drift/index.js";
import { elixirDriftCollector, erlangDriftCollector } from "../src/drift/elixir.js";
import type { RuntimeDrift } from "../src/drift/types.js";
import { runCli } from "./cli-runner.js";

async function run(...args: string[]) {
  return runCli(args);
}

const fixture = (name: string) => resolve("tests/fixtures/drift/elixir", name);
const collect = async (name: string): Promise<[RuntimeDrift, RuntimeDrift]> => {
  const report = await analyzeDrift(fixture(name), [elixirDriftCollector, erlangDriftCollector]);
  const elixir = report.runtimes.find((runtime) => runtime.runtime === "elixir");
  const erlang = report.runtimes.find((runtime) => runtime.runtime === "erlang");
  assert.ok(elixir && erlang, `${name}: both runtimes must be reported`);
  return [elixir, erlang];
};

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function copyFixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `evergreen-drift-elixir-${name}-`));
  await cp(fixture(name), root, { recursive: true });
  roots.push(root);
  return root;
}

function atPath(runtime: RuntimeDrift, path: string, line: number) {
  return runtime.pins.filter((pin) => pin.path === path && pin.line === line);
}

test("collects every Elixir source the collector claims", async () => {
  const [elixir] = await collect("drifted");
  const pin = (path: string, source: string) => elixir.pins.find((item) => item.path === path && item.source === source);

  assert.deepEqual([pin(".elixir-version", ".elixir-version")?.raw, pin(".elixir-version", ".elixir-version")?.release], ["1.16.3", "1.16"]);
  assert.deepEqual([pin(".tool-versions", ".tool-versions")?.raw, pin(".tool-versions", ".tool-versions")?.release], ["1.15.7-otp-25", "1.15"]);
  assert.deepEqual([pin("Dockerfile", "Dockerfile FROM")?.raw, pin("Dockerfile", "Dockerfile FROM")?.release], ["1.16.3-otp-26-alpine", "1.16"]);
  assert.deepEqual([pin(".github/workflows/ci.yml", "GitHub Actions erlef/setup-beam elixir-version")?.release], ["1.17"]);
  assert.deepEqual([pin(".gitlab-ci.yml", "GitLab CI image")?.release], ["1.16"]);
  assert.deepEqual([pin(".circleci/config.yml", "CircleCI image")?.release], ["1.17"]);

  const floor = pin("mix.exs", "mix.exs elixir");
  assert.deepEqual([floor?.kind, floor?.line, floor?.raw, floor?.release], ["floor", 8, "~> 1.14", "1.14"]);
  assert.deepEqual(elixir.floorConflicts, []);

  const matrix = elixir.pins.filter((item) => item.source === "setup-beam elixir matrix");
  assert.deepEqual(matrix.map((item) => item.release), ["1.16", "1.17"]);
  assert.deepEqual([...new Set(matrix.map((item) => item.group))], ["setup-beam elixir matrix"]);

  assert.deepEqual(
    [...new Set(elixir.pins.map((item) => item.source))].sort(),
    [
      ".elixir-version",
      ".tool-versions",
      "CircleCI image",
      "Dockerfile FROM",
      "GitHub Actions erlef/setup-beam elixir-version",
      "GitLab CI image",
      "mix.exs elixir",
      "setup-beam elixir matrix",
    ].sort(),
  );
  assert.deepEqual(elixir.releases, ["1.15", "1.16", "1.17"]);
  assert.equal(elixir.drifted, true);
  assert.equal((await run("drift", fixture("drifted"), "--runtime", "elixir", "--check")).code, 1);
});

test("collects every Erlang/OTP source the collector claims", async () => {
  const [, erlang] = await collect("drifted");
  const pin = (path: string, source: string, line?: number) =>
    erlang.pins.find((item) => item.path === path && item.source === source && (line === undefined || item.line === line));

  assert.deepEqual([pin(".tool-versions", ".tool-versions", 2)?.raw, pin(".tool-versions", ".tool-versions", 2)?.release], ["25.3.2", "25"]);
  assert.deepEqual([pin(".tool-versions", ".tool-versions", 1)?.raw, pin(".tool-versions", ".tool-versions", 1)?.release], ["1.15.7-otp-25", "25"]);
  assert.deepEqual([pin(".github/workflows/ci.yml", "GitHub Actions erlef/setup-beam otp-version")?.raw, pin(".github/workflows/ci.yml", "GitHub Actions erlef/setup-beam otp-version")?.release], ["OTP-27.1.1", "27"]);
  assert.equal(pin("Dockerfile", "Dockerfile FROM", 1)?.release, "26");
  assert.equal(pin(".gitlab-ci.yml", "GitLab CI image")?.release, "26");
  assert.equal(pin(".circleci/config.yml", "CircleCI image")?.release, "27");

  const matrix = erlang.pins.filter((item) => item.source === "setup-beam otp matrix");
  assert.deepEqual(matrix.map((item) => item.release), ["26", "27"]);
  assert.deepEqual([...new Set(matrix.map((item) => item.group))], ["setup-beam otp matrix"]);

  assert.deepEqual(erlang.releases, ["25", "26", "27"]);
  assert.equal(erlang.drifted, true);
  assert.equal((await run("drift", fixture("drifted"), "--runtime", "erlang", "--check")).code, 1);
});

test("one hexpm/elixir tag feeds both collectors", async () => {
  const [elixir, erlang] = await collect("drifted");
  const tags: Array<readonly [string, number, string]> = [
    ["Dockerfile", 2, "1.17.3-erlang-27.1.1-alpine-3.20"],
    [".circleci/config.yml", 5, "1.17.3-erlang-27.1.1-debian-12"],
  ];
  for (const [path, line, raw] of tags) {
    const elixirPins = atPath(elixir, path, line);
    const erlangPins = atPath(erlang, path, line);
    assert.equal(elixirPins.length, 1, `${path}:${line} elixir`);
    assert.equal(elixirPins[0]?.raw, raw);
    assert.equal(elixirPins[0]?.release, "1.17");
    assert.equal(erlangPins.length, 1, `${path}:${line} erlang`);
    assert.equal(erlangPins[0]?.raw, raw);
    assert.equal(erlangPins[0]?.release, "27");
  }
});

test("a setup-beam matrix is a plan, not a drift", async () => {
  const [elixir, erlang] = await collect("matrix");
  assert.deepEqual(elixir.releases, ["1.16", "1.17"]);
  assert.equal(elixir.drifted, false);
  assert.deepEqual(erlang.releases, ["26", "27"]);
  assert.equal(erlang.drifted, false);
  assert.equal((await run("drift", fixture("matrix"), "--runtime", "elixir", "--check")).code, 0);
  assert.equal((await run("drift", fixture("matrix"), "--runtime", "erlang", "--check")).code, 0);
});

test("a mix.exs floor above the pinned release is a floor conflict", async () => {
  const [elixir, erlang] = await collect("floor-conflict");
  assert.deepEqual(elixir.releases, ["1.16"]);
  assert.equal(elixir.drifted, false);
  assert.deepEqual(elixir.floorConflicts.map((pin) => [pin.path, pin.line, pin.raw, pin.release]), [["mix.exs", 8, "~> 1.17", "1.17"]]);
  assert.deepEqual(erlang.floorConflicts, [], "mix.exs constrains Elixir, not OTP");
  const check = await run("drift", fixture("floor-conflict"), "--runtime", "elixir", "--check");
  assert.equal(check.code, 1);
  assert.match(check.stdout, /floor conflict: mix\.exs:8/);
});

test("a repository whose Elixir and OTP pins agree reports no drift", async () => {
  const [elixir, erlang] = await collect("consistent");
  assert.deepEqual(elixir.releases, ["1.16"]);
  assert.equal(elixir.drifted, false);
  assert.deepEqual(elixir.floorConflicts, []);
  assert.deepEqual(erlang.releases, ["26"]);
  assert.equal(erlang.drifted, false);
  assert.equal((await run("drift", fixture("consistent"), "--runtime", "elixir", "--check")).code, 0);
  assert.equal((await run("drift", fixture("consistent"), "--runtime", "erlang", "--check")).code, 0);
});

test("values Evergreen cannot resolve are reported with a reason and never guessed", async () => {
  const [elixir, erlang] = await collect("unresolved");
  for (const runtime of [elixir, erlang]) {
    for (const pin of runtime.pins) {
      if (pin.release === undefined) assert.ok(pin.unresolved, `${pin.path}:${pin.line} needs a reason`);
    }
  }

  const reason = (path: string, line: number) => atPath(elixir, path, line)[0]?.unresolved ?? "";
  assert.match(reason(".elixir-version", 1), /is not an Elixir version/);
  assert.match(reason(".tool-versions", 1), /is not an Elixir version/);
  assert.match(reason("mix.exs", 8), /states no minimum Elixir release/);
  assert.match(reason("Dockerfile", 1), /no tag/);
  assert.match(reason("Dockerfile", 2), /does not name an Elixir release/);
  assert.match(reason("Dockerfile", 3), /is not a hexpm\/elixir tag/);
  assert.match(reason(".github/workflows/ci.yml", 9), /expression/);
  assert.match(reason(".gitlab-ci.yml", 1), /does not name an Elixir release/);
  assert.match(atPath(erlang, ".tool-versions", 2)[0]?.unresolved ?? "", /is not an Erlang\/OTP version/);
  assert.match(atPath(erlang, ".github/workflows/ci.yml", 10)[0]?.unresolved ?? "", /is not an Erlang\/OTP version/);

  assert.deepEqual(elixir.releases, ["1.16"]);
  assert.equal(elixir.drifted, false);
  assert.deepEqual(erlang.releases, ["26"]);
  assert.equal(erlang.drifted, false);

  assert.equal(atPath(elixir, "Dockerfile", 4).length, 0, "the erlang image is not an Elixir source");
  assert.equal(atPath(erlang, "Dockerfile", 4).length, 0, "the erlang image is not an Erlang source either");
  assert.equal(elixir.pins.filter((pin) => pin.path === ".github/workflows/broken.yml").length, 0, "malformed YAML is skipped, not guessed");
});

test("align patches every understood source, applies cleanly, and removes the drift", async () => {
  const root = await copyFixture("align");
  const elixirAlign = await run("drift", root, "--runtime", "elixir", "--align", "1.17");
  assert.equal(elixirAlign.code, 0, elixirAlign.stderr);
  for (const file of [".elixir-version", ".tool-versions", "Dockerfile", ".gitlab-ci.yml", ".circleci/config.yml", ".github/workflows/ci.yml"]) {
    assert.ok(elixirAlign.stdout.includes(`+++ b/${file}`), file);
  }
  assert.match(elixirAlign.stderr, /Refused mix\.exs:8 \(mix\.exs elixir ~> 1\.15\)/);
  assert.doesNotMatch(elixirAlign.stdout, /^\+.*-erlang-/m);
  await apply(root, "elixir", elixirAlign.stdout);

  const erlangAlign = await run("drift", root, "--runtime", "erlang", "--align", "27");
  assert.equal(erlangAlign.code, 0, erlangAlign.stderr);
  assert.doesNotMatch(erlangAlign.stdout, /^\+.*-erlang-/m);
  await apply(root, "erlang", erlangAlign.stdout);

  assert.equal(await readFile(join(root, ".elixir-version"), "utf8"), "1.17-otp-27\n");
  assert.equal(await readFile(join(root, ".tool-versions"), "utf8"), "elixir 1.17-otp-27\nerlang 27\n");
  assert.equal(await readFile(join(root, "Dockerfile"), "utf8"), "FROM elixir:1.17-otp-27-alpine AS build\nFROM hexpm/elixir:1.17.3-erlang-27.1.1-alpine-3.20\nCOPY . /app\n");
  const workflow = await readFile(join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /elixir-version: "1\.17"/);
  assert.match(workflow, /otp-version: "27"/);
  assert.match(await readFile(join(root, ".gitlab-ci.yml"), "utf8"), /image: elixir:1\.17-otp-27-alpine/);
  assert.match(await readFile(join(root, ".circleci/config.yml"), "utf8"), /- image: elixir:1\.17-otp-27-alpine/);
  assert.match(await readFile(join(root, "mix.exs"), "utf8"), /elixir: "~> 1\.15"/);

  assert.equal((await run("drift", root, "--runtime", "elixir", "--check")).code, 0);
  assert.equal((await run("drift", root, "--runtime", "erlang", "--check")).code, 0);
  const recheck = await run("drift", root, "--check", "--json");
  assert.equal(recheck.code, 0, `${recheck.stdout}${recheck.stderr}`);
  const runtimes = (JSON.parse(recheck.stdout) as { runtimes: Array<{ runtime: string; releases: string[] }> }).runtimes;
  assert.deepEqual(runtimes.map((runtime) => [runtime.runtime, runtime.releases]), [["elixir", ["1.17"]], ["erlang", ["27"]]]);
});

test("align refuses hexpm/elixir tags, floors, and matrix values", async () => {
  const elixir = await run("drift", fixture("drifted"), "--runtime", "elixir", "--align", "1.18");
  assert.equal(elixir.code, 0, elixir.stderr);
  assert.match(elixir.stderr, /Refused Dockerfile:2 \(Dockerfile FROM 1\.17\.3-erlang-27\.1\.1-alpine-3\.20\)/);
  assert.match(elixir.stderr, /Refused \.circleci\/config\.yml:5 \(CircleCI image 1\.17\.3-erlang-27\.1\.1-debian-12\)/);
  assert.match(elixir.stderr, /Refused mix\.exs:8 \(mix\.exs elixir ~> 1\.14\)/);
  assert.match(elixir.stderr, /Refused \.github\/workflows\/ci\.yml:8 \(setup-beam elixir matrix 1\.16\)/);
  assert.doesNotMatch(elixir.stdout, /^\+.*-erlang-/m);

  const erlang = await run("drift", fixture("drifted"), "--runtime", "erlang", "--align", "28");
  assert.equal(erlang.code, 0, erlang.stderr);
  assert.match(erlang.stderr, /Refused Dockerfile:2 \(Dockerfile FROM 1\.17\.3-erlang-27\.1\.1-alpine-3\.20\)/);
  assert.doesNotMatch(erlang.stdout, /^\+.*-erlang-/m);
});

test("align never writes a file", async () => {
  const before = await readFile(join(fixture("align"), ".elixir-version"), "utf8");
  const aligned = await run("drift", fixture("align"), "--runtime", "elixir", "--align", "1.17");
  assert.equal(aligned.code, 0, aligned.stderr);
  assert.equal(await readFile(join(fixture("align"), ".elixir-version"), "utf8"), before);
});

test("empty, oversized, unreadable, and structurally odd inputs are skipped, not guessed", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-elixir-odd-"));
  roots.push(root);

  await writeFile(join(root, ".elixir-version"), "\n# managed by automation\n");
  await writeFile(join(root, ".tool-versions"), "nodejs 18.19.0\n\n# erlang 24\n");

  await mkdir(join(root, "huge/.github/workflows"), { recursive: true });
  const pad = "x".repeat(1024 * 1024 + 1);
  await writeFile(join(root, "huge/.elixir-version"), `1.16.3\n${pad}`);
  await writeFile(join(root, "huge/.tool-versions"), `elixir 1.16.3\n${pad}`);
  await writeFile(join(root, "huge/.github/workflows/huge.yml"), `# pad\n${pad}`);

  await mkdir(join(root, "node_modules/demo"), { recursive: true });
  await writeFile(join(root, "node_modules/demo/mix.exs"), 'def project do\n  [elixir: "~> 1.99"]\nend\n');

  await mkdir(join(root, "locked"));
  await writeFile(join(root, "locked/.tool-versions"), "not-a-tool 1.16\n");

  let deep = root;
  for (let index = 0; index < 9; index += 1) {
    deep = join(deep, `d${index}`);
    await mkdir(deep);
  }
  await writeFile(join(deep, ".elixir-version"), "1.16.3\n");

  await symlink(join(root, ".elixir-version"), join(root, "Dockerfile.link"));

  await mkdir(join(root, "many"));
  await mkdir(join(root, "more"));
  await Promise.all(Array.from({ length: 2000 }, (_, index) => writeFile(join(root, "many", `Dockerfile.${index}`), "")));
  await writeFile(join(root, "more", "Dockerfile.0"), "");

  await mkdir(join(root, ".github/workflows"), { recursive: true });
  await writeFile(
    join(root, ".github/workflows/odd.yml"),
    [
      "name: odd",
      "on: push",
      "jobs:",
      '  broken-job: "not-a-map"',
      "  no-steps:",
      "    runs-on: ubuntu-latest",
      "  weird-steps:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - 42",
      "      - uses: actions/checkout@v4",
      "      - uses: erlef/setup-beam@v1",
      "  only-otp:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: erlef/setup-beam@v1",
      "        with:",
      '          otp-version: "26"',
      "  matrix-ref:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: erlef/setup-beam@v1",
      "        with:",
      "          elixir-version: ${{ matrix.beam }}",
      '          otp-version: ""',
      "",
    ].join("\n"),
  );
  await writeFile(join(root, ".github/workflows/nojobs.yml"), "name: no jobs\non: push\nrun-name: odd\n");
  await writeFile(join(root, ".github/workflows/seq.yml"), "- just\n- a\n- sequence\n");

  await chmod(join(root, "locked"), 0o000);
  const report = await analyzeDrift(root, [elixirDriftCollector, erlangDriftCollector]);
  await chmod(join(root, "locked"), 0o755);

  const elixir = report.runtimes.find((runtime) => runtime.runtime === "elixir");
  const erlang = report.runtimes.find((runtime) => runtime.runtime === "erlang");
  assert.ok(elixir && erlang);

  const ignored = /^(?:huge\/|d\d\/|node_modules\/|more\/|Dockerfile\.link$)/;
  for (const runtime of [elixir, erlang]) {
    for (const pin of runtime.pins) assert.ok(!ignored.test(pin.path), `${pin.path} must not be read`);
  }
  const lockedReadable = await readdir(join(root, "locked")).then(() => true, () => false);
  if (!lockedReadable) {
    for (const runtime of [elixir, erlang]) {
      assert.equal(runtime.pins.filter((pin) => pin.path.startsWith("locked/")).length, 0, "an unreadable directory is skipped");
    }
  }

  assert.deepEqual(atPath(elixir, ".github/workflows/odd.yml", 24).map((pin) => [pin.source, pin.raw]), [["GitHub Actions erlef/setup-beam elixir-version", "${{ matrix.beam }}"]]);
  assert.match(atPath(elixir, ".github/workflows/odd.yml", 24)[0]?.unresolved ?? "", /expression/);
  assert.deepEqual(atPath(erlang, ".github/workflows/odd.yml", 18).map((pin) => [pin.raw, pin.release]), [["26", "26"]]);
  assert.deepEqual(elixir.releases, []);
  assert.equal(elixir.drifted, false);
  assert.deepEqual(erlang.releases, ["26"]);
  assert.equal(erlang.drifted, false);
  assert.equal((await run("drift", root, "--runtime", "elixir", "--check")).code, 0);
  assert.equal((await run("drift", root, "--runtime", "erlang", "--check")).code, 0);
});

test("align refuses values it cannot rewrite safely", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-elixir-refuse-"));
  roots.push(root);

  await writeFile(join(root, ".elixir-version"), "1.16\nmain # trunk\nalpha beta gamma\n");
  await writeFile(join(root, ".tool-versions"), "elixir 1.16.3 1.17.2-otp-26\nerlang 25.3.2 26\n");
  await writeFile(join(root, ".gitlab-ci.yml"), "image: elixir:latest\ntest:\n  script: mix test\n");
  await writeFile(
    join(root, "Dockerfile"),
    "FROM elixir:1.16\nFROM elixir:1.16.3-otp-25\nFROM elixir:1.16.3-otp-25-alpine@sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n",
  );
  await mkdir(join(root, ".github/workflows"), { recursive: true });
  await writeFile(
    join(root, ".github/workflows/ci.yml"),
    [
      "name: ci",
      "on: push",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: erlef/setup-beam@v1",
      "        with:",
      "          elixir-version: 1.16 extra",
      "          otp-version: 26 trailing",
      "",
    ].join("\n"),
  );

  const elixir = await run("drift", root, "--runtime", "elixir", "--align", "1.18");
  assert.equal(elixir.code, 0, elixir.stderr);
  assert.match(elixir.stdout, /^\+1\.18$/m);
  assert.match(elixir.stdout, /^\+FROM elixir:1\.18$/m);
  assert.match(elixir.stdout, /^\+FROM elixir:1\.18-otp-25$/m);
  assert.match(elixir.stderr, /Refused \.elixir-version:2 \(\.elixir-version main # trunk\)/);
  assert.match(elixir.stderr, /Refused \.elixir-version:3 \(\.elixir-version alpha beta gamma\)/);
  assert.match(elixir.stderr, /Refused \.tool-versions:1 \(\.tool-versions 1\.16\.3\)/);
  assert.match(elixir.stderr, /Refused \.tool-versions:1 \(\.tool-versions 1\.17\.2-otp-26\)/);
  assert.match(elixir.stderr, /Refused \.gitlab-ci\.yml:1 \(GitLab CI image latest\)/);
  assert.match(elixir.stderr, /Refused Dockerfile:3 \(Dockerfile FROM 1\.16\.3-otp-25-alpine\)/);
  assert.match(elixir.stderr, /Refused \.github\/workflows\/ci\.yml:9 \(GitHub Actions erlef\/setup-beam elixir-version 1\.16 extra\)/);

  const erlang = await run("drift", root, "--runtime", "erlang", "--align", "28");
  assert.equal(erlang.code, 0, erlang.stderr);
  assert.match(erlang.stdout, /^\+FROM elixir:1\.16\.3-otp-28$/m);
  assert.match(erlang.stderr, /Refused \.tool-versions:1 \(\.tool-versions 1\.17\.2-otp-26\)/);
  assert.match(erlang.stderr, /Refused \.tool-versions:2 \(\.tool-versions 25\.3\.2\)/);
  assert.match(erlang.stderr, /Refused \.tool-versions:2 \(\.tool-versions 26\)/);
  assert.match(erlang.stderr, /Refused \.github\/workflows\/ci\.yml:10 \(GitHub Actions erlef\/setup-beam otp-version 26 trailing\)/);

  const badElixir = await run("drift", root, "--runtime", "elixir", "--align", "1.16.3");
  assert.equal(badElixir.code, 0, badElixir.stderr);
  assert.doesNotMatch(badElixir.stdout, /^@@/m);
  assert.match(badElixir.stderr, /Refused \.elixir-version:1 \(\.elixir-version 1\.16\)/);

  const badErlang = await run("drift", root, "--runtime", "erlang", "--align", "26.1");
  assert.equal(badErlang.code, 0, badErlang.stderr);
  assert.doesNotMatch(badErlang.stdout, /^@@/m);
  assert.match(badErlang.stderr, /Refused \.tool-versions:2 \(\.tool-versions 26\)/);
});

async function apply(root: string, runtime: string, patch: string): Promise<void> {
  const patchFile = `${root}.${runtime}.patch`;
  await writeFile(patchFile, patch);
  spawnSync("git", ["init", "-q"], { cwd: root });
  const check = spawnSync("git", ["apply", "--check", patchFile], { cwd: root, encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(spawnSync("git", ["apply", patchFile], { cwd: root, encoding: "utf8" }).status, 0);
}

test("--json output conforms to the drift schema", async () => {
  const result = await run("drift", fixture("drifted"), "--json");
  assert.equal(result.code, 0, result.stderr);
  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("both collectors are registered in the drift index", async () => {
  const runtimes = driftCollectors.map((collector) => collector.runtime);
  assert.deepEqual(runtimes.filter((runtime) => runtime === "elixir" || runtime === "erlang"), ["elixir", "erlang"]);
  const unknown = await run("drift", fixture("consistent"), "--runtime", "elixir", "--check");
  assert.equal(unknown.code, 0, unknown.stderr);
  assert.equal(unknown.stderr, "");
});
