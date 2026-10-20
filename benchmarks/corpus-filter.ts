import { readFile } from "node:fs/promises";

import type { CorpusRepositoryEntry } from "./corpus-harness.js";

export interface CorpusFilter {
  ecosystems: string[];
  repositories: string[];
  /** Path of an earlier report; only its repositories with a mismatch are re-run. */
  failedFrom?: string;
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
  const failedFrom = valuesOf(argv, "--failed-from")[0];
  return {
    ecosystems: valuesOf(argv, "--ecosystem"),
    repositories: valuesOf(argv, "--repo"),
    ...(failedFrom === undefined ? {} : { failedFrom }),
  };
}

/** The repositories that had an UNEXPECTED or MISSING finding in an earlier report. */
export async function readFailedRepositories(reportPath: string): Promise<string[]> {
  let report: { repositories?: Array<{ repository?: unknown; unexpected?: unknown; missing?: unknown }> };
  try {
    report = JSON.parse(await readFile(reportPath, "utf8")) as typeof report;
  } catch (error) {
    throw new Error(`Cannot read the report ${reportPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(report.repositories)) throw new Error(`${reportPath} is not a corpus report: it has no "repositories" list.`);
  const failed = report.repositories.filter(
    (result) =>
      typeof result.repository === "string" &&
      ((Array.isArray(result.unexpected) && result.unexpected.length > 0) || (Array.isArray(result.missing) && result.missing.length > 0)),
  );
  return failed.map((result) => result.repository as string);
}

/**
 * Picks the entries a run covers. Naming several ecosystems and repositories selects the union,
 * kept in corpus order. An unknown name is an error that lists the valid ones.
 */
export function selectCorpusEntries(
  entries: readonly CorpusRepositoryEntry[],
  filter: CorpusFilter,
  failedRepositories: readonly string[] = [],
): CorpusSelection {
  if (filter.ecosystems.length === 0 && filter.repositories.length === 0 && filter.failedFrom === undefined) {
    return { entries: [...entries], full: true, description: undefined };
  }
  const ecosystems = [...new Set(entries.map((entry) => entry.ecosystem))].sort();
  const unknownEcosystems = filter.ecosystems.filter((name) => !ecosystems.includes(name as never));
  if (unknownEcosystems.length > 0) {
    throw new Error(`Unknown ecosystem ${unknownEcosystems.map((name) => `"${name}"`).join(", ")}. Valid ecosystems: ${ecosystems.join(", ")}.`);
  }
  const repositories = entries.map((entry) => entry.repository).sort();
  // A repository named by an old report may have left the corpus since; it is skipped, not an error.
  const known = failedRepositories.filter((name) => repositories.some((repository) => repository.toLowerCase() === name.toLowerCase()));
  const wanted = new Set([...filter.repositories, ...known].map((name) => name.toLowerCase()));
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
    ...(filter.failedFrom === undefined ? [] : [`mismatches in ${filter.failedFrom}`]),
  ];
  return {
    entries: selected,
    full: false,
    description: `FILTERED RUN (${parts.join("; ")}): ${selected.length} of ${entries.length} entries. This is not a full run; precision floors are not enforced and no full-run record is written.`,
  };
}
