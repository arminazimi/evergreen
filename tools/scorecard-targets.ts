// Per-check Scorecard target enforcement. It reads the latest published OpenSSF
// Scorecard results — a JSON file the caller fetched beforehand, the shape the
// Scorecard API serves at
// `https://api.securityscorecards.dev/projects/github.com/arminazimi/evergreen` —
// and fails when a check falls below its recorded target, naming that check.
//
//   node dist/tools/scorecard-targets.js --results scorecard-results.json
//
// The tool never touches the network; the workflow that supplies the file owns
// the fetch (`.github/workflows/scorecard.yml`). The overall score floor
// (6.0 by v0.8.0, 7.0 by v1.0) is enforced by `.github/workflows/scorecard-floor.yml`.
//
// `RECORDED_TARGETS` is the ratchet. Targets only rise:
// - raising a `target` (and its `observed`) needs nothing but the edit;
// - a `target` below its `observed`, or below the policy floor of 5 from
//   docs/QUALITY.md ("every check at least 5 except the exceptions already
//   explained in SECURITY.md"), is refused unless the entry carries a written
//   `reason`.
// So a lowered score fails with the check's name, and a lowered target fails
// with the check's name too — unless someone wrote down why first.
//
// Initial values are the published results of 2026-11-01T22:30:17Z (Scorecard
// v5.6.0, aggregate 5.9), read from the Scorecard API when this tool landed.

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** The per-check floor from docs/QUALITY.md §8; entries below it need a written reason. */
export const POLICY_MIN_TARGET = 5;

/** Scorecard scores are integers from 0 to 10; -1 means "inconclusive". */
export const MIN_SCORE = -1;
export const MAX_SCORE = 10;

export interface CheckTarget {
  /** The score a check must not fall below. */
  target: number;
  /** The highest score recorded for this check so far. */
  observed: number;
  /** Written justification required when `target` is below `observed` or below POLICY_MIN_TARGET. */
  reason?: string;
}

export interface ScorecardCheck {
  name: string;
  score: number;
}

export interface Evaluation {
  /** One line per failing check, sorted by check name. Non-empty means the run must fail. */
  failures: string[];
  /** One line per check that scored above its recorded target; informational, sorted by name. */
  notes: string[];
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/**
 * Refuse targets that fall without a written reason: a `target` below its
 * `observed`, or below the policy floor of 5, must carry a non-empty `reason`.
 */
export function validateTargets(targets: ReadonlyMap<string, CheckTarget>): string[] {
  const problems: string[] = [];
  for (const [name, entry] of [...targets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!isScore(entry.target) || !isScore(entry.observed)) {
      problems.push(`invalid target: "${name}" target/observed must be integers from ${MIN_SCORE} to ${MAX_SCORE}.`);
      continue;
    }
    const belowObserved = entry.target < entry.observed;
    const belowPolicy = entry.target < POLICY_MIN_TARGET;
    if ((belowObserved || belowPolicy) && (entry.reason === undefined || entry.reason.trim() === "")) {
      const why = belowObserved
        ? `target ${entry.target} is below the recorded observation ${entry.observed}`
        : `target ${entry.target} is below the policy floor ${POLICY_MIN_TARGET} (docs/QUALITY.md §8)`;
      problems.push(`lowered target: "${name}" ${why} without a written reason.`);
    }
  }
  return problems;
}

/** Parse the published Scorecard results JSON. Throws on any shape that is not a results file. */
export function parseResults(text: string): ScorecardCheck[] {
  const data = JSON.parse(text) as { checks?: unknown } | null;
  if (!data || !Array.isArray(data.checks)) {
    throw new Error("Scorecard results must hold a `checks` array (this is not the API results shape).");
  }
  const checks: ScorecardCheck[] = [];
  const seen = new Set<string>();
  for (const entry of data.checks as Array<{ name?: unknown; score?: unknown }>) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (name === "") {
      throw new Error("Every Scorecard result entry needs a non-empty check `name`.");
    }
    const score = entry?.score;
    if (!isScore(score)) {
      throw new Error(`Scorecard check "${name}" has a score outside ${MIN_SCORE}..${MAX_SCORE}.`);
    }
    if (seen.has(name)) {
      throw new Error(`Scorecard check "${name}" appears twice in the results.`);
    }
    seen.add(name);
    checks.push({ name, score });
  }
  if (checks.length === 0) {
    throw new Error("Scorecard results hold no checks.");
  }
  return checks;
}

/**
 * Compare the latest measurements against the recorded targets. A measured
 * score below its target fails with the check's name; a check the table does
 * not cover, or a table entry the results do not measure, also fails so the
 * ratchet never silently loses coverage.
 */
