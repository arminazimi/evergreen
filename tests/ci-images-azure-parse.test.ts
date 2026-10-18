import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseAzurePipelines } from "../src/detectors/ci-images/parse-azure-pipelines.js";

type Expected = ReturnType<typeof parseAzurePipelines>;
const read = (path: string): string => readFileSync(join("tests", "fixtures", "ci-images", path), "utf8");
const result = (declarations: Array<[string, number]>, unclassified: Array<[string, number, "dynamic" | "floating"]> = []): Expected => ({
  declarations: declarations.map(([value, line]) => ({ value, line })),
  unclassified: unclassified.map(([value, line, reason]) => ({ value, line, reason })),
});

test("positive Azure pipeline, stage, and job pool vmImage values", () => {
  assert.deepEqual(parseAzurePipelines(read("positive/azure-pipelines.yml")), result([
    ["ubuntu-20.04", 2],
    ["windows-2019", 7],
    ["macOS-12", 11],
  ]));
});

test("negative Azure values classify dynamic and floating forms", () => {
  assert.deepEqual(parseAzurePipelines(read("negative/azure-pipelines.yml")), result([], [
    ["$(vmImage)", 12, "dynamic"],
    ["${{ variables.image }}", 19, "dynamic"],
    ["ubuntu-latest", 22, "floating"],
    ["windows-latest", 25, "floating"],
  ]));
});

test("zero Azure vmImage is floating", () => {
  assert.deepEqual(parseAzurePipelines(read("zero/azure-pipelines.yml")), result([], [["ubuntu-latest", 2, "floating"]]));
});

test("malformed Azure YAML returns empty", () => {
  assert.deepEqual(parseAzurePipelines(read("malformed/azure-pipelines.yml")), result([]));
});

test("plain string pool, steps, containers, resources, and matrix vmImage are ignored", () => {
  assert.deepEqual(parseAzurePipelines(`pool: azure-latest
jobs:
  - job: A
    pool: my-pool
    steps:
      - script: echo hi
        pool:
          vmImage: ubuntu-20.04
  - job: B
    pool:
      name: self-hosted
  - job: C
    strategy:
      matrix:
        linux:
          vmImage: ubuntu-20.04
    pool:
      vmImage: windows-2019
resources:
  containers:
    - container: builder
      image: ubuntu:20.04
`), result([["windows-2019", 18]]));
});

test("dynamic and floating inline forms are unclassified", () => {
  assert.deepEqual(parseAzurePipelines(`pool:
  vmImage: $(image)
jobs:
  - job: A
    pool:
      vmImage: \${{ variables.image }}
  - job: B
    pool:
      vmImage: \${IMAGE}
  - job: C
    pool:
      vmImage: latest
  - job: D
    pool:
      vmImage: ubuntu-latest`), result([], [
    ["$(image)", 2, "dynamic"],
    ["${{ variables.image }}", 6, "dynamic"],
    ["${IMAGE}", 9, "dynamic"],
    ["latest", 12, "floating"],
    ["ubuntu-latest", 15, "floating"],
  ]));
});

test("root-level jobs are job-level declarations", () => {
  assert.deepEqual(parseAzurePipelines(`jobs:
  - job: Build
    pool:
      vmImage: ubuntu-20.04`), result([["ubuntu-20.04", 4]]));
});

test("junk, empty input, determinism, bounds, and lines are safe", () => {
  for (const input of ["", "\u0000\u0001", "}}}{{{", "pool: *alias\n"]) assert.doesNotThrow(() => parseAzurePipelines(input));
  const input = "pool:\n  vmImage: ubuntu-20.04\n";
  const parsed = parseAzurePipelines(input);
  assert.deepEqual(parseAzurePipelines(input), parsed);
  assert.deepEqual(parsed.declarations, [{ value: "ubuntu-20.04", line: 2 }]);
  assert.deepEqual(parseAzurePipelines("x".repeat(MAXIMUM_INPUT_BYTES + 1)), result([]));
});
