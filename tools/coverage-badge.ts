// Turns the test runner's coverage summary into a shields.io endpoint file.
//
//   node --test --experimental-test-coverage ... | node dist/tools/coverage-badge.js > coverage.json
//
// The CI workflow publishes the result to the `badges` branch; the README badge reads it from there.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
  const color = percent >= 90 ? "2F7D5B" : percent >= 80 ? "4C7C6D" : percent >= 70 ? "B89B3C" : percent >= 60 ? "C9822F" : "B84A3E";
  return { schemaVersion: 1, label: "coverage", message: `${Math.round(percent * 10) / 10}%`, color };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.stdout.write(`${JSON.stringify(badge(lineCoverage(readFileSync(0, "utf8"))), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}
