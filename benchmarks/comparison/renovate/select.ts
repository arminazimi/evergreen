// The repository subset, fixed by docs/COMPARISON_METHOD.md section 4: the blind half of the pinned corpus plus
// every repository that already has a committed differential report. Blind and targeted are reported apart.

import type { CorpusRepositoryEntry } from "../../corpus-harness.js";
import type { Selection } from "./types.js";

export interface Selected {
  entry: CorpusRepositoryEntry;
  selection: Selection;
  continuity: boolean;
}

export function selectRepositories(
  entries: readonly CorpusRepositoryEntry[],
  continuity: ReadonlySet<string>,
): Selected[] {
  const selected: Selected[] = [];
  for (const entry of entries) {
    const selection: Selection = entry.selection === "blind" ? "blind" : "targeted";
    const inContinuity = continuity.has(entry.repository);
    if (selection === "blind" || inContinuity) selected.push({ entry, selection, continuity: inContinuity });
  }
  return selected.sort((left, right) => left.entry.repository.localeCompare(right.entry.repository));
}

/** `owner/name` → the file name its raw record is stored under. */
export const rawFileName = (repository: string): string => `${repository.replace("/", "__")}.json`;

/** The corpus cache directory holding a pinned checkout (`owner__name@commit`). */
export const checkoutDirName = (entry: Pick<CorpusRepositoryEntry, "repository" | "commit">): string =>
  `${entry.repository.replace("/", "__")}@${entry.commit}`;
