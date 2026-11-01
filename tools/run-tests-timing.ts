/**
 * Pure helpers for per-file test timing summaries.
 * Summaries prefer source paths (`tests/foo.test.ts`) over compiled ones
 * (`dist/tests/foo.test.js`) so local and CI output match what developers edit.
 *
 * Path math stays string-based so this file does not import `node:path` (the
 * repository usage-parity scan treats those imports as call sites).
 */

export const TEST_TIMING_MARKER = "<!-- evergreen-test-timing -->";

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
