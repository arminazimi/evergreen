/**
 * Pure helpers for per-file test timing summaries.
 * Summaries prefer source paths (`tests/foo.test.ts`) over compiled ones
 * (`dist/tests/foo.test.js`) so local and CI output match what developers edit.
 *
 * Path math stays string-based so this file does not import `node:path` (the
 * repository usage-parity scan treats those imports as call sites).
 */

export const TEST_TIMING_MARKER = "<!-- evergreen-test-timing -->";
export const TEST_TIME_BUDGET_SCHEMA_VERSION = "evergreen.test-time-budget.v1";
export const TEST_TIME_BUDGET_TITLE = "Test time budget exceeded";

function toAbsolute(filePath: string, cwd: string): string {
  const trimmed = filePath.trim().replaceAll("\\", "/");
  if (trimmed.startsWith("/") || /^[A-Za-z]:\//.test(trimmed)) return trimmed;
  const root = cwd.replaceAll("\\", "/").replace(/\/$/, "");
  return `${root}/${trimmed}`;
}

function toRepoRelative(absolute: string, cwd: string): string {
  const root = cwd.replaceAll("\\", "/").replace(/\/$/, "");
  const full = absolute.replaceAll("\\", "/");
  if (full === root) return "";
  if (full.startsWith(`${root}/`)) return full.slice(root.length + 1);
  return full;
}

export function normalizeTestFilePath(filePath: string, cwd: string): string {
  const rel = toRepoRelative(toAbsolute(filePath, cwd), cwd);
  if (rel.startsWith("dist/tests/") && rel.endsWith(".test.js")) {
    return `tests/${rel.slice("dist/tests/".length, -".js".length)}.ts`;
  }
  if (rel.startsWith("tests/") && rel.endsWith(".test.ts")) return rel;
  if (rel.startsWith("tests/") && rel.endsWith(".test.js")) {
    return `${rel.slice(0, -".js".length)}.ts`;
  }
  return rel;
}

export function fileDurationsFromJunit(xml: string, cwd: string): { file: string; durationMs: number }[] {
  const byFile = new Map<string, number>();
  for (const match of xml.matchAll(/<testcase\b([^>]*)\/>|<testcase\b([^>]*)>/g)) {
    const attrs = match[1] ?? match[2] ?? "";
    const time = attrs.match(/\btime="([^"]*)"/)?.[1];
    const file = attrs.match(/\bfile="([^"]*)"/)?.[1];
    if (time === undefined || file === undefined || file === "") continue;
    const seconds = Number(time);
    if (!Number.isFinite(seconds)) continue;
    const normalized = normalizeTestFilePath(file, cwd);
    byFile.set(normalized, (byFile.get(normalized) ?? 0) + seconds * 1000);
  }
  return [...byFile.entries()]
    .map(([file, durationMs]) => ({ file, durationMs: Math.round(durationMs) }))
    .sort((a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file));
}

export function formatTestDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}m ${rest.toFixed(1)}s`;
}

export interface TestTimeBudget {
  readonly schemaVersion: typeof TEST_TIME_BUDGET_SCHEMA_VERSION;
  /** Ceiling for the sum of every file's testcase time, in milliseconds. */
  readonly totalMs: number;
  /** Ceiling for any single test file's summed testcase time, in milliseconds. */
  readonly perFileMs: number;
  readonly note?: string;
}

export interface TestTimeBudgetViolation {
  readonly scope: "file" | "suite";
  /** Repo-relative test file, present when `scope` is `file`. */
  readonly file?: string;
  readonly actualMs: number;
  readonly budgetMs: number;
}

/**
 * Parse the committed budget file. A malformed budget is an error rather than a silently
 * disabled gate: the file is small and checked in, so every failure here is a typo or drift.
 */
export function parseTestTimeBudget(text: string): TestTimeBudget {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`test time budget is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("test time budget must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== TEST_TIME_BUDGET_SCHEMA_VERSION) {
    throw new Error(`test time budget schemaVersion must be "${TEST_TIME_BUDGET_SCHEMA_VERSION}"`);
  }
  for (const key of ["totalMs", "perFileMs"] as const) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`test time budget ${key} must be a positive number of milliseconds`);
    }
  }
  return {
    schemaVersion: TEST_TIME_BUDGET_SCHEMA_VERSION,
    totalMs: record.totalMs as number,
    perFileMs: record.perFileMs as number,
    ...(typeof record.note === "string" ? { note: record.note } : {}),
  };
}

