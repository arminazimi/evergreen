// Turns the test runner's coverage summary into a shields.io endpoint file.
//
//   node --test --experimental-test-coverage ... | node dist/tools/coverage-badge.js > coverage.json
//   node dist/tools/coverage-badge.js --lcov lcov.info > coverage.json
//
// CI reads the LCOV report its single coverage run wrote, so the badge needs no second test run.
// The CI workflow publishes the result to the `badges` branch; the README badge reads it from there.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { parseLcovTotals } from "./coverage-thresholds.js";

export interface Badge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/** Reads the "all files" row of the node:test coverage table and returns the line percentage. */
export function lineCoverage(report: string): number {
  const row = /all files\s*\|\s*([\d.]+)\s*\|/.exec(report);
  if (!row) throw new Error("No 'all files' coverage row found in the test output.");
  return Number(row[1]);
}

export function badge(percent: number): Badge {
  // Brand palette (brand/tokens.css) and the severity colors in src/badge.ts, so the row looks like one set.
  const color =
    percent >= 90
      ? "2F7D5B"
      : percent >= 80
        ? "4C7C6D"
        : percent >= 70
          ? "B89B3C"
          : percent >= 60
            ? "C9822F"
            : "B84A3E";
  return { schemaVersion: 1, label: "coverage", message: `${Math.round(percent * 10) / 10}%`, color };
}

/** The badge for the line coverage of an LCOV report, which CI already has from its one suite run. */
export function badgeFromLcov(lcov: string): Badge {
  return badge(parseLcovTotals(lcov).lines.percent);
}

/** Reads `--lcov <path>`; anything else is an error. */
function lcovPathFromArgv(argv: readonly string[]): string | undefined {
  if (argv.length === 0) return undefined;
  if (argv[0] !== "--lcov") throw new Error(`Unknown argument "${argv[0]}".`);
  const value = argv[1];
  if (value === undefined || value.startsWith("--") || argv.length > 2) {
    throw new Error("Usage: coverage-badge [--lcov <path>]");
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const lcovPath = lcovPathFromArgv(process.argv.slice(2));
    const result =
      lcovPath === undefined
        ? badge(lineCoverage(readFileSync(0, "utf8")))
        : badgeFromLcov(readFileSync(lcovPath, "utf8"));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
