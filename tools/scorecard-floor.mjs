// Enforce the recorded OpenSSF Scorecard per-check targets (issue #2081).
//
// Reads one Scorecard results document — the JSON that `ossf/scorecard-action` writes
// with `results_format: json` (same `checks` shape the public Scorecard API serves) —
// and fails when a check scores below its recorded target, naming the check. It reads
// one file passed on the command line: no network, no child processes, and it never
// executes repository or fixture code.
//
// The targets only rise, never fall, without a written reason:
//
//   - Every entry in RECORDED_TARGETS carries a non-empty `reason`, and validateTargets()
//     refuses an entry without one, so an edited table cannot quietly drop a floor.
//   - Raising a number is a plain improvement. Lowering one means rewriting that entry's
//     reason with the written justification — pull request review enforces the text.
//
// A floor of -1 records a check that errored at baseline (Branch-Protection needs an
// admin token this workflow does not store; accepted in SECURITY.md). -1 is Scorecard's
// error value, not a score, so any later numeric result — even 0 — counts as a rise.

import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** Where the recorded numbers come from; re-measure before changing any floor. */
export const MEASUREMENT =
  "OpenSSF Scorecard run 41357434463 (2026-11-01T22:30:17Z, main at 435a5c15), " +
  "the 2026-11-01 baseline of docs/ADOPTION.md, re-measured from the published " +
  "result at api.securityscorecards.dev on 2026-11-04.";

/**
 * One recorded target. `floor` is the lowest score accepted since, i.e. the last
 * measured value; it starts at the baseline and may only be raised.
 * @typedef {object} Target
 * @property {string} check Scorecard check name, exactly as the results JSON spells it.
 * @property {number} floor Lowest accepted score, -1 (error) through 10.
 * @property {string} reason Written justification for this number.
 */

/** @type {readonly Target[]} */
export const RECORDED_TARGETS = Object.freeze([
  {
    check: "Binary-Artifacts",
    floor: 5,
    reason: "Baseline 2026-11-01: vendored tree-sitter wasm files are an accepted gap (docs/ADOPTION.md).",
  },
  {
    check: "Branch-Protection",
    floor: -1,
    reason:
      "Baseline 2026-11-01: -1 (error) because admin-only fields need a PAT this workflow does not store; accepted in SECURITY.md.",
  },
  {
    check: "CI-Tests",
    floor: 10,
    reason: "Baseline 2026-11-01: every merged pull request was checked by CI; hold at 10.",
  },
  {
    check: "CII-Best-Practices",
    floor: 5,
    reason: "Baseline 2026-11-01: Passing badge detected; Silver (#2079) will raise this floor to 7.",
  },
  {
    check: "Code-Review",
    floor: 0,
    reason:
      "Baseline 2026-11-01: approving reviews are deliberately not a merge gate (SECURITY.md); floor 0 only catches a check regression.",
  },
  {
    check: "Contributors",
    floor: 3,
    reason:
      "Baseline 2026-11-01: contributors from one organization; no repository change raises this (docs/ADOPTION.md).",
  },
  {
    check: "Dangerous-Workflow",
    floor: 10,
    reason: "Baseline 2026-11-01: clean; this check scored 0 on 2026-10-31, so a drop must fail the run.",
  },
  {
    check: "Dependency-Update-Tool",
    floor: 10,
    reason: "Baseline 2026-11-01: Dependabot configured in .github/dependabot.yml; hold at 10.",
  },
  {
    check: "Fuzzing",
    floor: 10,
    reason: "Baseline 2026-11-01: .github/workflows/fuzz.yml present; hold at 10.",
  },
  {
    check: "License",
    floor: 10,
    reason: "Baseline 2026-11-01: Apache-2.0 detected; hold at 10.",
  },
  {
    check: "Maintained",
    floor: 0,
    reason:
      "Baseline 2026-11-01: repository is younger than the 90-day window; the score lifts automatically (docs/ADOPTION.md).",
  },
  {
    check: "Packaging",
    floor: 10,
    reason: "Baseline 2026-11-01: publishing workflow detected; hold at 10.",
  },
  {
    check: "Pinned-Dependencies",
    floor: 3,
    reason:
      "Baseline 2026-11-01: 3 because unpinned example and test Dockerfiles count; this check fell 4 to 3 on 2026-10-31, so regressions must be visible.",
  },
  {
    check: "SAST",
    floor: 7,
    reason:
      "Baseline 2026-11-01: CodeQL configured but weekly, not per commit; hold at 7 until codeql.yml runs on pull requests.",
  },
  {
    check: "Security-Policy",
    floor: 10,
    reason: "Baseline 2026-11-01: SECURITY.md detected; hold at 10.",
  },
  {
    check: "Signed-Releases",
    floor: 2,
    reason:
      "Baseline 2026-11-01: 1 of the last 4 releases has provenance; release.yml signs now, so this floor rises as signed releases age in (docs/ADOPTION.md).",
  },
  {
    check: "Token-Permissions",
    floor: 10,
    reason: "Baseline 2026-11-01: read-only top-level permissions everywhere; hold at 10.",
  },
  {
    check: "Vulnerabilities",
    floor: 0,
    reason:
      "Baseline 2026-11-01: open OSV findings in shipped fixtures; the runtime audit is clean, floor 0 keeps the check listed and watchable.",
  },
]);

