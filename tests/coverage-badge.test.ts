import assert from "node:assert/strict";
import { test } from "node:test";

import { badge, lineCoverage } from "../tools/coverage-badge.js";

test("reads the line percentage from the coverage table", () => {
  assert.equal(lineCoverage("ℹ file | line % | branch %\nℹ all files                        |  94.33 |    88.48 |   94.53 |\n"), 94.33);
  assert.throws(() => lineCoverage("no table here"), /No 'all files'/);
});

test("colors the badge by threshold", () => {
  assert.deepEqual(badge(94.33), { schemaVersion: 1, label: "coverage", message: "94.3%", color: "brightgreen" });
  assert.equal(badge(85).color, "green");
  assert.equal(badge(75).color, "yellow");
  assert.equal(badge(65).color, "orange");
  assert.equal(badge(10).color, "red");
});
