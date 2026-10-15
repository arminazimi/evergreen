import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { versContains, VersError, versionScheme } from "../src/vers/index.js";

const maven = versionScheme("maven");

test("passes every VERS maven comparison and equality vector", async () => {
  const file = JSON.parse(await readFile(resolve("tests/fixtures/vers/maven_version_cmp_test.json"), "utf8")) as {
    tests: { test_type: string; input: { versions: string[] }; expected_output: boolean | string[] }[];
  };
  assert.ok(file.tests.length > 900);
  const failures: string[] = [];
  for (const vector of file.tests) {
    const versions = vector.input.versions;
    const actual =
      vector.test_type === "equality"
        ? maven.compare(versions[0]!, versions[1]!) === 0
        : [...versions].sort((left, right) => maven.compare(left, right));
    if (JSON.stringify(actual) !== JSON.stringify(vector.expected_output)) {
      failures.push(`${vector.test_type} ${JSON.stringify(versions)}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("orders common Java and Kotlin release versions", () => {
  const expected = [
    "1.0-alpha-1",
    "1.0-beta-2",
    "1.0-milestone-1",
    "1.0-rc1",
    "1.0-SNAPSHOT",
    "1.0",
    "1.0-sp1",
    "1.0.1",
    "1.1",
    "2.0",
    "17.0.1",
    "21",
  ];
  assert.deepEqual([...expected].reverse().sort((left, right) => maven.compare(left, right)), expected);
});

test("treats release aliases and trailing zeros as equal", () => {
  for (const [left, right] of [["1.0", "1"], ["1.0-ga", "1.0"], ["1.0-final", "1.0"], ["1-cr1", "1-rc1"], ["1.0.0", "1"]]) {
    assert.equal(maven.compare(left!, right!), 0, `${left} == ${right}`);
  }
});

test("rejects empty and whitespace versions", () => {
  for (const value of ["", " ", "1 0"]) assert.throws(() => maven.compare(value, "1.0"), VersError);
});

test("matches the JDK and Gradle ranges Evergreen registry rules use", () => {
  assert.equal(versContains("vers:maven/<17", "11.0.21"), true);
  assert.equal(versContains("vers:maven/<17", "17.0.1"), false);
  assert.equal(versContains("vers:maven/>=1.8|<9", "1.8.0_402"), true);
  assert.equal(versContains("vers:maven/<3.0.0", "2.7.18"), true);
});
