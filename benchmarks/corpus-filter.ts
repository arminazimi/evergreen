import type { CorpusRepositoryEntry } from "./corpus-harness.js";

export interface CorpusFilter {
  ecosystems: string[];
  repositories: string[];
}

export interface CorpusSelection {
  entries: CorpusRepositoryEntry[];
  /** True when the run covers the whole corpus; a filtered run is never a full run. */
  full: boolean;
  /** One line describing a filtered run, for the run output. */
  description: string | undefined;
}

function valuesOf(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (const [index, argument] of argv.entries()) {
    if (argument === flag) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
      values.push(value);
    } else if (argument.startsWith(`${flag}=`)) {
      values.push(argument.slice(flag.length + 1));
    }
  }
  return values;
}

/** Reads the repeatable `--ecosystem <name>` and `--repo <owner/name>` flags. */
export function parseCorpusFilter(argv: readonly string[] = process.argv): CorpusFilter {
  return { ecosystems: valuesOf(argv, "--ecosystem"), repositories: valuesOf(argv, "--repo") };
}

/**
 * Picks the entries a run covers. Naming several ecosystems and repositories selects the union,
 * kept in corpus order. An unknown name is an error that lists the valid ones.
 */
export function selectCorpusEntries(
  entries: readonly CorpusRepositoryEntry[],
  filter: CorpusFilter,
): CorpusSelection {
  if (filter.ecosystems.length === 0 && filter.repositories.length === 0) {
    return { entries: [...entries], full: true, description: undefined };
  }
  const ecosystems = [...new Set(entries.map((entry) => entry.ecosystem))].sort();
  const unknownEcosystems = filter.ecosystems.filter((name) => !ecosystems.includes(name as never));
  if (unknownEcosystems.length > 0) {
    throw new Error(`Unknown ecosystem ${unknownEcosystems.map((name) => `"${name}"`).join(", ")}. Valid ecosystems: ${ecosystems.join(", ")}.`);
  }
  const repositories = entries.map((entry) => entry.repository).sort();
  const wanted = new Set(filter.repositories.map((name) => name.toLowerCase()));
  const unknownRepositories = filter.repositories.filter(
    (name) => !repositories.some((repository) => repository.toLowerCase() === name.toLowerCase()),
  );
  if (unknownRepositories.length > 0) {
    throw new Error(`Unknown repository ${unknownRepositories.map((name) => `"${name}"`).join(", ")}. Valid repositories:\n${repositories.join("\n")}`);
  }
  const selected = entries.filter(
    (entry) => filter.ecosystems.includes(entry.ecosystem) || wanted.has(entry.repository.toLowerCase()),
  );
  const parts = [
    ...(filter.ecosystems.length > 0 ? [`ecosystem ${filter.ecosystems.join(", ")}`] : []),
    ...(filter.repositories.length > 0 ? [`repository ${filter.repositories.join(", ")}`] : []),
  ];
  return {
    entries: selected,
    full: false,
    description: `FILTERED RUN (${parts.join("; ")}): ${selected.length} of ${entries.length} entries. This is not a full run; precision floors are not enforced and no full-run record is written.`,
  };
}
