import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parse as parseYaml } from "yaml";

import { COVERAGE_ENV } from "../tools/check-pipeline.js";
import {
  compareCoverage,
  DEFAULT_THRESHOLD,
  main,
  normalizeCoveragePath,
  parseLcov,
  renderCoverageDiffSummary,
  renderCoverageDiffText,
  runCoverageDiff,
  sourcePathToCoveragePath,
} from "../tools/coverage-diff.js";

function lcovRecord(path: string, hit: number, found: number): string {
  return ["TN:", `SF:${path}`, `LH:${hit}`, `LF:${found}`, "end_of_record", ""].join("\n");
}

test("normalizes absolute LCOV paths down to dist/", () => {
  assert.equal(normalizeCoveragePath("/home/runner/work/evergreen/evergreen/dist/src/engine.js"), "dist/src/engine.js");
  assert.equal(normalizeCoveragePath("C:\\a\\evergreen\\dist\\src\\cli.js", "C:\\a\\evergreen"), "dist/src/cli.js");
  assert.equal(normalizeCoveragePath("./dist/src/cli.js"), "dist/src/cli.js");
});

test("maps changed src files onto the compiled coverage paths", () => {
  assert.equal(sourcePathToCoveragePath("src/engine.ts"), "dist/src/engine.js");
  assert.equal(sourcePathToCoveragePath("src/detectors/npm.ts"), "dist/src/detectors/npm.js");
  assert.equal(sourcePathToCoveragePath("src/foo.mts"), "dist/src/foo.js");
  assert.equal(sourcePathToCoveragePath("tools/coverage-diff.ts"), undefined);
  assert.equal(sourcePathToCoveragePath("tests/coverage-diff.test.ts"), undefined);
  assert.equal(sourcePathToCoveragePath("README.md"), undefined);
});

test("parses per-file line percentages from LCOV", () => {
  const report = parseLcov(lcovRecord("/repo/dist/src/engine.js", 90, 100) + lcovRecord("dist/src/cli.js", 1, 4));
  assert.equal(report.get("dist/src/engine.js")?.percent, 90);
  assert.equal(report.get("dist/src/cli.js")?.percent, 25);
});

test("fails when a changed file loses more than one percentage point", () => {
  const base = parseLcov(lcovRecord("dist/src/engine.js", 95, 100) + lcovRecord("dist/src/cli.js", 80, 100));
  const head = parseLcov(lcovRecord("dist/src/engine.js", 93, 100) + lcovRecord("dist/src/cli.js", 79, 100));
  const result = compareCoverage({
    base,
    head,
    changedFiles: ["src/engine.ts", "src/cli.ts", "README.md"],
  });
  assert.equal(result.threshold, DEFAULT_THRESHOLD);
  assert.equal(result.passed, false);
  assert.deepEqual(
    result.regressions.map((item) => [item.sourcePath, item.drop]),
    [["src/engine.ts", 2]],
  );
  assert.equal(result.compared.length, 2);
  assert.match(renderCoverageDiffText(result), /Coverage diff failed/);
  assert.match(renderCoverageDiffSummary(result), /src\/engine\.ts/);
});

test("passes when the drop is at most one percentage point", () => {
  const base = parseLcov(lcovRecord("dist/src/engine.js", 95, 100));
  const head = parseLcov(lcovRecord("dist/src/engine.js", 94, 100));
  const result = compareCoverage({ base, head, changedFiles: ["src/engine.ts"] });
  assert.equal(result.passed, true);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.compared[0]?.drop, 1);
});

test("ignores pull requests that do not touch src/", () => {
  const base = parseLcov(lcovRecord("dist/src/engine.js", 95, 100));
  const head = parseLcov(lcovRecord("dist/src/engine.js", 10, 100));
  const result = compareCoverage({
    base,
    head,
    changedFiles: ["tools/coverage-diff.ts", ".github/workflows/ci.yml", "tests/coverage-diff.test.ts"],
  });
  assert.equal(result.passed, true);
  assert.equal(result.compared.length, 0);
  assert.match(renderCoverageDiffText(result), /No changed src\/ file/);
});

