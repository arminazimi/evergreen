import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  BASELINE_TOLERANCE,
  checkCoverageAgainstBase,
  checkCoverageFloors,
  lcovFiles,
  main,
  parseLcovTotals,
  readCoverageFloors,
  renderThresholdSummary,
  renderThresholdText,
  type CoverageFloors,
} from "../tools/coverage-thresholds.js";
import { COVERAGE_EXCLUDES } from "../tools/check-pipeline.js";

function record(
  path: string,
  lines: [number, number],
  branches: [number, number],
  functions: [number, number],
): string {
  return [
    "TN:",
    `SF:${path}`,
    `BRF:${branches[1]}`,
    `BRH:${branches[0]}`,
    `FNF:${functions[1]}`,
    `FNH:${functions[0]}`,
    `LF:${lines[1]}`,
    `LH:${lines[0]}`,
    "end_of_record",
    "",
  ].join("\n");
}

const LCOV =
  record("dist/src/engine.js", [90, 100], [40, 50], [45, 50]) + record("dist/src/cli.js", [10, 20], [10, 10], [5, 5]);

test("sums the LCOV counters into the totals node:test prints for all files", () => {
  const totals = parseLcovTotals(LCOV);
  assert.deepEqual(totals.lines, { hit: 100, found: 120, percent: totals.lines.percent });
  assert.equal(Math.round(totals.lines.percent * 100) / 100, 83.33);
  assert.deepEqual(totals.branches, { hit: 50, found: 60, percent: totals.branches.percent });
  assert.deepEqual(totals.functions, { hit: 50, found: 55, percent: totals.functions.percent });
});

test("a counter with nothing to measure counts as full coverage", () => {
  const totals = parseLcovTotals(record("dist/src/engine.js", [1, 2], [0, 0], [0, 0]));
  assert.equal(totals.branches.percent, 100);
  assert.equal(totals.functions.percent, 100);
});

test("an empty report fails instead of reporting full coverage", () => {
  assert.throws(() => parseLcovTotals(""), /No coverage records/);
});

test("floors pass at the limit and fail only below it", () => {
  const totals = parseLcovTotals(LCOV);
  const atLimit = checkCoverageFloors(totals, {
    lines: totals.lines.percent,
    branches: 80,
    functions: 80,
  });
  assert.equal(atLimit.passed, true);
  assert.deepEqual(atLimit.failures, []);

  const below = checkCoverageFloors(totals, { lines: 83.34, branches: 90, functions: 80 });
  assert.equal(below.passed, false);
  assert.deepEqual(
    below.failures.map((failure) => failure.metric),
    ["lines", "branches"],
  );
  assert.match(
    renderThresholdText(below, { lines: 83.34, branches: 90, functions: 80 }),
    /branches: 83\.33% \(floor 90\) FAIL/,
  );
  assert.match(renderThresholdSummary(below, { lines: 83.34, branches: 90, functions: 80 }), /below the 90% floor/);
});

test("readCoverageFloors rejects a missing or an out-of-range floor", () => {
  assert.deepEqual(readCoverageFloors('{"coverageFloors":{"lines":93,"branches":87,"functions":93}}'), {
    lines: 93,
    branches: 87,
    functions: 93,
  });
  assert.throws(() => readCoverageFloors("{}"), /coverageFloors/);
  assert.throws(() => readCoverageFloors('{"coverageFloors":{"lines":93,"branches":87}}'), /coverageFloors\.functions/);
  assert.throws(
    () => readCoverageFloors('{"coverageFloors":{"lines":93,"branches":87,"functions":101}}'),
    /between 0 and 100/,
  );
});

