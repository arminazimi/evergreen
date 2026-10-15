import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateVersVersions, versContains, VersError, versionScheme } from "../src/vers/index.js";

const semver = versionScheme("semver");
const sorted = (values: string[]) => [...values].sort((left, right) => semver.compare(left, right));

test("serves the npm, cargo, golang, composer, and semver schemes", () => {
  for (const name of ["npm", "cargo", "golang", "composer", "semver"]) {
    assert.equal(versionScheme(name), semver);
  }
});

test("orders versions by Semantic Versioning precedence", () => {
  assert.deepEqual(
    sorted(["1.10.0", "1.2.0", "1.0.0", "1.0.0-rc.1", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-beta.11"]),
    ["1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.2.0", "1.10.0"],
  );
});

test("ignores build metadata and accepts Go and Composer version forms", () => {
  assert.equal(semver.compare("1.0.0+build.1", "1.0.0+build.2"), 0);
  assert.equal(semver.compare("v1.21.3", "1.21.3"), 0);
  assert.equal(semver.compare("1.2", "1.2.0"), 0);
  assert.equal(semver.compare("v2", "2.0.0"), 0);
  assert.ok(semver.compare("v0.0.0-20230101120000-abcdef123456", "0.0.1") < 0);
});

test("rejects invalid versions", () => {
  assert.throws(() => semver.compare("latest", "1.0.0"), VersError);
  assert.throws(() => validateVersVersions("vers:npm/<next"), VersError);
});

test("matches the ranges Evergreen registry rules use", () => {
  assert.equal(versContains("vers:npm/*", "2.88.2"), true);
  assert.equal(versContains("vers:semver/<5.0.0", "4.2.1"), true);
  assert.equal(versContains("vers:semver/<5.0.0", "5.0.0"), false);
  assert.equal(versContains("vers:semver/>=20.0.0|<21.0.0", "20.11.1"), true);
  assert.equal(versContains("vers:semver/>=20.0.0|<21.0.0", "21.0.0"), false);
  assert.equal(versContains("vers:semver/<18.0.0", "17.9.1"), true);
  assert.equal(versContains("vers:golang/<1.21.0", "v1.20.14"), true);
});

test("passes the VERS npm containment vectors", async () => {
  const file = JSON.parse(await readFile(resolve("tests/fixtures/vers/npm_range_containment_test.json"), "utf8")) as {
    tests: { input: { vers: string; version: string }; expected_output: boolean }[];
  };
  for (const vector of file.tests) {
    assert.equal(versContains(vector.input.vers, vector.input.version), vector.expected_output);
  }
});
