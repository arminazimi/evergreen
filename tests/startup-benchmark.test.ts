import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

import { STARTUP_BUDGET, evaluateStartup, median } from "../benchmarks/startup.js";
import { VERSION } from "../src/version.js";

const cli = join(import.meta.dirname, "..", "src", "cli.js");

test("median handles odd and even sample counts", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test("the start-up evaluator reports only a median above the ceiling", () => {
  assert.deepEqual(evaluateStartup(STARTUP_BUDGET.maxMedianWallMs), []);
  const [violation] = evaluateStartup(STARTUP_BUDGET.maxMedianWallMs + 1);
  assert.match(violation ?? "", /exceeded the 400 ms budget/);
});

test("--version and -v print the version, and --help still wins", () => {
  for (const flag of ["--version", "-v"]) {
    const result = spawnSync(process.execPath, [cli, flag], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${VERSION}\n`);
  }
  const help = spawnSync(process.execPath, [cli, "--version", "--help"], { encoding: "utf8" });
  assert.match(help.stdout, /deprecation intelligence/);
});
