/**
 * Turns a directory of agent-proof result files into the Markdown tables the
 * publication page needs. The guardrail and plan runners write one JSON file
 * per run that matches `schemas/benchmark-result.v1.schema.json`. This tool
 * validates every file, then prints one table per arm with rates, counts, and
 * the agent and model versions. Output is deterministic: files are sorted by
 * name, arms in a fixed order, and rows by agent, model, then run id.
 *
 *   node dist/tools/benchmark-report.js <results-directory>
 *
 * Reads local files only; never uses the network. Does not write into docs/.
 */

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

export const SCHEMA_VERSION = "evergreen.benchmark-result.v1" as const;
export const SCHEMA_PATH = "schemas/benchmark-result.v1.schema.json";

export const GUARDRAIL_OUTCOMES = [
  "refused",
  "named-replacement",
  "other-replacement",
  "added-deprecated",
] as const;

export type GuardrailOutcome = (typeof GUARDRAIL_OUTCOMES)[number];

export const GUARDRAIL_ARMS = ["baseline", "guardrail"] as const;
export type GuardrailArm = (typeof GUARDRAIL_ARMS)[number];

export const PLAN_ARMS = ["sequential", "wave-parallel"] as const;
export type PlanArm = (typeof PLAN_ARMS)[number];

export interface NamedVersion {
  name: string;
  version: string;
}

export type GuardrailOutcomeCounts = Record<GuardrailOutcome, number>;

export interface GuardrailArmScore {
  arm: GuardrailArm;
  attempts: number;
  counts: GuardrailOutcomeCounts;
  rates: GuardrailOutcomeCounts;
}

export interface PlanArmScore {
  arm: PlanArm;
  durationMs: number;
  findings: number;
  resolved: number;
  resolutionRate: number;
}

interface ResultBase {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  agent: NamedVersion;
  model: NamedVersion;
  startedAt: string;
  finishedAt: string;
}

export interface GuardrailResult extends ResultBase {
  kind: "guardrail";
  arms: GuardrailArmScore[];
}

export interface PlanResult extends ResultBase {
  kind: "plan";
  arms: PlanArmScore[];
}

export type BenchmarkResult = GuardrailResult | PlanResult;

export interface LoadedResult {
  /** Basename of the result file, for error messages and deterministic ordering. */
  fileName: string;
  result: BenchmarkResult;
}

