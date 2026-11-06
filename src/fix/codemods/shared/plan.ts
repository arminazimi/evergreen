import type { Finding, SourceUsage } from "../../../domain.js";
import type { FilePatch, Refuse } from "../../types.js";

/** Groups targets by the file their usage names, in scan order. */
export function groupByPath<T extends { usage: SourceUsage }>(targets: readonly T[]): Map<string, T[]> {
  const byPath = new Map<string, T[]>();
  for (const target of targets) {
    const list = byPath.get(target.usage.location.path) ?? [];
    list.push(target);
    byPath.set(target.usage.location.path, list);
  }
  return byPath;
}

/** Sorts targets by usage position, then rule id, without mutating the caller's list. */
export function sortTargets<T extends { usage: SourceUsage }>(
  targets: readonly T[],
  ruleId: (target: T) => string,
): T[] {
  return [...targets].sort(
    (left, right) =>
      (left.usage.location.line ?? 0) - (right.usage.location.line ?? 0) ||
      (left.usage.location.column ?? 0) - (right.usage.location.column ?? 0) ||
      ruleId(left).localeCompare(ruleId(right)),
  );
}

/** Reports the same refusal for every target in a file. */
export function declineAll(targets: readonly { finding: Finding }[], refuse: Refuse | undefined, reason: string): void {
  for (const target of targets) refuse?.(target.finding, reason);
}

/** Plans every file in path order, keeping the patches of the files that change. */
export async function planEachFile<T>(
  groups: ReadonlyMap<string, readonly T[]>,
  plan: (path: string, targets: readonly T[]) => Promise<FilePatch | undefined>,
): Promise<FilePatch[]> {
  const patches: FilePatch[] = [];
  for (const path of [...groups.keys()].sort((left, right) => left.localeCompare(right))) {
    const patch = await plan(path, groups.get(path) ?? []);
    if (patch !== undefined) patches.push(patch);
  }
  return patches;
}
