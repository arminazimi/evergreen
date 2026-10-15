import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { versContains, VersError, versionScheme } from "../src/vers/index.js";

const nuget = versionScheme("nuget");
const gem = versionScheme("gem");

test("passes every VERS nuget equality and comparison vector", async () => {
  const file = JSON.parse(await readFile(resolve("tests/fixtures/vers/nuget_version_cmp_test.json"), "utf8")) as {
    tests: { test_type: string; input: { versions: string[] }; expected_output: boolean | string[] }[];
  };
  assert.ok(file.tests.length >= 30);
  for (const vector of file.tests) {
    const versions = vector.input.versions;
    // The vectors spell pre-release labels in lowercase in expected output; NuGet labels are case-insensitive.
    const lower = (value: boolean | string[]) => (Array.isArray(value) ? value.map((item) => item.toLowerCase()) : value);
    const actual =
      vector.test_type === "equality"
        ? nuget.compare(versions[0]!, versions[1]!) === 0
        : [...versions].sort((left, right) => nuget.compare(left, right));
    assert.deepEqual(lower(actual), lower(vector.expected_output), JSON.stringify(versions));
  }
});

test("orders NuGet pre-releases and four-part versions", () => {
  const expected = ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0.1", "1.0.1", "2.0.0"];
  assert.deepEqual([...expected].reverse().sort((left, right) => nuget.compare(left, right)), expected);
});

test("rejects invalid NuGet versions", () => {
  for (const value of ["", "latest", "1.0.0.0.0", "1.0.0-"]) assert.throws(() => nuget.compare(value, "1.0"), VersError, value);
});

test("matches RubyGems Gem::Version on generated pairs", async () => {
  const file = JSON.parse(await readFile(resolve("tests/fixtures/vers/gem_version_cmp_test.json"), "utf8")) as {
    pairs: [string, string, number][];
  };
  assert.ok(file.pairs.length > 300);
  for (const [left, right, expected] of file.pairs) {
    assert.equal(Math.sign(gem.compare(left, right)), expected, `${left} <=> ${right}`);
  }
});

test("orders common gem releases and pre-releases", () => {
  const expected = ["1.0.a", "1.0.b", "1.0.rc1", "1.0", "1.0.1", "1.1", "2.0.pre", "2.0", "7.1.3", "10.0"];
  assert.deepEqual([...expected].reverse().sort((left, right) => gem.compare(left, right)), expected);
});

test("rejects invalid gem versions", () => {
  for (const value of ["", "latest", "1.0.", "v1"]) assert.throws(() => gem.compare(value, "1.0"), VersError, value);
});

test("matches the SDK and Ruby ranges Evergreen registry rules use", () => {
  assert.equal(versContains("vers:nuget/<6.0.0", "5.0.17"), true);
  assert.equal(versContains("vers:nuget/<6.0.0", "6.0.0"), false);
  assert.equal(versContains("vers:gem/<3.1", "3.0.7"), true);
  assert.equal(versContains("vers:gem/<3.1", "3.1.0"), false);
});