const USAGE = `Usage: node dist/tools/benchmark-report.js <results-directory>

Reads every *.json file in the directory, validates each against
schemas/benchmark-result.v1.schema.json, and prints Markdown tables to stdout:
one table per arm with rates, counts, and the agent and model versions.

Does not write into docs/. Offline only.`;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cell(value: string | number): string {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function rate(value: number): string {
  return value.toFixed(4);
}

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (errors === undefined || errors === null || errors.length === 0) return "unknown schema error";
  return errors
    .map((error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`)
    .join("; ");
}

let cachedValidator: ValidateFunction | undefined;

/** Compiles the bundled result schema once; callers pass a different path only in tests. */
export async function loadValidator(schemaPath = resolve(SCHEMA_PATH)): Promise<ValidateFunction> {
  if (cachedValidator !== undefined && schemaPath === resolve(SCHEMA_PATH)) return cachedValidator;
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  if (schemaPath === resolve(SCHEMA_PATH)) cachedValidator = validate;
  return validate;
}

/** Validates one parsed value against the result schema; throws with the file name on failure. */
export function assertValidResult(
  value: unknown,
  fileName: string,
  validate: ValidateFunction,
): asserts value is BenchmarkResult {
  if (!validate(value)) {
    throw new Error(`${fileName} does not match ${SCHEMA_PATH}: ${formatErrors(validate.errors)}`);
  }
}

/** Reads and validates every `*.json` file in `directory`, sorted by basename. */
export async function loadResults(
  directory: string,
  options: { schemaPath?: string } = {},
): Promise<LoadedResult[]> {
  const root = resolve(directory);
  const names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort(compare);
  if (names.length === 0) {
    throw new Error(`No *.json result files found in ${root}.`);
  }
  const validate = await loadValidator(options.schemaPath ?? resolve(SCHEMA_PATH));
  const loaded: LoadedResult[] = [];
  for (const fileName of names) {
    const text = await readFile(join(root, fileName), "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(`${fileName} is not valid JSON: ${(error as Error).message}`);
    }
    assertValidResult(parsed, fileName, validate);
    loaded.push({ fileName, result: parsed });
  }
  return loaded;
}

function rowKey(result: BenchmarkResult): string {
  return [result.agent.name, result.agent.version, result.model.name, result.model.version, result.id].join("\0");
}

function markdownTable(headers: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  const head = `| ${headers.map(cell).join(" | ")} |`;
  const sep = `| ${headers.map((_, index) => (index < 4 ? "---" : "---:")).join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(cell).join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

function renderGuardrailArm(arm: GuardrailArm, results: readonly LoadedResult[]): string | undefined {
  const rows: (string | number)[][] = [];
  const sorted = [...results]
    .filter((entry) => entry.result.kind === "guardrail")
    .sort((left, right) => compare(rowKey(left.result), rowKey(right.result)));
  for (const { result } of sorted) {
    if (result.kind !== "guardrail") continue;
    for (const score of result.arms) {
      if (score.arm !== arm) continue;
      rows.push([
        result.agent.name,
        result.agent.version,
        result.model.name,
        result.model.version,
        score.attempts,
        score.counts.refused,
        score.counts["named-replacement"],
        score.counts["other-replacement"],
        score.counts["added-deprecated"],
        rate(score.rates.refused),
        rate(score.rates["named-replacement"]),
        rate(score.rates["other-replacement"]),
        rate(score.rates["added-deprecated"]),
      ]);
    }
  }
  if (rows.length === 0) return undefined;
  const table = markdownTable(
    [
      "Agent",
      "Agent version",
      "Model",
      "Model version",
      "Attempts",
      "refused",
      "named-replacement",
      "other-replacement",
      "added-deprecated",
      "refused rate",
      "named-replacement rate",
      "other-replacement rate",
      "added-deprecated rate",
    ],
    rows,
  );
  return `### ${arm}\n\n${table}`;
}

function renderPlanArm(arm: PlanArm, results: readonly LoadedResult[]): string | undefined {
  const rows: (string | number)[][] = [];
  const sorted = [...results]
    .filter((entry) => entry.result.kind === "plan")
    .sort((left, right) => compare(rowKey(left.result), rowKey(right.result)));
  for (const { result } of sorted) {
    if (result.kind !== "plan") continue;
    for (const score of result.arms) {
      if (score.arm !== arm) continue;
      rows.push([
        result.agent.name,
        result.agent.version,
        result.model.name,
        result.model.version,
        score.durationMs,
        score.findings,
        score.resolved,
        rate(score.resolutionRate),
      ]);
    }
  }
  if (rows.length === 0) return undefined;
  const table = markdownTable(
    [
      "Agent",
      "Agent version",
      "Model",
      "Model version",
      "Duration (ms)",
      "Findings",
      "Resolved",
      "Resolution rate",
    ],
    rows,
  );
  return `### ${arm}\n\n${table}`;
}

/** Builds the full Markdown report for a loaded set of results. */
export function renderReport(results: readonly LoadedResult[]): string {
  const sections: string[] = [];

  const guardrailArms = GUARDRAIL_ARMS.map((arm) => renderGuardrailArm(arm, results)).filter(
    (section): section is string => section !== undefined,
  );
  if (guardrailArms.length > 0) {
    sections.push(`## Guardrail\n\n${guardrailArms.join("\n\n")}`);
  }

  const planArms = PLAN_ARMS.map((arm) => renderPlanArm(arm, results)).filter(
    (section): section is string => section !== undefined,
  );
  if (planArms.length > 0) {
    sections.push(`## Plan\n\n${planArms.join("\n\n")}`);
  }

  if (sections.length === 0) {
    throw new Error("No arm scores found in the result files.");
  }
  return `${sections.join("\n\n")}\n`;
}

/** Loads results from `directory` and returns the Markdown report. */
export async function generateReport(
  directory: string,
  options: { schemaPath?: string } = {},
): Promise<string> {
  return renderReport(await loadResults(directory, options));
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const directory = argv.find((argument) => !argument.startsWith("-"));
  if (directory === undefined || argv.length !== 1) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }
  process.stdout.write(await generateReport(directory));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exitCode = 1;
    },
  );
}
