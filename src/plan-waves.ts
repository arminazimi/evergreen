import { severityValues } from "./domain.js";
import type { Severity } from "./domain.js";

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

/**
 * Group tasks into waves so no two tasks in a wave touch the same path.
 *
 * Deterministic greedy colouring: tasks are ordered by severity (highest first) then id, and
 * each task joins the first wave whose tasks it conflicts with none of. A new wave is added
 * when every existing wave already holds a conflicting task.
 */
export function scheduleWaves(
  items: Array<{ id: string; touches: string[]; severity: Severity }>,
): string[][] {
  const ordered = [...items].sort(
    (left, right) =>
      (severityRank.get(right.severity) ?? 0) - (severityRank.get(left.severity) ?? 0) ||
      left.id.localeCompare(right.id),
  );

  const waves: string[][] = [];
  const touched: Array<Set<string>> = [];

  for (const item of ordered) {
    const paths = new Set(item.touches);
    let wave = touched.findIndex((used) => [...paths].every((path) => !used.has(path)));
    if (wave === -1) {
      wave = waves.length;
      waves.push([]);
      touched.push(new Set());
    }
    waves[wave]!.push(item.id);
    for (const path of paths) touched[wave]!.add(path);
  }

  return waves;
}
