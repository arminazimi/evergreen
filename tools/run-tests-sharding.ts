/**
 * Time-balanced test sharding and LCOV merge helpers for CI.
 *
 * Shards are assigned with a greedy multifit: longest files first onto the
 * currently lightest shard, using measured per-file durations. That keeps
 * shard wall times within a small band without splitting by file count.
 */

export const TEST_FILE_TIMINGS_SCHEMA_VERSION = "evergreen.test-file-timings.v1";
export const DEFAULT_TEST_FILE_DURATION_MS = 1_000;

export interface TestFileTimings {
  readonly schemaVersion: typeof TEST_FILE_TIMINGS_SCHEMA_VERSION;
  readonly durations: Readonly<Record<string, number>>;
  readonly note?: string;
}

export interface ShardAssignment {
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly files: string[];
  readonly loadMs: number;
  readonly loadsMs: number[];
}

/**
 * Read `EVERGREEN_TEST_SHARD` (0-based index) and `EVERGREEN_TEST_SHARD_COUNT`.
 * Both must be set together; a missing pair means "run everything".
 */
export function parseShardEnv(env: NodeJS.ProcessEnv = process.env): { index: number; count: number } | undefined {
  const rawIndex = env.EVERGREEN_TEST_SHARD;
  const rawCount = env.EVERGREEN_TEST_SHARD_COUNT;
  if (rawIndex === undefined && rawCount === undefined) return undefined;
  if (rawIndex === undefined || rawCount === undefined) {
    throw new Error("EVERGREEN_TEST_SHARD and EVERGREEN_TEST_SHARD_COUNT must be set together");
  }
  const index = Number(rawIndex);
  const count = Number(rawCount);
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`EVERGREEN_TEST_SHARD must be a non-negative integer, got ${JSON.stringify(rawIndex)}`);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`EVERGREEN_TEST_SHARD_COUNT must be a positive integer, got ${JSON.stringify(rawCount)}`);
  }
  if (index >= count) {
    throw new Error(`EVERGREEN_TEST_SHARD ${index} is out of range for count ${count}`);
  }
  return { index, count };
}

