// Records a full corpus run: `npm run record:corpus-run`.
//
// It runs the whole corpus in verify mode and, only when the run is complete and clean, updates `lastFullRun`
// in benchmarks/thresholds.json and regenerates docs/dashboard/data.json, the accuracy table in docs/VALIDATION.md, and docs/llms-full.txt. The changes
// are left in the working tree for review; nothing is committed. Other flags (for example --concurrency or
// --offline) are passed to the harness; flags that narrow the run are refused.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { assertRecordable, buildFullRunRecord, findFilterFlag, withLastFullRun } from "./record-run.js";
import type { RecordableReport } from "./record-run.js";
import type { Thresholds } from "./thresholds.js";

const run = promisify(execFile);
const THRESHOLDS = resolve("benchmarks/thresholds.json");

function fail(message: string): never {
  console.error(message);
  process.exit(2);
}

const passthrough = process.argv.slice(2);
const narrowing = findFilterFlag(passthrough);
if (narrowing) fail(`Refusing to record: ${narrowing} narrows the run, and only a full run can be recorded.`);
for (const flag of ["--observe", "--warm", "--output", "--json", "--compare"]) {
  if (passthrough.includes(flag)) fail(`Refusing to record: ${flag} is not allowed here; the command runs the full corpus in verify mode.`);
}

const dirty = (await run("git", ["status", "--porcelain", "--untracked-files=no"])).stdout.trim();
if (dirty) fail(`Refusing to record: the working tree has uncommitted changes, so the recorded commit would not describe them.\n${dirty}`);
const commit = (await run("git", ["rev-parse", "--short", "HEAD"])).stdout.trim();
const date = new Date().toISOString().slice(0, 10);

const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8")) as { repositories: unknown[] };
const directory = await mkdtemp(join(tmpdir(), "evergreen-record-"));
try {
  const reportPath = join(directory, "report.json");
  console.error(`Running the full corpus (${corpus.repositories.length} repositories) in verify mode...`);
  let exitCode = 0;
  try {
    await run(process.execPath, [resolve("dist/benchmarks/public-repositories.js"), "--output", reportPath, ...passthrough], {
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // The harness exits 1 for false positives, false negatives, or a precision floor; its stderr names them.
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    exitCode = failure.code ?? 1;
    process.stderr.write(failure.stderr ?? "");
    process.stdout.write(failure.stdout ?? "");
  }
  const report = JSON.parse(await readFile(reportPath, "utf8").catch(() => "{}")) as RecordableReport;
  if (exitCode !== 0 && report.summary === undefined) fail(`Refusing to record: the corpus run failed (exit ${exitCode}) before it produced a report.`);
  try {
    assertRecordable(report, corpus.repositories.length);
    if (exitCode !== 0) throw new Error(`Refusing to record: the corpus run exited ${exitCode}.`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }

  const thresholdsText = await readFile(THRESHOLDS, "utf8");
  const thresholds = JSON.parse(thresholdsText) as Thresholds;
  const record = buildFullRunRecord(report, thresholds, { date, commit });
  await writeFile(THRESHOLDS, withLastFullRun(thresholdsText, record));
  await run(process.execPath, [resolve("dist/tools/build-dashboard-data.js"), "--today", "run-date"]);
  await run(process.execPath, [resolve("dist/tools/coverage-matrix.js")]);
  await run(process.execPath, [resolve("dist/tools/build-llms-full.js")]);
  console.log(`Recorded the full run of ${date} at ${commit}: ${record.repositories} repositories, ${record.findings} findings, precision ${record.precision}, recall ${record.recall}.`);
  console.log("Updated benchmarks/thresholds.json, docs/dashboard/data.json, docs/VALIDATION.md, and docs/llms-full.txt. Review the diff and commit it.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
