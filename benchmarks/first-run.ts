import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

/** Target budget for time to first useful finding: 2 minutes = 120,000 ms. */
export const TWO_MINUTE_BUDGET_MS = 120_000;

export const SMOKE_FIXTURE_CONTENT = JSON.stringify(
  {
    name: "evergreen-smoke-fixture",
    private: true,
    engines: { node: ">=18.0.0" },
    dependencies: { request: "^2.88.0" },
  },
  null,
  2,
);

export interface FirstRunBenchmarkOptions {
  /**
   * Package spec to run via npx (e.g. "evergreen-deprecation@0.7.1" or "evergreen-deprecation").
   * If omitted or undefined, runs the local built CLI unless useNpx is true.
   */
  packageSpec?: string | undefined;
  /** Directory with a fixture to scan. If omitted, a clean temp directory with the smoke fixture is created. */
  targetDir?: string | undefined;
  /** Whether to use npx even without packageSpec. */
  useNpx?: boolean | undefined;
  /** Custom args to pass to evergreen (defaults to ["scan", ".", "--json"]). */
  scanArgs?: readonly string[] | undefined;
  /** Budget in milliseconds (default: 120,000 ms = 2 minutes). */
  budgetMs?: number | undefined;
  /** Path to append markdown summary to (e.g. GITHUB_STEP_SUMMARY). */
  summaryPath?: string | undefined;
  /** Timeout in ms (defaults to 180,000 ms). */
  timeoutMs?: number | undefined;
  /** Custom runner label for reporting (defaults to CI runner name or local machine). */
  runner?: string | undefined;
}

export interface FirstRunBenchmarkResult {
  schemaVersion: "evergreen.first-run-benchmark.v1";
  timestamp: string;
  platform: NodeJS.Platform;
  arch: string;
  nodeVersion: string;
  runner: string;
  command: string[];
  cleanDirectory: boolean;
  durationMs: number;
  budgetMs: number;
  underBudget: boolean;
  findingsCount: number;
  firstFindingRuleId: string | null;
  firstFindingLocation: string | null;
  exitCode: number;
}

/** Sets up a clean temporary project directory with the smoke fixture. */
export async function createCleanSmokeProject(targetDir?: string): Promise<{ directory: string; cleanup: () => Promise<void> }> {
  let createdTemp = false;
  let dir = targetDir;
  if (!dir) {
    dir = await mkdtemp(join(tmpdir(), "evergreen-first-run-"));
    createdTemp = true;
  } else {
    await mkdir(dir, { recursive: true });
  }

  const packageJsonPath = join(dir, "package.json");
  const repoFixture = resolve("tests/fixtures/smoke/package.json");
  if (existsSync(repoFixture)) {
    await copyFile(repoFixture, packageJsonPath);
  } else {
    await writeFile(packageJsonPath, SMOKE_FIXTURE_CONTENT, "utf8");
  }

  const cleanup = async () => {
    if (createdTemp && dir) {
      await rm(dir, { recursive: true, force: true });
    }
  };

  return { directory: dir, cleanup };
}

/** Detects whether current execution is on a CI runner. */
export function detectRunnerName(): string {
  if (process.env.GITHUB_ACTIONS === "true") {
    const os = process.env.RUNNER_OS || process.platform;
    return `GitHub Actions (${os})`;
  }
  if (process.env.CI === "true") return "CI runner";
  return `Local (${process.platform} ${process.arch})`;
}

/**
 * Times a clean run of the quickstart to first useful finding.
 * In a clean environment with npx, this measures package fetch, CLI startup, scanning, and finding output.
 */
export async function measureFirstRun(options: FirstRunBenchmarkOptions = {}): Promise<FirstRunBenchmarkResult> {
  const budgetMs = options.budgetMs ?? TWO_MINUTE_BUDGET_MS;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const scanArgs = options.scanArgs ?? ["scan", ".", "--json"];
  const runner = options.runner ?? detectRunnerName();

  const isNpx = Boolean(options.useNpx || options.packageSpec);
  const clean = await createCleanSmokeProject(options.targetDir);

  try {
    let executable: string;
    let args: string[];

    if (isNpx) {
      executable = "npx";
      const pkg = options.packageSpec ?? "evergreen-deprecation";
      args = ["--yes", pkg, ...scanArgs];
    } else {
      executable = process.execPath;
      const cliPath = resolve("dist/src/cli.js");
      args = [cliPath, ...scanArgs];
    }

    const isWindows = process.platform === "win32";
    const startedAt = performance.now();

    const spawnResult = spawnSync(executable, args, {
      cwd: clean.directory,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      shell: isWindows && executable === "npx",
      timeout: timeoutMs,
      env: {
        ...process.env,
      },
    });

    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    const exitCode = spawnResult.status ?? (spawnResult.error ? 1 : 0);

    let findingsCount = 0;
    let firstFindingRuleId: string | null = null;
    let firstFindingLocation: string | null = null;

    if (spawnResult.stdout) {
      try {
        const parsed = JSON.parse(spawnResult.stdout) as {
          findings?: Array<{ ruleId?: string; location?: { path?: string; line?: number } }>;
        };
        const findings = parsed.findings ?? [];
        findingsCount = findings.length;
        if (findings.length > 0 && findings[0]) {
          firstFindingRuleId = findings[0].ruleId ?? null;
          const loc = findings[0].location;
          firstFindingLocation = loc ? `${loc.path ?? ""}:${loc.line ?? ""}` : null;
        }
      } catch {
        // If not JSON format, parse lines for findings count
        const match = /^Evergreen:\s+(\d+)\s+findings?/m.exec(spawnResult.stdout);
        if (match && match[1]) {
          findingsCount = Number(match[1]);
        }
      }
    }

    const underBudget = durationMs <= budgetMs && exitCode === 0;

    const result: FirstRunBenchmarkResult = {
      schemaVersion: "evergreen.first-run-benchmark.v1",
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      runner,
      command: [executable, ...args],
      cleanDirectory: true,
      durationMs,
      budgetMs,
      underBudget,
      findingsCount,
      firstFindingRuleId,
      firstFindingLocation,
      exitCode,
    };

    if (options.summaryPath) {
      appendMarkdownSummary(options.summaryPath, result);
    }

    return result;
  } finally {
    await clean.cleanup();
  }
}