export function parseTestFileTimings(text: string): TestFileTimings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`test file timings are not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("test file timings must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== TEST_FILE_TIMINGS_SCHEMA_VERSION) {
    throw new Error(`test file timings schemaVersion must be "${TEST_FILE_TIMINGS_SCHEMA_VERSION}"`);
  }
  if (record.durations === null || typeof record.durations !== "object" || Array.isArray(record.durations)) {
    throw new Error("test file timings durations must be an object");
  }
  const durations: Record<string, number> = {};
  for (const [file, value] of Object.entries(record.durations as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`test file timings durations["${file}"] must be a non-negative number`);
    }
    durations[file.replaceAll("\\", "/")] = value;
  }
  return {
    schemaVersion: TEST_FILE_TIMINGS_SCHEMA_VERSION,
    durations,
    ...(typeof record.note === "string" ? { note: record.note } : {}),
  };
}

/**
 * Greedy multifit: sort by measured duration descending, place each file on the
 * lightest shard (lowest index on a tie). Returns every shard's file list and load.
 */
export function assignFilesByTime(
  files: readonly string[],
  durationMsFor: (file: string) => number,
  shardCount: number,
): { shards: string[][]; loadsMs: number[] } {
  if (shardCount < 1) throw new Error(`shardCount must be a positive integer, got ${shardCount}`);
  const items = files
    .map((file) => ({ file, ms: durationMsFor(file) }))
    .sort((left, right) => right.ms - left.ms || left.file.localeCompare(right.file));
  const loadsMs = Array.from({ length: shardCount }, () => 0);
  const shards = Array.from({ length: shardCount }, () => [] as string[]);
  for (const item of items) {
    let best = 0;
    for (let index = 1; index < shardCount; index += 1) {
      if (loadsMs[index]! < loadsMs[best]! || (loadsMs[index] === loadsMs[best] && index < best)) {
        best = index;
      }
    }
    shards[best]!.push(item.file);
    loadsMs[best]! += item.ms;
  }
  for (const shard of shards) shard.sort((left, right) => left.localeCompare(right));
  return { shards, loadsMs };
}

export function selectShardFiles(
  files: readonly string[],
  durationMsFor: (file: string) => number,
  shardIndex: number,
  shardCount: number,
): ShardAssignment {
  const { shards, loadsMs } = assignFilesByTime(files, durationMsFor, shardCount);
  return {
    shardIndex,
    shardCount,
    files: shards[shardIndex] ?? [],
    loadMs: loadsMs[shardIndex] ?? 0,
    loadsMs,
  };
}

/** True when every non-empty shard load is within `tolerance` of the lightest (default 20%). */
export function shardLoadsWithinTolerance(loadsMs: readonly number[], tolerance = 0.2): boolean {
  const positive = loadsMs.filter((load) => load > 0);
  if (positive.length <= 1) return true;
  const min = Math.min(...positive);
  const max = Math.max(...positive);
  return max <= min * (1 + tolerance);
}

/**
 * Merge LCOV reports from sharded runs. Hit counts for the same source file are
 * summed so coverage across shards is complete.
 */
export function mergeLcovReports(reports: readonly string[]): string {
  /** @type {Map<string, string[]>} */
  const byFile = new Map<string, string[]>();
  const order: string[] = [];

  for (const report of reports) {
    let currentKey: string | undefined;
    let currentLines: string[] = [];
    const flush = () => {
      if (currentKey === undefined) return;
      const existing = byFile.get(currentKey);
      if (existing === undefined) {
        byFile.set(currentKey, currentLines);
        order.push(currentKey);
      } else {
        byFile.set(currentKey, mergeLcovFileRecords(existing, currentLines));
      }
      currentKey = undefined;
      currentLines = [];
    };

    for (const line of report.split(/\r?\n/)) {
      if (line.startsWith("SF:")) {
        flush();
        currentKey = line.slice(3);
        currentLines = [line];
        continue;
      }
      if (currentKey === undefined) continue;
      if (line === "end_of_record") {
        currentLines.push(line);
        flush();
        continue;
      }
      currentLines.push(line);
    }
    flush();
  }

  const out: string[] = [];
  for (const key of order) {
    const lines = byFile.get(key);
    if (lines) out.push(...lines);
  }
  return out.length === 0 ? "" : `${out.join("\n")}\n`;
}

interface BranchHit {
  readonly line: string;
  readonly branch: number;
  readonly hits: number;
}

function mergeLcovFileRecords(left: readonly string[], right: readonly string[]): string[] {
  const da = new Map<string, number>();
  const fnda = new Map<string, number>();
  const leftBranches: BranchHit[] = [];
  const rightBranches: BranchHit[] = [];
  const other: string[] = [];
  let sf = "";
  let hasEnd = false;

  const ingest = (lines: readonly string[], branches: BranchHit[]) => {
    for (const line of lines) {
      if (line.startsWith("SF:")) {
        sf = line;
        continue;
      }
      if (line === "end_of_record") {
        hasEnd = true;
        continue;
      }
      if (line.startsWith("DA:")) {
        const [lineNo, hits] = splitLcovPair(line.slice(3));
        da.set(lineNo, (da.get(lineNo) ?? 0) + hits);
        continue;
      }
      if (line.startsWith("FNDA:")) {
        const [hitsText, ...nameParts] = line.slice(5).split(",");
        const name = nameParts.join(",");
        const hits = Number(hitsText);
        fnda.set(name, (fnda.get(name) ?? 0) + (Number.isFinite(hits) ? hits : 0));
        continue;
      }
      if (line.startsWith("BRDA:")) {
        const parsed = parseBrda(line);
        if (parsed) branches.push(parsed);
        continue;
      }
      if (
        line.startsWith("LF:") ||
        line.startsWith("LH:") ||
        line.startsWith("FNF:") ||
        line.startsWith("FNH:") ||
        line.startsWith("BRF:") ||
        line.startsWith("BRH:")
      ) {
        continue;
      }
      other.push(line);
    }
  };

  ingest(left, leftBranches);
  ingest(right, rightBranches);

  const out: string[] = [sf, ...other];
  for (const [name, hits] of [...fnda.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(`FNDA:${hits},${name}`);
  }
  const fnh = [...fnda.values()].filter((hits) => hits > 0).length;
  out.push(`FNF:${fnda.size}`);
  out.push(`FNH:${fnh}`);
  for (const [lineNo, hits] of [...da.entries()].sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))) {
    out.push(`DA:${lineNo},${hits}`);
  }
  const lh = [...da.values()].filter((hits) => hits > 0).length;
  out.push(`LF:${da.size}`);
  out.push(`LH:${lh}`);
  // V8 assigns BRDA block ids per process, so (line,block,branch) is not stable across shards.
  // Match by source line and order within that line, then sum hits so each branch is counted once.
  const mergedBranches = mergeBranchHits(leftBranches, rightBranches);
  for (const [index, entry] of mergedBranches.entries()) {
    out.push(`BRDA:${entry.line},${index},${entry.branch},${entry.hits === 0 ? "-" : String(entry.hits)}`);
  }
  const brh = mergedBranches.filter((entry) => entry.hits > 0).length;
  out.push(`BRF:${mergedBranches.length}`);
  out.push(`BRH:${brh}`);
  if (hasEnd) out.push("end_of_record");
  return out;
}

function parseBrda(line: string): BranchHit | undefined {
  const parts = line.slice(5).split(",");
  if (parts.length < 4) return undefined;
  const lineNo = parts[0]!;
  const branch = Number(parts[2]);
  const raw = parts[3]!;
  const hits = raw === "-" ? 0 : Number(raw);
  if (!Number.isFinite(branch) || !Number.isFinite(hits)) return undefined;
  return { line: lineNo, branch, hits };
}

/**
 * Union branch hits from two LCOV records for the same file. Entries on the same
 * source line are paired in order (block ids ignored); unpaired entries are kept.
 */
export function mergeBranchHits(left: readonly BranchHit[], right: readonly BranchHit[]): BranchHit[] {
  const leftByLine = groupBranchesByLine(left);
  const rightByLine = groupBranchesByLine(right);
  const lines = new Set([...leftByLine.keys(), ...rightByLine.keys()]);
  const merged: BranchHit[] = [];
  for (const line of [...lines].sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))) {
    const leftEntries = leftByLine.get(line) ?? [];
    const rightEntries = rightByLine.get(line) ?? [];
    const count = Math.max(leftEntries.length, rightEntries.length);
    for (let index = 0; index < count; index += 1) {
      const leftHit = leftEntries[index];
      const rightHit = rightEntries[index];
      merged.push({
        line,
        branch: leftHit?.branch ?? rightHit?.branch ?? 0,
        hits: (leftHit?.hits ?? 0) + (rightHit?.hits ?? 0),
      });
    }
  }
  return merged;
}

function groupBranchesByLine(entries: readonly BranchHit[]): Map<string, BranchHit[]> {
  const byLine = new Map<string, BranchHit[]>();
  for (const entry of entries) {
    const list = byLine.get(entry.line) ?? [];
    list.push(entry);
    byLine.set(entry.line, list);
  }
  for (const list of byLine.values()) {
    list.sort((a, b) => a.branch - b.branch);
  }
  return byLine;
}

function splitLcovPair(text: string): [string, number] {
  const comma = text.indexOf(",");
  if (comma === -1) return [text, 0];
  const hits = Number(text.slice(comma + 1));
  return [text.slice(0, comma), Number.isFinite(hits) ? hits : 0];
}
