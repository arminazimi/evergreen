import { execFile } from "node:child_process";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { promisify } from "node:util";

import { builtInDetectors } from "../src/detectors/index.js";
import type { Finding } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { withRetries } from "./retry.js";
import { findingKey, scoreDetectors, violations } from "./thresholds.js";
import type { Thresholds } from "./thresholds.js";

const run = promisify(execFile);

interface ExpectedFinding {
  ruleId: string;
  path: string;
  line?: number;
}

interface CorpusEntry {
  repository: string;
  commit: string;
  ecosystem: "node" | "python" | "node-actions" | "container" | "go" | "java" | "kubernetes" | "php" | "ruby" | "rust" | "dotnet" | "swift";
  /** How the repository was chosen (decision 0013): "blind" by a rule fixed before scanning, "targeted" because it was known to contain a finding. */
  selection?: "blind" | "targeted";
  expected: ExpectedFinding[];
}

interface Corpus {
  schemaVersion: "evergreen.public-validation.v1";
  repositories: CorpusEntry[];
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(ordered.length * fraction) - 1);
  return ordered[index] ?? 0;
}

const observeOnly = process.argv.includes("--observe");
const corpus = JSON.parse(
  await readFile(resolve("benchmarks/public-repositories.json"), "utf8"),
) as Corpus;

if (corpus.repositories.length < 20) {
  throw new Error(`Expected at least 20 repositories, received ${corpus.repositories.length}.`);
}

const root = await mkdtemp(join(tmpdir(), "evergreen-public-validation-"));
const results: Array<{
  repository: string;
  commit: string;
  ecosystem: CorpusEntry["ecosystem"];
  checkoutMs: number;
  durationMs: number;
  findings: ExpectedFinding[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  unexpected: string[];
  missing: string[];
}> = [];

try {
  for (const [index, entry] of corpus.repositories.entries()) {
    const checkout = join(root, String(index));
    const checkoutStartedAt = performance.now();
    await run("git", ["init", "--quiet", checkout]);
    await withRetries(entry.repository, () =>
      run("git", ["-C", checkout, "fetch", "--quiet", "--depth", "1", `https://github.com/${entry.repository}.git`, entry.commit], {
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        maxBuffer: 10 * 1024 * 1024,
      }),
    );
    await run("git", ["-C", checkout, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    const checkoutMs = Number((performance.now() - checkoutStartedAt).toFixed(2));

    const startedAt = performance.now();
    const scan = await scanRepository(checkout, builtInDetectors);
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    const findings = scan.findings.map((finding: Finding) => ({
      ruleId: finding.ruleId,
      path: finding.location.path,
      ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
    }));
    const expected = new Set(entry.expected.map(findingKey));
    const actual = new Set(findings.map(findingKey));
    const truePositives = [...actual].filter((key) => expected.has(key)).length;
    results.push({
      repository: entry.repository,
      commit: entry.commit,
      ecosystem: entry.ecosystem,
      checkoutMs,
      durationMs,
      findings,
      truePositives,
      falsePositives: [...actual].filter((key) => !expected.has(key)).length,
      falseNegatives: [...expected].filter((key) => !actual.has(key)).length,
      unexpected: [...actual].filter((key) => !expected.has(key)).sort(),
      missing: [...expected].filter((key) => !actual.has(key)).sort(),
    });
  }

  const truePositives = results.reduce((total, result) => total + result.truePositives, 0);
  const falsePositives = results.reduce((total, result) => total + result.falsePositives, 0);
  const falseNegatives = results.reduce((total, result) => total + result.falseNegatives, 0);
  const durations = results.map((result) => result.durationMs);
  const checkoutDurations = results.map((result) => result.checkoutMs);
  const precision = truePositives + falsePositives === 0
    ? 1
    : truePositives / (truePositives + falsePositives);
  const recall = truePositives + falseNegatives === 0
    ? 1
    : truePositives / (truePositives + falseNegatives);
  const thresholds = JSON.parse(await readFile(resolve("benchmarks/thresholds.json"), "utf8")) as Thresholds;
  const detectors = scoreDetectors(results);
  const regressions = violations(detectors, thresholds);
  const report = {
    schemaVersion: "evergreen.public-validation-result.v1",
    mode: observeOnly ? "observe" : "verify",
    repositories: results,
    detectors,
    thresholdViolations: regressions,
    summary: {
      repositoryCount: results.length,
      findingCount: results.reduce((total, result) => total + result.findings.length, 0),
      truePositives,
      falsePositives,
      falseNegatives,
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      medianScanMs: Number(percentile(durations, 0.5).toFixed(2)),
      p95ScanMs: Number(percentile(durations, 0.95).toFixed(2)),
      slowestScanMs: Number(Math.max(...durations).toFixed(2)),
      medianCheckoutMs: Number(percentile(checkoutDurations, 0.5).toFixed(2)),
      p95CheckoutMs: Number(percentile(checkoutDurations, 0.95).toFixed(2)),
      slowestCheckoutMs: Number(Math.max(...checkoutDurations).toFixed(2)),
    },
  };

  console.log(JSON.stringify(report, null, 2));
  // Name every mismatch so a failed run says which repository and which finding, without opening the JSON.
  for (const result of results) {
    for (const key of result.unexpected) console.error(`UNEXPECTED ${result.repository}@${result.commit.slice(0, 10)}: ${key}`);
    for (const key of result.missing) console.error(`MISSING    ${result.repository}@${result.commit.slice(0, 10)}: ${key}`);
  }
  for (const regression of regressions) {
    console.error(`THRESHOLD  ${regression.detector}: precision ${regression.precision} is below the required ${regression.minPrecision}`);
  }
  if (!observeOnly && (falsePositives > 0 || falseNegatives > 0 || regressions.length > 0)) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
