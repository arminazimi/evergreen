import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift, compareReleases } from "../src/drift/index.js";
import type { DriftCollector, RuntimePin } from "../src/drift/types.js";
import { runCli } from "./cli-runner.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function pin(path: string, line: number, source: string, raw: string, kind: "pin" | "floor", release?: string, unresolved?: string): RuntimePin {
  return {
    path,
    line,
    source,
    raw,
    kind,
    ...(release === undefined ? {} : { release }),
    ...(unresolved === undefined ? {} : { unresolved }),
  };
}

function fakeCollector(runtime: string, pins: RuntimePin[]): DriftCollector {
  return { runtime, collect: async () => pins };
}

test("two pins on different releases are a drift, and pins and releases are ordered", async () => {
  const report = await analyzeDrift("/repo", [
    fakeCollector("example", [
      pin("z.txt", 4, "z", "22", "pin", "22"),
      pin("a.txt", 2, "a", "18", "pin", "18"),
      pin("a.txt", 1, "a", "18.19.0", "pin", "18"),
    ]),
  ]);
  assert.equal(report.schemaVersion, "evergreen.drift.v1");
  const [runtime] = report.runtimes;
  assert.ok(runtime);
  assert.deepEqual(runtime.pins.map((entry) => `${entry.path}:${entry.line}`), ["a.txt:1", "a.txt:2", "z.txt:4"]);
  assert.deepEqual(runtime.releases, ["18", "22"]);
  assert.equal(runtime.drifted, true);
});

test("one release across pins is not a drift", async () => {
  const report = await analyzeDrift("/repo", [fakeCollector("example", [pin("a", 1, "a", "18.17.0", "pin", "18"), pin("b", 1, "b", "18", "pin", "18")])]);
  assert.equal(report.runtimes[0]!.drifted, false);
  assert.deepEqual(report.runtimes[0]!.releases, ["18"]);
});

test("a floor above the lowest pinned release is a conflict; a floor at or below it is not", async () => {
  const report = await analyzeDrift("/repo", [
    fakeCollector("example", [
      pin("image", 1, "image", "18", "pin", "18"),
      pin("minimum", 1, "minimum", "20", "floor", "20"),
      pin("other", 2, "other", "18.1", "floor", "18"),
    ]),
  ]);
  const [runtime] = report.runtimes;
  assert.ok(runtime);
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.floorConflicts.map((entry) => entry.raw), ["20"]);
});

test("unresolved values are reported but never count as releases or conflicts", async () => {
  const report = await analyzeDrift("/repo", [
    fakeCollector("example", [
      pin("a", 1, "a", "lts/*", "pin", undefined, "`lts/*` names a channel, not a release"),
      pin("b", 2, "b", ">=18", "floor", undefined, "a range is not a release"),
    ]),
  ]);
  const [runtime] = report.runtimes;
  assert.ok(runtime);
  assert.deepEqual(runtime.releases, []);
  assert.equal(runtime.drifted, false);
  assert.deepEqual(runtime.floorConflicts, []);
  assert.equal(runtime.pins[0]!.unresolved, "`lts/*` names a channel, not a release");
});

test("a runtime with no pins is left out, and runtimes are ordered by id", async () => {
  const report = await analyzeDrift("/repo", [
    fakeCollector("python", [pin("a", 1, "a", "3.12", "pin", "3.12")]),
    fakeCollector("empty", []),
    fakeCollector("go", [pin("b", 1, "b", "1.22", "pin", "1.22")]),
  ]);
  assert.deepEqual(report.runtimes.map((runtime) => runtime.runtime), ["go", "python"]);
});

test("analyzeDrift is deterministic for the same input", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-"));
  temporaryRoots.push(root);
  const collectors = [fakeCollector("example", [pin("b", 2, "b", "22", "pin", "22"), pin("a", 1, "a", "18", "pin", "18")])];
  assert.deepEqual(await analyzeDrift(root, collectors), await analyzeDrift(root, collectors));
});

test("compareReleases orders numeric parts and falls back to text", () => {
  assert.ok(compareReleases("3.9", "3.11") < 0);
  assert.equal(compareReleases("1.2", "1.2.0"), 0);
  assert.ok(compareReleases("1.21", "1.22") < 0);
  assert.ok(compareReleases("lts", "main") < 0);
});

test("drift --json validates against schemas/drift.v1.schema.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-drift-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "go.mod"), "module example.com/app\n\ngo 1.22.4\n");
  const result = await runCli(["drift", root, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(
    JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object,
  );
  assert.equal(validate(JSON.parse(result.stdout)), true, JSON.stringify(validate.errors));
});

test("a bad flag exits 2, and --align requires --runtime", async () => {
  const bad = await runCli(["drift", "--nope"]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Usage: evergreen drift/);
  const missing = await runCli(["drift", "--align", "1.22"]);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /--align requires --runtime/);
});
