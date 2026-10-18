import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseGitlabCi } from "../src/detectors/ci-images/parse-gitlab-ci.js";

type Expected = ReturnType<typeof parseGitlabCi>;
const read = (path: string): string => readFileSync(join("tests", "fixtures", "ci-images", path), "utf8");
const unclassified = (entries: Array<[string, number, "dynamic" | "floating" | "gitlab-not-judged"]>): Expected => ({
  declarations: [],
  unclassified: entries.map(([value, line, reason]) => ({ value, line, reason })),
});

test("positive GitLab declarations are literal but unclassified", () => {
  assert.deepEqual(parseGitlabCi(read("positive/.gitlab-ci.yml")), unclassified([
    ["node:16.20.2", 1, "gitlab-not-judged"],
    ["postgres:12.17", 4, "gitlab-not-judged"],
    ["redis:6.2.14", 5, "gitlab-not-judged"],
    ["python:3.9.18", 8, "gitlab-not-judged"],
  ]));
});

test("negative GitLab values classify dynamic and floating forms, ignoring lookalikes", () => {
  assert.deepEqual(parseGitlabCi(read("negative/.gitlab-ci.yml")), unclassified([
    ["$IMAGE", 2, "dynamic"],
    ["${IMAGE}", 4, "dynamic"],
    ["latest", 5, "floating"],
  ]));
});

test("zero GitLab values are floating and unclassified", () => {
  assert.deepEqual(parseGitlabCi(read("zero/.gitlab-ci.yml")), unclassified([
    ["node:latest", 1, "floating"],
    ["postgres:latest", 3, "floating"],
    ["alpine:latest", 5, "floating"],
  ]));
});

test("malformed GitLab YAML returns no result", () => {
  assert.deepEqual(parseGitlabCi(read("malformed/.gitlab-ci.yml")), { declarations: [], unclassified: [] });
});

test("inline default, object image, hidden job, and local aliases", () => {
  assert.deepEqual(parseGitlabCi(`default:
  image:
    name: node:16
  services:
    - postgres:12
.template:
  image: alpine:3.18
job:
  image: *shared
shared: &shared redis:6`), unclassified([
    ["node:16", 3, "gitlab-not-judged"],
    ["postgres:12", 5, "gitlab-not-judged"],
    ["alpine:3.18", 7, "gitlab-not-judged"],
  ]));
});

test("junk, empty input, and aliased values never throw", () => {
  for (const input of ["", "\u0000\u0001\u0002", "}}}{{{", "image: *runner\n"]) {
    assert.doesNotThrow(() => parseGitlabCi(input));
  }
  assert.deepEqual(parseGitlabCi("image: node:16\nshared: &shared redis:6\njob:\n  image: *shared\n"), unclassified([["node:16", 1, "gitlab-not-judged"]]));
});

test("the result is deterministic and uses 1-based value lines", () => {
  const input = "image: node:16\nservices:\n  - redis:6\n";
  const result = parseGitlabCi(input);
  assert.deepEqual(parseGitlabCi(input), result);
  assert.deepEqual(result.unclassified.map(({ line }) => line), [1, 3]);
});

test("input over 1 MiB returns an empty result", () => {
  assert.deepEqual(parseGitlabCi("x".repeat(MAXIMUM_INPUT_BYTES + 1)), { declarations: [], unclassified: [] });
});
