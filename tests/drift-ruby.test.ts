import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift } from "../src/drift/index.js";
import { rubyDriftCollector } from "../src/drift/ruby.js";
import { runCli } from "./cli-runner.js";

async function run(...args: string[]) {
  return runCli(args);
}
const fixture = (name: string) => resolve("tests/fixtures/drift/ruby", name);
const collect = async (name: string) => (await analyzeDrift(fixture(name), [rubyDriftCollector])).runtimes[0]!;

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function copyFixture(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `evergreen-drift-ruby-${name}-`));
  await cp(fixture(name), root, { recursive: true });
  roots.push(root);
  return root;
}

test("collects every Ruby source the collector claims", async () => {
  const runtime = await collect("drifted");
  const pin = (path: string, source: string) =>
    runtime.pins.find((item) => item.path === path && item.source === source);

  assert.equal(pin(".ruby-version", ".ruby-version")?.release, "3.3");
  assert.equal(pin(".tool-versions", ".tool-versions")?.raw, "3.4.1");
  assert.equal(pin("Gemfile", "Gemfile ruby")?.kind, "pin");
  assert.equal(pin("Gemfile.lock", "Gemfile.lock RUBY VERSION")?.raw, "3.3.0p0");
  assert.equal(pin("Dockerfile", "Dockerfile FROM")?.raw, "3.4.1-slim");
  assert.equal(pin("Dockerfile", "Dockerfile RUN")?.release, "3.3");
  assert.equal(pin(".github/workflows/ci.yml", "GitHub Actions ruby/setup-ruby ruby-version")?.release, "3.4");
  assert.equal(pin(".gitlab-ci.yml", "GitLab CI image")?.release, "3.4");
  assert.equal(pin(".circleci/config.yml", "CircleCI image")?.release, "3.4");
  assert.equal(pin("demo.gemspec", "gemspec required_ruby_version")?.kind, "floor");
});

test("a Gemfile.lock that disagrees with .ruby-version is reported as drift", async () => {
  const runtime = await collect("drifted");
  assert.deepEqual(runtime.releases, ["3.3", "3.4"]);
  assert.equal(runtime.drifted, true);
  assert.equal((await run("drift", fixture("drifted"), "--runtime", "ruby", "--check")).code, 1);
});

test("a gemspec floor above the lowest pinned release is a floor conflict", async () => {
  const runtime = await collect("drifted");
  assert.deepEqual(
    runtime.floorConflicts.map((pin) => [pin.path, pin.release]),
    [["demo.gemspec", "3.5"]],
  );
});

test("a repository whose pins agree reports no drift and no floor conflict", async () => {
  const runtime = await collect("consistent");
  assert.deepEqual(runtime.releases, ["3.4"]);
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.floorConflicts, []);
  assert.equal((await run("drift", fixture("consistent"), "--runtime", "ruby", "--check")).code, 0);
});

test("Gemfile and gemspec requirements are floors, not pins", async () => {
  const runtime = await collect("floors");
  const bySource = new Map(runtime.pins.map((pin) => [pin.source, pin]));
  assert.deepEqual(
    [bySource.get("Gemfile ruby")?.kind, bySource.get("Gemfile ruby")?.raw, bySource.get("Gemfile ruby")?.release],
    ["floor", ">= 3.1.0", "3.1"],
  );
  assert.deepEqual(
    [
      bySource.get("gemspec required_ruby_version")?.kind,
      bySource.get("gemspec required_ruby_version")?.raw,
      bySource.get("gemspec required_ruby_version")?.release,
    ],
    ["floor", "~> 3.2", "3.2"],
  );
  assert.deepEqual(runtime.releases, []);
  assert.equal(runtime.drifted, false);
});

test("values that cannot be resolved offline are reported with a reason", async () => {
  const runtime = await collect("unresolved");
  assert.deepEqual(runtime.releases, []);
  assert.equal(runtime.drifted, false);
  assert.equal(runtime.pins.length, 4);
  for (const pin of runtime.pins) {
    assert.equal(pin.release, undefined);
    assert.ok(pin.unresolved, `${pin.source} has no unresolved reason`);
  }
  assert.match(
    runtime.pins.find((pin) => pin.source === "GitHub Actions ruby/setup-ruby ruby-version")?.unresolved ?? "",
    /expression/,
  );
  assert.match(runtime.pins.find((pin) => pin.source === "Dockerfile FROM")?.unresolved ?? "", /no tag/);
});

test("align prints patches that git apply accepts, and a second check passes", async () => {
  const root = await copyFixture("alignable");
  const patchFile = `${root}.patch`;
  const aligned = await run("drift", root, "--runtime", "ruby", "--align", "3.4");
  assert.equal(aligned.code, 0, aligned.stderr);
  assert.equal(aligned.stderr, "");
  await writeFile(patchFile, aligned.stdout);

  spawnSync("git", ["init", "-q"], { cwd: root });
  const check = spawnSync("git", ["apply", "--check", patchFile], { cwd: root, encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
  assert.equal(spawnSync("git", ["apply", patchFile], { cwd: root, encoding: "utf8" }).status, 0);

  const recheck = await run("drift", root, "--runtime", "ruby", "--check");
  assert.equal(recheck.code, 0, `${recheck.stdout}${recheck.stderr}`);
  assert.equal(await readFile(join(root, "Dockerfile"), "utf8"), "FROM ruby:3.4-slim\n");
  assert.equal(await readFile(join(root, ".ruby-version"), "utf8"), "3.4\n");
  assert.match(await readFile(join(root, ".github/workflows/ci.yml"), "utf8"), /ruby-version: "3\.4"/);
  assert.match(await readFile(join(root, ".circleci/config.yml"), "utf8"), /cimg\/ruby:3\.4/);
});

test("align reports the lockfile but never patches it", async () => {
  const aligned = await run("drift", fixture("drifted"), "--runtime", "ruby", "--align", "3.4");
  assert.equal(aligned.code, 0, aligned.stderr);
  assert.match(aligned.stderr, /Refused Gemfile\.lock:11/);
  assert.match(aligned.stderr, /Refused demo\.gemspec:3/);
  assert.doesNotMatch(aligned.stdout, /Gemfile\.lock/);
  assert.match(aligned.stdout, /\+\+\+ b\/\.ruby-version/);
});

test("--json output conforms to the drift schema", async () => {
  const result = await run("drift", fixture("drifted"), "--json");
  assert.equal(result.code, 0, result.stderr);
  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("the text report names the drift and the floor conflict", async () => {
  const text = (await run("drift", fixture("drifted"), "--runtime", "ruby")).stdout;
  assert.match(text, /releases: 3\.3, 3\.4[\s\S]*DRIFT/);
  assert.match(text, /floor conflict: demo\.gemspec:3/);
});

test("drift code never spawns a process or uses the network", async () => {
  const files = (await readdir(resolve("src/drift"))).filter((name) => name.endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = await readFile(resolve("src/drift", name), "utf8");
    assert.doesNotMatch(source, /node:child_process|node:http|node:https|node:net|\bfetch\s*\(/, name);
  }
});