test("package.json keeps one set of floors for the local run and the CI gate", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
    coverageFloors: CoverageFloors;
  };
  const floors = readCoverageFloors(JSON.stringify(packageJson));
  assert.deepEqual(floors, packageJson.coverageFloors);
  for (const metric of ["lines", "branches", "functions"] as const) {
    assert.match(packageJson.scripts["test:coverage"]!, new RegExp(`--test-coverage-${metric}=${floors[metric]}\\b`));
  }
  // The coverage run adds the same exclusions, so the gate and the local run measure the same files.
  for (const path of COVERAGE_EXCLUDES) {
    assert.ok(packageJson.scripts["test:coverage"]!.includes(`--test-coverage-exclude="${path}"`), path);
  }
});

test("main fails the step and appends a summary when a floor is missed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coverage-thresholds-"));
  const lcovPath = join(directory, "lcov.info");
  const summaryPath = join(directory, "summary.md");
  try {
    await writeFile(summaryPath, "# prior\n");
    await writeFile(lcovPath, record("dist/src/engine.js", [99, 100], [95, 100], [99, 100]));
    assert.equal(await main(["--lcov", lcovPath, "--summary", summaryPath]), 0);
    assert.match(await readFile(summaryPath, "utf8"), /# prior[\s\S]*Coverage thresholds[\s\S]*Every floor holds/);

    await writeFile(lcovPath, record("dist/src/engine.js", [10, 100], [95, 100], [99, 100]));
    assert.equal(await main(["--lcov", lcovPath]), 1);
    await assert.rejects(() => main(["--bogus", "x"]), /Unknown argument/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a pull request may not lower a total below main, beyond the rounding tolerance", () => {
  const lcov = (linesFound: number, linesHit: number) =>
    `SF:src/a.ts\nFNF:1\nFNH:1\nLF:${linesFound}\nLH:${linesHit}\nBRF:10\nBRH:9\nend_of_record\n`;
  const base = parseLcovTotals(lcov(1000, 950));
  assert.deepEqual(checkCoverageAgainstBase(parseLcovTotals(lcov(1000, 950)), base), []);
  assert.deepEqual(checkCoverageAgainstBase(parseLcovTotals(lcov(1000, 951)), base), []);
  assert.ok(BASELINE_TOLERANCE > 0 && BASELINE_TOLERANCE < 0.1);
  const drops = checkCoverageAgainstBase(parseLcovTotals(lcov(1000, 940)), base);
  assert.deepEqual(
    drops.map((drop) => drop.metric),
    ["lines"],
  );
  assert.equal(drops[0]?.base, 95);
});

test("totals can be limited to the files two reports share", () => {
  const text = record("src/a.ts", [90, 100], [9, 10], [9, 10]) + record("src/b.ts", [100, 100], [10, 10], [10, 10]);
  assert.deepEqual([...lcovFiles(text)], ["src/a.ts", "src/b.ts"]);
  const onlyA = parseLcovTotals(text, new Set(["src/a.ts"]));
  assert.equal(onlyA.lines.found, 100);
  assert.equal(onlyA.lines.hit, 90);
  assert.equal(parseLcovTotals(text).lines.found, 200);
});

test("removing a well-covered file is not a drop below main, but a lower shared file still is", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coverage-base-"));
  try {
    const kept = (hit: number) => record("src/kept.ts", [hit, 100], [9, 10], [10, 10]);
    const removed = record("src/removed.ts", [1000, 1000], [100, 100], [100, 100]);
    const basePath = join(directory, "base.info");
    const headPath = join(directory, "head.info");
    await writeFile(basePath, kept(96) + removed);

    await writeFile(headPath, kept(96));
    assert.equal(await main(["--lcov", headPath, "--baseline", basePath]), 0);

    await writeFile(headPath, kept(94) + record("src/new.ts", [100, 100], [10, 10], [10, 10]));
    assert.equal(await main(["--lcov", headPath, "--baseline", basePath]), 1);

    await writeFile(headPath, record("src/new.ts", [100, 100], [10, 10], [10, 10]));
    assert.equal(await main(["--lcov", headPath, "--baseline", basePath]), 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
