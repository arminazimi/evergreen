import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseCircleci } from "../src/detectors/ci-images/parse-circleci.js";

type Expected = ReturnType<typeof parseCircleci>;
const read = (path: string): string => readFileSync(join("tests", "fixtures", "ci-images", path), "utf8");
const result = (declarations: Array<[string, number]>, unclassified: Array<[string, number, "dynamic" | "floating" | "orb-not-resolved"]> = []): Expected => ({
  declarations: declarations.map(([value, line]) => ({ value, line })),
  unclassified: unclassified.map(([value, line, reason]) => ({ value, line, reason })),
});

test("positive CircleCI images and orb are classified by local scope", () => {
  assert.deepEqual(parseCircleci(read("positive/.circleci/config.yml")), result([
    ["cimg/node:14.21", 7],
    ["ubuntu-2004:202201-01", 12],
    ["cimg/python:3.8", 18],
    ["ubuntu-2004:202201-01", 21],
  ], [["circleci/node@5.1.0", 3, "orb-not-resolved"]]));
});

test("negative CircleCI values classify dynamic/floating and ignore unrelated shapes", () => {
  assert.deepEqual(parseCircleci(read("negative/.circleci/config.yml")), result([], [
    ["circleci/node@5.1.0", 3, "orb-not-resolved"],
    ["<< parameters.image >>", 12, "dynamic"],
    ["<< pipeline.parameters.x >>", 13, "dynamic"],
    ["<< .Environment.X >>", 14, "dynamic"],
    ["$IMAGE", 15, "dynamic"],
    ["${IMAGE}", 16, "dynamic"],
    ["latest", 17, "floating"],
    ["ubuntu-latest", 18, "floating"],
    ["$(vmImage)", 23, "dynamic"],
  ]));
});

test("zero CircleCI current image is floating", () => {
  assert.deepEqual(parseCircleci(read("zero/.circleci/config.yml")), result([], [["cimg/node:current", 5, "floating"]]));
});

test("malformed CircleCI YAML returns empty", () => {
  assert.deepEqual(parseCircleci(read("malformed/.circleci/config.yml")), result([]));
});

test("real CircleCI shapes are read without evaluating parameters or workflows", () => {
  assert.deepEqual(parseCircleci(`version: 2.1
orbs:
  build: acme/build@1.0.0
jobs:
  build:
    docker:
      - image: cimg/node:20.0
      - image: redis:7
    machine: true
    executor: node/default
  parameterized:
    docker:
      - image: << parameters.image >>
    machine:
      image: ubuntu-22.04
  mapped:
    executor:
      name: local
      image: ignored:here
workflows:
  build:
    jobs:
      - build`), result([["cimg/node:20.0", 7], ["redis:7", 8], ["ubuntu-22.04", 15]], [["acme/build@1.0.0", 3, "orb-not-resolved"], ["<< parameters.image >>", 13, "dynamic"]]));
});

test("aliases and merge keys do not hide other local values", () => {
  assert.deepEqual(parseCircleci(`version: 2.1
defaults: &defaults
  docker:
    - image: ignored:alias
jobs:
  build:
    <<: *defaults
    docker:
      - image: cimg/node:20
      - image: *image
image: &image redis:7`), result([["cimg/node:20", 9]]));
});

test("machine true, orb-only executors, and non-string values are ignored", () => {
  assert.deepEqual(parseCircleci(`version: 2.1
orbs:
  node: circleci/node@5.1.0
jobs:
  only-orb:
    executor: node/default
  machine-job:
    machine: true
  bad:
    docker:
      - image: 42
      - image: { name: cimg/node:20 }`), result([], [["circleci/node@5.1.0", 3, "orb-not-resolved"]]));
});

test("junk, empty input, determinism, bounds, and lines are safe", () => {
  for (const input of ["", "\u0000\u0001", "}}}{{{", "image: *alias\n"]) assert.doesNotThrow(() => parseCircleci(input));
  const input = "jobs:\n  build:\n    docker:\n      - image: redis:7\n";
  const parsed = parseCircleci(input);
  assert.deepEqual(parseCircleci(input), parsed);
  assert.deepEqual(parsed.declarations, [{ value: "redis:7", line: 4 }]);
  assert.deepEqual(parseCircleci("x".repeat(MAXIMUM_INPUT_BYTES + 1)), result([]));
});
