import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  formatVers,
  hasVersionScheme,
  normalizeVers,
  parseVers,
  parseVersLenient,
  versContains,
  VersError,
  versionScheme,
} from "../src/vers.js";

interface SpecTest {
  description: string;
  test_type: string;
  input: unknown;
  expected_output?: unknown;
  expected_failure?: boolean;
  expected_message?: string;
}

async function vectors(name: string): Promise<SpecTest[]> {
  const file = JSON.parse(await readFile(resolve("tests/fixtures/vers", name), "utf8")) as { tests: SpecTest[] };
  return file.tests;
}

test("passes the VERS canonical parse vectors", async (t) => {
  for (const vector of await vectors("vers_canonical_parse_test.json")) {
    const input = vector.input as string;
    // Vectors run once their scheme is registered (npm arrives with the semver comparator).
    const scheme = /^vers:([^/]+)\//.exec(input)?.[1];
    if (!scheme || !hasVersionScheme(scheme)) continue;
    await t.test(vector.description, () => {
      if (vector.expected_failure) {
        assert.throws(() => parseVers(input), (error: unknown) => {
          assert.ok(error instanceof VersError);
          assert.match(error.message, new RegExp(vector.expected_message!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
          return true;
        });
        return;
      }
      const expected = vector.expected_output as { type: string; constraints: [string, string][] };
      const parsed = parseVers(input);
      assert.equal(parsed.scheme, expected.type);
      assert.deepEqual(
        parsed.constraints.map(({ comparator, version }) => [comparator, version]),
        expected.constraints,
      );
    });
  }
});

test("passes the VERS intdot comparison and containment vectors", async (t) => {
  const intdot = versionScheme("intdot");
  for (const vector of await vectors("intdot_version_cmp_test.json")) {
    await t.test(vector.description, () => {
      const input = vector.input as { versions?: string[]; version?: string; vers?: string };
      if (vector.test_type === "equality") {
        const [left, right] = input.versions!;
        assert.equal(intdot.compare(left!, right!) === 0, vector.expected_output);
      } else if (vector.test_type === "comparison") {
        const sorted = [...input.versions!].sort((left, right) => intdot.compare(left, right));
        assert.deepEqual(sorted, vector.expected_output);
      } else {
        assert.equal(versContains(input.vers!, input.version!), vector.expected_output);
      }
    });
  }
});

test("lenient parsing sorts constraints and accepts explicit equality", () => {
  assert.equal(normalizeVers("vers:intdot/ >=3.0 | =2.0.3 "), "vers:intdot/2.0.3|>=3.0");
});

test("formats ranges canonically and round-trips them", () => {
  for (const value of ["vers:intdot/*", "vers:intdot/1.0", "vers:intdot/>=1.2|<2.0", "vers:intdot/<1.0|>=2.0|!=3.0"]) {
    assert.equal(formatVers(parseVers(value)), value);
  }
});

test("rejects invalid ranges", async (t) => {
  for (const [name, value] of [
    ["unknown scheme", "vers:nonexistent/1.0"],
    ["missing prefix", "intdot/1.0"],
    ["star with other constraints", "vers:intdot/*|1.0"],
    ["duplicate version", "vers:intdot/>=1.0|<1.0"],
    ["two lower bounds", "vers:intdot/>=1.0|>2.0"],
    ["two upper bounds", "vers:intdot/<1.0|<=2.0"],
    ["equality followed by an upper bound", "vers:intdot/1.0|<2.0"],
    ["invalid version", "vers:intdot/>=abc"],
  ] as const) {
    await t.test(name, () => assert.throws(() => parseVersLenient(value), Error));
  }
});

test("follows the containment procedure for bounds, equality, and exclusions", () => {
  assert.equal(versContains("vers:intdot/<2.0", "1.9"), true);
  assert.equal(versContains("vers:intdot/<2.0", "2.0"), false);
  assert.equal(versContains("vers:intdot/<=2.0", "2.0"), true);
  assert.equal(versContains("vers:intdot/>2.0", "2.0"), false);
  assert.equal(versContains("vers:intdot/>=2.0", "2.0"), true);
  assert.equal(versContains("vers:intdot/<1.0|>=2.0", "1.5"), false);
  assert.equal(versContains("vers:intdot/<1.0|>=2.0", "0.5"), true);
  assert.equal(versContains("vers:intdot/<1.0|>=2.0", "3.0"), true);
  assert.equal(versContains("vers:intdot/>=1.0|!=1.5|<2.0", "1.5"), false);
  assert.equal(versContains("vers:intdot/>=1.0|!=1.5|<2.0", "1.6"), true);
  assert.equal(versContains("vers:intdot/1.0|2.0", "2.0"), true);
  assert.equal(versContains("vers:intdot/1.0|2.0", "1.5"), false);
  assert.equal(versContains("vers:intdot/*", "9.9"), true);
});