/**
 * Pure gate: one violation per file over the per-file budget and one for the whole suite.
 * `totalMs` defaults to the sum of the entries, matching the timing summary.
 */
export function evaluateTestTimeBudget(
  entries: readonly { file: string; durationMs: number }[],
  budget: TestTimeBudget,
  totalMs: number = entries.reduce((sum, entry) => sum + entry.durationMs, 0),
): TestTimeBudgetViolation[] {
  const violations: TestTimeBudgetViolation[] = [];
  for (const entry of entries) {
    const actualMs = Math.round(entry.durationMs);
    if (actualMs > budget.perFileMs) {
      violations.push({ scope: "file", file: entry.file, actualMs, budgetMs: budget.perFileMs });
    }
  }
  if (totalMs > budget.totalMs) {
    violations.push({ scope: "suite", actualMs: Math.round(totalMs), budgetMs: budget.totalMs });
  }
  return violations.sort(
    (left, right) =>
      right.actualMs - right.budgetMs - (left.actualMs - left.budgetMs) ||
      (left.file ?? "").localeCompare(right.file ?? ""),
  );
}

/** Names the file (when there is one), the actual milliseconds, and the budget milliseconds. */
export function formatTestTimeBudgetViolation(violation: TestTimeBudgetViolation): string {
  const actual = `${formatTestDuration(violation.actualMs)} (${violation.actualMs} ms)`;
  if (violation.scope === "file") {
    return `${violation.file} took ${actual}, over the ${violation.budgetMs} ms per-file test time budget`;
  }
  return `test suite total took ${actual}, over the ${violation.budgetMs} ms suite test time budget`;
}

function escapeAnnotationProperty(value: string): string {
  return value
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A")
    .replaceAll(":", "%3A")
    .replaceAll(",", "%2C");
}

function escapeAnnotationMessage(value: string): string {
  return value.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");
}

/**
 * GitHub Actions error annotation. The file property is repo-relative with forward slashes,
 * so it works on Windows runners as well as Linux and macOS.
 */
export function testTimeBudgetAnnotation(violation: TestTimeBudgetViolation): string {
  const message = escapeAnnotationMessage(formatTestTimeBudgetViolation(violation));
  const title = escapeAnnotationProperty(TEST_TIME_BUDGET_TITLE);
  if (violation.scope === "file" && violation.file !== undefined) {
    return `::error file=${escapeAnnotationProperty(violation.file)},title=${title}::${message}`;
  }
  return `::error title=${title}::${message}`;
}

/** Markdown for stdout and the GitHub step summary, so the failing file is easy to find. */
export function renderTestTimeBudgetFailure(
  violations: readonly TestTimeBudgetViolation[],
  options: { budgetPath?: string } = {},
): string {
  const lines = ["### Test time budget exceeded", ""];
  for (const violation of violations) lines.push(`- ${formatTestTimeBudgetViolation(violation)}`);
  if (options.budgetPath !== undefined) {
    lines.push("", `Adjust \`${options.budgetPath}\` only when accepting the slowdown on purpose.`);
  }
  lines.push("");
  return lines.join("\n");
}

export function renderTestTimingSummary(
  entries: readonly { file: string; durationMs: number }[],
  options: {
    limit?: number;
    platform?: string;
    nodeVersion?: string;
    totalMs?: number;
  } = {},
): string {
  const limit = options.limit ?? 30;
  const platform = options.platform ?? process.platform;
  const nodeVersion = options.nodeVersion ?? process.version;
  const totalMs = options.totalMs ?? entries.reduce((sum, entry) => sum + entry.durationMs, 0);
  const lines = [
    "### Test file timing",
    TEST_TIMING_MARKER,
    "",
    `platform: \`${platform}\` · node: \`${nodeVersion}\``,
    "",
  ];
  if (entries.length === 0) {
    lines.push("_No testcase timings recorded._", "");
    return lines.join("\n");
  }
  const shown = entries.slice(0, limit);
  lines.push(`Top ${shown.length} of ${entries.length} files by summed testcase time:`, "");
  lines.push("| File | Duration |");
  lines.push("| --- | ---: |");
  for (const entry of shown) {
    lines.push(`| \`${entry.file}\` | ${formatTestDuration(entry.durationMs)} |`);
  }
  lines.push("");
  lines.push(`Suite total (sum of file times): **${formatTestDuration(totalMs)}**`);
  lines.push("");
  return lines.join("\n");
}