/** A message the command line turns into exit code 2 (inputs unusable, not a floor breach). */
export class ScorecardFloorError extends Error {}

/** @returns {string[]} every problem with the recorded table; empty when it is valid. */
export function validateTargets(targets) {
  const problems = [];
  const seen = new Set();
  for (const entry of targets) {
    if (typeof entry.check !== "string" || entry.check.trim() === "") {
      problems.push("a target has an empty check name");
      continue;
    }
    if (seen.has(entry.check)) problems.push(`${entry.check}: recorded twice`);
    seen.add(entry.check);
    if (!Number.isFinite(entry.floor) || entry.floor < -1 || entry.floor > 10) {
      problems.push(`${entry.check}: floor ${entry.floor} is not a number from -1 to 10`);
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      problems.push(`${entry.check}: a target may only change together with a written reason`);
    }
  }
  return problems;
}

/**
 * Read the `checks` array of a Scorecard results document into a name-to-score map.
 * @param {unknown} document parsed JSON of the results file.
 * @returns {Map<string, number>}
 */
export function parseScores(document) {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new ScorecardFloorError("results must be a JSON object with a checks array");
  }
  const checks = /** @type {{ checks?: unknown }} */ (document).checks;
  if (!Array.isArray(checks)) {
    throw new ScorecardFloorError("results file has no checks array");
  }
  const scores = new Map();
  for (const [index, entry] of checks.entries()) {
    if (typeof entry !== "object" || entry === null) {
      throw new ScorecardFloorError(`checks[${index}] is not an object`);
    }
    const check = /** @type {{ name?: unknown, score?: unknown }} */ (entry);
    if (typeof check.name !== "string" || check.name === "") {
      throw new ScorecardFloorError(`checks[${index}] has no name`);
    }
    if (typeof check.score !== "number" || !Number.isFinite(check.score)) {
      throw new ScorecardFloorError(`check ${check.name} has no numeric score`);
    }
    if (scores.has(check.name)) {
      throw new ScorecardFloorError(`check ${check.name} appears twice`);
    }
    scores.set(check.name, check.score);
  }
  return scores;
}

/**
 * Compare the measured scores with the recorded targets.
 * @param {ReadonlyMap<string, number>} scores measured scores by check name.
 * @param {readonly Target[]} targets
 * @returns {{ below: {check: string, score: number, floor: number}[], missing: {check: string, floor: number}[] }}
 */
export function findViolations(scores, targets) {
  const below = [];
  const missing = [];
  for (const entry of targets) {
    if (!scores.has(entry.check)) {
      missing.push({ check: entry.check, floor: entry.floor });
      continue;
    }
    const score = /** @type {number} */ (scores.get(entry.check));
    if (score < entry.floor) below.push({ check: entry.check, score, floor: entry.floor });
  }
  return { below, missing };
}

/** One report line per breach; empty when every target is met. */
export function violationLines({ below, missing }) {
  return [
    ...below.map(
      ({ check, score, floor }) => `BELOW TARGET: ${check} scored ${score}, its recorded target is ${floor}`,
    ),
    ...missing.map(({ check, floor }) => `BELOW TARGET: ${check} has no result, its recorded target is ${floor}`),
  ];
}

/** @param {readonly string[]} args command-line arguments after the script name. */
export function main(args) {
  const problems = validateTargets(RECORDED_TARGETS);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`bad recorded target: ${problem}`);
    return 2;
  }
  if (args[0] === "--list-targets") {
    console.log(JSON.stringify({ measurement: MEASUREMENT, targets: RECORDED_TARGETS }, null, 2));
    return 0;
  }
  if (args.length !== 1 || args[0] === "" || args[0].startsWith("-")) {
    console.error("usage: node tools/scorecard-floor.mjs <results.json> | --list-targets");
    return 2;
  }
  let document;
  try {
    document = JSON.parse(readFileSync(args[0], "utf8"));
  } catch (error) {
    console.error(`cannot read the Scorecard results: ${/** @type {Error} */ (error).message}`);
    return 2;
  }
  let scores;
  try {
    scores = parseScores(document);
  } catch (error) {
    if (error instanceof ScorecardFloorError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
  const lines = violationLines(findViolations(scores, RECORDED_TARGETS));
  if (lines.length > 0) {
    for (const line of lines) console.log(line);
    console.log(`${lines.length} Scorecard check(s) below their recorded target (${MEASUREMENT}).`);
    return 1;
  }
  console.log(`All ${RECORDED_TARGETS.length} recorded Scorecard targets met.`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
