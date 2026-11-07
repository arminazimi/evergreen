import assert from "node:assert/strict";
import { test } from "node:test";

import { allowedPhpLines } from "../src/detectors/php/parse-php-constraint.js";

test("a bounded constraint lists the release lines it allows", () => {
  assert.deepEqual(allowedPhpLines("^7.3"), ["7.3", "7.4"]);
  assert.deepEqual(allowedPhpLines("~7.2"), ["7.2", "7.3", "7.4"]);
  assert.deepEqual(allowedPhpLines("~7.2.5"), ["7.2"]);
  assert.deepEqual(allowedPhpLines("7.4.*"), ["7.4"]);
  assert.deepEqual(allowedPhpLines("7.4.33"), ["7.4"]);
  assert.deepEqual(allowedPhpLines(">=7.0 <7.3"), ["7.0", "7.1", "7.2"]);
  assert.deepEqual(allowedPhpLines(">=7.1,<8"), ["7.1", "7.2", "7.3", "7.4"]);
  assert.deepEqual(allowedPhpLines("7.0 - 7.2"), ["7.0", "7.1", "7.2"]);
  assert.deepEqual(allowedPhpLines("^7.1 || ^7.4"), ["7.1", "7.2", "7.3", "7.4"]);
  assert.deepEqual(allowedPhpLines("^8.0 || ^7.4"), ["7.4", "8.0", "8.1", "8.2", "8.3", "8.4", "8.5"]);
});

test("an unbounded, dynamic, or unreadable constraint lists nothing", () => {
  for (const constraint of [">=7.4", "*", "^7.3 || >=8.0", "dev-main", "^7.3 as 7.4", "not-a-version", ""]) {
    assert.equal(allowedPhpLines(constraint), undefined, constraint);
  }
});
