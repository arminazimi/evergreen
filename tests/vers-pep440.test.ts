import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { versContains, VersError, versionScheme } from "../src/vers/index.js";

const pypi = versionScheme("pypi");

test("orders versions exactly as PEP 440 specifies", () => {
  // The ordering example from PEP 440's "Summary of permitted suffixes and relative ordering".
  const expected = [
    "1.dev0",
    "1.0.dev456",
    "1.0a1",
    "1.0a2.dev456",
    "1.0a12.dev456",
    "1.0a12",
    "1.0b1.dev456",
    "1.0b2",
    "1.0b2.post345.dev456",
    "1.0b2.post345",
    "1.0rc1.dev456",
    "1.0rc1",
    "1.0",
    "1.0+abc.5",
    "1.0+abc.7",
    "1.0+5",
    "1.0.post456.dev34",
    "1.0.post456",
    "1.0.15",
    "1.1.dev1",
  ];
  const shuffled = [...expected].reverse();
  assert.deepEqual(shuffled.sort((left, right) => pypi.compare(left, right)), expected);
});

test("normalizes equivalent spellings", () => {
  for (const [left, right] of [
    ["1.0", "1.0.0"],
    ["1.0alpha1", "1.0a1"],
    ["1.0-beta.2", "1.0b2"],
    ["1.0c1", "1.0rc1"],
    ["1.0-1", "1.0.post1"],
    ["1.0.rev1", "1.0.post1"],
    ["v1.0", "1.0"],
    ["1.0.DEV1", "1.0.dev1"],
    ["1.0+ABC", "1.0+abc"],
  ]) {
    assert.equal(pypi.compare(left!, right!), 0, `${left} == ${right}`);
  }
});

test("orders epochs before releases", () => {
  assert.ok(pypi.compare("1!0.1", "2024.10") > 0);
});

test("rejects invalid versions", () => {
  for (const value of ["latest", "1.0-final-final", "", "1..0"]) {
    assert.throws(() => pypi.compare(value, "1.0"), VersError, value);
  }
});

test("matches the Python runtime ranges Evergreen registry rules use", () => {
  assert.equal(versContains("vers:pypi/<3.10", "3.9"), true);
  assert.equal(versContains("vers:pypi/<3.10", "3.9.18"), true);
  assert.equal(versContains("vers:pypi/<3.10", "3.10"), false);
  assert.equal(versContains("vers:pypi/<3.10", "3.10.0rc1"), true);
  assert.equal(versContains("vers:pypi/*", "1.3.7"), true);
});

test("passes the VERS pypi containment vectors", async (t) => {
  const file = JSON.parse(await readFile(resolve("tests/fixtures/vers/pypi_range_containment_test.json"), "utf8")) as {
    tests: { description: string; input: { vers: string; version: string }; expected_output: boolean }[];
  };
  for (const vector of file.tests) {
    await t.test(`${vector.input.vers} contains ${vector.input.version}`, () =>
      assert.equal(versContains(vector.input.vers, vector.input.version), vector.expected_output));
  }
});