test("skips new src files that have no base coverage", () => {
  const base = parseLcov(lcovRecord("dist/src/engine.js", 95, 100));
  const head = parseLcov(lcovRecord("dist/src/engine.js", 95, 100) + lcovRecord("dist/src/new-file.js", 0, 10));
  const result = compareCoverage({ base, head, changedFiles: ["src/new-file.ts"] });
  assert.equal(result.passed, true);
  assert.deepEqual(result.skipped, ["src/new-file.ts"]);
  assert.equal(result.compared.length, 0);
});

test("runCoverageDiff reads files and appends a summary", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coverage-diff-"));
  const basePath = join(directory, "base.lcov");
  const headPath = join(directory, "head.lcov");
  const summaryPath = join(directory, "summary.md");
  const changedPath = join(directory, "changed.txt");
  await writeFile(basePath, lcovRecord("dist/src/engine.js", 90, 100));
  await writeFile(headPath, lcovRecord("dist/src/engine.js", 80, 100));
  await writeFile(changedPath, "src/engine.ts\ntools/ignore.ts\n");
  await writeFile(summaryPath, "# prior\n");

  const result = await runCoverageDiff({
    basePath,
    headPath,
    changedFiles: ["src/engine.ts"],
    summaryPath,
  });
  assert.equal(result.passed, false);
  assert.match(await readFile(summaryPath, "utf8"), /# prior[\s\S]*Coverage diff/);

  const code = await main(["--base", basePath, "--head", headPath, "--changed-files", changedPath, "--summary", summaryPath]);
  assert.equal(code, 1);
});

test("the CI workflow runs the suite once with coverage and reuses its LCOV", async () => {
  const workflow = parseYaml(await readFile(".github/workflows/ci.yml", "utf8")) as {
    jobs: {
      check: { steps: Array<Record<string, unknown>>; permissions?: Record<string, string> };
      "check-cross-os": { steps: Array<Record<string, unknown>> };
    };
  };
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.match(packageJson.scripts["test:coverage"]!, /test-reporter=lcov/);
  assert.match(packageJson.scripts["test:coverage"]!, /lcov\.info/);
  // The pull-request step no longer needs its own suite run for the diff.
  assert.equal(packageJson.scripts["test:coverage:lcov"], undefined);

  const steps = workflow.jobs.check.steps;
  const named = (pattern: RegExp): Record<string, unknown> | undefined =>
    steps.find((step) => typeof step.name === "string" && pattern.test(step.name));

  const check = named(/^npm run check$/);
  assert.ok(check);
  const checkEnv = check.env as Record<string, string>;
  // The Linux Node 24 job collects coverage while it runs its one suite; no other job does.
  assert.match(String(checkEnv[COVERAGE_ENV]), /runner\.os == 'Linux' && matrix\.node == 24/);
  assert.equal(
    workflow.jobs["check-cross-os"].steps.some((step) => (step.env as Record<string, string> | undefined)?.[COVERAGE_ENV] !== undefined),
    false,
  );

  const suiteRuns = steps.filter((step) => /test:coverage|run-tests\.mjs|--test\b/.test(String(step.run ?? "")));
  assert.deepEqual(
    suiteRuns.map((step) => String(step.run)),
    [],
  );

  // The floors run on every pull request too, not only on pushes to main.
  const thresholds = named(/coverage floors/i);
  assert.ok(thresholds);
  assert.match(String(thresholds.run), /coverage-thresholds\.js --lcov lcov\.info/);
  assert.doesNotMatch(String(thresholds.run), /test:coverage/);
  assert.equal(thresholds.if, "runner.os == 'Linux' && matrix.node == 24");

  const upload = named(/Upload coverage LCOV/i);
  assert.ok(upload);
  assert.equal((upload.with as Record<string, unknown>).path, "lcov.info");

  const diff = named(/Coverage diff/i);
  assert.ok(diff);
  assert.match(String(diff.run), /coverage-diff\.js/);
  assert.match(String(diff.run), /--head lcov\.info/);
  // No overall total may fall below main's report.
  assert.match(String(diff.run), /coverage-thresholds\.js --lcov lcov\.info --baseline /);
  assert.doesNotMatch(String(diff.run), /test:coverage/);
  assert.match(String(diff.run), /src\//);

  const badge = named(/coverage badge data/i);
  assert.ok(badge);
  assert.match(String(badge.run), /coverage-badge\.js --lcov lcov\.info/);

  assert.equal(workflow.jobs.check.permissions?.actions, "read");
});