export function evaluate(
  checks: readonly ScorecardCheck[],
  targets: ReadonlyMap<string, CheckTarget>,
): Evaluation {
  const failures: string[] = [];
  const notes: string[] = [];
  const measured = new Map(checks.map((check) => [check.name, check.score]));

  for (const [name, score] of [...measured.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const entry = targets.get(name);
    if (!entry) {
      failures.push(
        `no recorded target: "${name}" scored ${score}; add its target to the ratchet before this can pass.`,
      );
      continue;
    }
    if (score < entry.target) {
      failures.push(`lowered score: "${name}" scored ${score}, below its recorded target ${entry.target}.`);
    } else if (score > entry.observed) {
      notes.push(`target may rise: "${name}" scored ${score}, above the recorded target ${entry.target}.`);
    }
  }

  for (const name of [...targets.keys()].sort()) {
    if (!measured.has(name)) {
      failures.push(`no measurement: "${name}" has a recorded target but is absent from the latest results.`);
    }
  }

  return { failures, notes };
}

/**
 * The ratchet as recorded when this tool landed (published 2026-11-01T22:30:17Z,
 * Scorecard v5.6.0). Reasons cite the documented exceptions in SECURITY.md or
 * name the work that will raise the entry.
 */
export const RECORDED_TARGETS: ReadonlyMap<string, CheckTarget> = new Map(
  Object.entries({
    "Binary-Artifacts": { target: 5, observed: 5 },
    "Branch-Protection": {
      target: -1,
      observed: -1,
      reason:
        "Inconclusive: the workflow does not hold an admin PAT, so the Scorecard API reads only part of the branch protection. Documented in SECURITY.md (§OpenSSF Scorecard).",
    },
    "CII-Best-Practices": { target: 5, observed: 5 },
    "CI-Tests": { target: 10, observed: 10 },
    "Code-Review": {
      target: 0,
      observed: 0,
      reason:
        "Required approving reviews stay at zero so agent and maintainer pull requests merge after green checks; documented in SECURITY.md (§OpenSSF Scorecard).",
    },
    Contributors: {
      target: 3,
      observed: 3,
      reason: "Fewer distinct contributors than the check's thresholds; rises with adoption, not with repo changes.",
    },
    "Dangerous-Workflow": { target: 10, observed: 10 },
    "Dependency-Update-Tool": { target: 10, observed: 10 },
    Fuzzing: { target: 10, observed: 10 },
    License: { target: 10, observed: 10 },
    Maintained: {
      target: 0,
      observed: 0,
      reason: "The repository was created within the last 90 days, so the check reports 0; it rises with age.",
    },
    Packaging: { target: 10, observed: 10 },
    "Pinned-Dependencies": {
      target: 3,
      observed: 3,
      reason:
        "The SLSA reusable workflow in release.yml stays on an upstream tag as that project documents; documented in SECURITY.md (§OpenSSF Scorecard).",
    },
    SAST: { target: 7, observed: 7 },
    "Security-Policy": { target: 10, observed: 10 },
    "Signed-Releases": {
      target: 2,
      observed: 2,
      reason: "Release assets are not signed yet; the v0.8 release chain (#1988 phase) raises this entry when they are.",
    },
    "Token-Permissions": { target: 10, observed: 10 },
    Vulnerabilities: {
      target: 0,
      observed: 0,
      reason:
        "Open Dependabot alerts on development dependencies; tracked as the audit triage item in docs/QUALITY.md (§8 Security, Remaining debt).",
    },
  } satisfies Record<string, CheckTarget>),
);

export interface CommandLineOptions {
  resultsPath: string;
}

export function parseArguments(argv: readonly string[]): CommandLineOptions {
  let resultsPath: string | undefined;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg !== "--results") {
      throw new Error(`Unexpected argument "${arg ?? ""}". Usage: --results <scorecard-results.json>`);
    }
    if (resultsPath !== undefined) {
      throw new Error("--results was given more than once.");
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) {
      throw new Error("--results needs a value: the path to the published Scorecard results JSON.");
    }
    resultsPath = value;
  }
  if (resultsPath === undefined) {
    throw new Error("--results is required: the path to the published Scorecard results JSON.");
  }
  return { resultsPath };
}

export interface MainDependencies {
  readTextFile?: (path: string) => Promise<string>;
  writeLine?: (line: string) => void;
  /** Test seam; defaults to `RECORDED_TARGETS`. */
  targets?: ReadonlyMap<string, CheckTarget>;
}

export async function main(argv: string[], deps: MainDependencies = {}): Promise<number> {
  const options = parseArguments(argv);
  const readTextFile = deps.readTextFile ?? ((path: string) => readFile(path, "utf8"));
  const writeLine = deps.writeLine ?? ((line: string) => process.stdout.write(`${line}\n`));
  const targets = deps.targets ?? RECORDED_TARGETS;

  const problems = validateTargets(targets);
  if (problems.length > 0) {
    for (const problem of problems) writeLine(problem);
    writeLine(
      "Scorecard target table invalid: targets only rise, never fall, without a written reason.",
    );
    return 1;
  }

  const checks = parseResults(await readTextFile(options.resultsPath));
  const { failures, notes } = evaluate(checks, targets);
  for (const note of notes) writeLine(note);
  for (const failure of failures) writeLine(failure);
  if (failures.length === 0) {
    writeLine(`All ${checks.length} Scorecard checks meet their recorded targets.`);
    return 0;
  }
  writeLine(`Scorecard below recorded targets: ${failures.length} check(s).`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    },
  );
}
