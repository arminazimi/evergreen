import assert from "node:assert/strict";
import { test } from "node:test";

import { badge, badgeFromLcov, lineCoverage } from "../tools/coverage-badge.js";

test("reads the line percentage from the coverage table", () => {
  assert.equal(
    lineCoverage("ℹ file | line % | branch %\nℹ all files                        |  94.33 |    88.48 |   94.53 |\n"),
    94.33,
  );
  assert.throws(() => lineCoverage("no table here"), /No 'all files'/);
});

test("reads line coverage from the LCOV report the single suite run writes", () => {
  const lcov = [
    "SF:dist/src/engine.js",
    "LH:90",
    "LF:100",
    "BRF:0",
    "BRH:0",
    "FNF:0",
    "FNH:0",
    "end_of_record",
    "SF:dist/src/cli.js",
    "LH:1",
    "LF:4",
    "BRF:0",
    "BRH:0",
    "FNF:0",
    "FNH:0",
    "end_of_record",
    "",
  ].join("\n");
  assert.deepEqual(badgeFromLcov(lcov), { schemaVersion: 1, label: "coverage", message: "87.5%", color: "4C7C6D" });
});

test("colors the badge by threshold", () => {
  assert.deepEqual(badge(94.33), { schemaVersion: 1, label: "coverage", message: "94.3%", color: "2F7D5B" });
  assert.equal(badge(85).color, "4C7C6D");
  assert.equal(badge(75).color, "B89B3C");
  assert.equal(badge(65).color, "C9822F");
  assert.equal(badge(10).color, "B84A3E");
});