/** Formats a one-line summary of the benchmark result. */
export function formatFirstRunSummary(result: FirstRunBenchmarkResult): string {
  const durationSec = (result.durationMs / 1000).toFixed(2);
  const budgetSec = (result.budgetMs / 1000).toFixed(0);
  const status = result.underBudget ? "PASSED" : "FAILED";
  const findingInfo = result.firstFindingRuleId ? ` (first finding: ${result.firstFindingRuleId})` : "";
  return `Time to first useful finding: ${durationSec}s on ${result.platform} (${result.findingsCount} findings; budget: ${budgetSec}s - ${status})${findingInfo}`;
}

/** Formats the benchmark result as a GitHub Flavored Markdown table. */
export function formatFirstRunMarkdown(results: FirstRunBenchmarkResult | FirstRunBenchmarkResult[]): string {
  const list = Array.isArray(results) ? results : [results];
  const rows = list.map((res) => {
    const durationSec = `${(res.durationMs / 1000).toFixed(2)} s`;
    const budgetSec = `< ${(res.budgetMs / 1000).toFixed(0)} s`;
    const outcome = res.underBudget ? "Pass" : "**Fail**";
    const finding = res.firstFindingRuleId ? `\`${res.firstFindingRuleId}\`` : "none";
    return `| ${res.platform} | ${res.runner} | ${durationSec} | ${budgetSec} | ${res.findingsCount} | ${finding} | ${outcome} |`;
  });

  return [
    "### Time to first useful finding",
    "",
    "| Platform | Runner | First run duration | Goal | Findings | First finding | Result |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function appendMarkdownSummary(summaryPath: string, result: FirstRunBenchmarkResult): void {
  const exists = existsSync(summaryPath);
  let content = "";
  if (!exists) {
    content = formatFirstRunMarkdown(result);
  } else {
    const existing = exists ? appendFileSync : null;
    const durationSec = `${(result.durationMs / 1000).toFixed(2)} s`;
    const budgetSec = `< ${(result.budgetMs / 1000).toFixed(0)} s`;
    const outcome = result.underBudget ? "Pass" : "**Fail**";
    const finding = result.firstFindingRuleId ? `\`${result.firstFindingRuleId}\`` : "none";
    const row = `| ${result.platform} | ${result.runner} | ${durationSec} | ${budgetSec} | ${result.findingsCount} | ${finding} | ${outcome} |\n`;
    content = row;
  }
  appendFileSync(summaryPath, content);
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  let packageSpec: string | undefined;
  let targetDir: string | undefined;
  let useNpx = false;
  let jsonOutput = false;
  let check = false;
  let summaryPath: string | undefined;
  let budgetMs = TWO_MINUTE_BUDGET_MS;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--package" && i + 1 < argv.length) {
      packageSpec = argv[++i];
      useNpx = true;
    } else if (arg === "--version" && i + 1 < argv.length) {
      packageSpec = `evergreen-deprecation@${argv[++i]}`;
      useNpx = true;
    } else if (arg === "--target" && i + 1 < argv.length) {
      targetDir = argv[++i];
    } else if (arg === "--summary" && i + 1 < argv.length) {
      summaryPath = argv[++i];
    } else if (arg === "--budget" && i + 1 < argv.length) {
      budgetMs = Number(argv[++i]) * 1000;
    } else if (arg === "--npx") {
      useNpx = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--check") {
      check = true;
    }
  }

  const result = await measureFirstRun({
    packageSpec,
    targetDir,
    useNpx,
    budgetMs,
    summaryPath,
  });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatFirstRunSummary(result));
  }

  if (check && (!result.underBudget || result.exitCode !== 0 || result.findingsCount === 0)) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runCli();
}
