// Turns the raw per-repository records into the committed result. Pure: no network, no clock, no
// repository code, and no dependence on the registry, because each raw record already holds the
// bridge target it was collected with.

import { directoryMatches } from "./config.js";
import type {
  ComparisonResult,
  ConfigEntry,
  ConfiguredRepository,
  EcosystemResult,
  GroupResult,
  OutcomeCounts,
  RawFinding,
  RawRecord,
  Selection,
  Standing,
  SurfaceCounts,
} from "./types.js";
import { RESULT_SCHEMA_VERSION } from "./types.js";

const SELECTIONS: readonly Selection[] = ["blind", "targeted"];

const NOT_RUN_REASON =
  "Dependabot runs inside GitHub's service against a default branch and this repository has no runner, so no head-to-head run exists (docs/COMPARISON_METHOD.md section 7).";

const text = (left: string, right: string) => left.localeCompare(right);

const emptyOutcomes = (): OutcomeCounts => ({ covered: 0, uncovered: 0, filtered: 0, "not-comparable": 0 });
const emptySurface = (): SurfaceCounts => ({ covered: 0, uncovered: 0, filtered: 0 });

/**
 * Where one finding stands against the repository's committed Dependabot configuration.
 *
 * `covered` means a matching `(package-ecosystem, directory)` entry exists and declares no
 * `ignore`/`allow` filter. It does not mean Dependabot reported anything: it means the package and
 * directory are inside the update surface the repository asked Dependabot to watch.
 */
export function standing(finding: RawFinding, entries: readonly ConfigEntry[]): Standing {
  const target = finding.dependabot;
  if (target === null) return "not-comparable";
  const matching = entries.filter(
    (entry) =>
      entry.packageEcosystem === target.packageEcosystem && directoryMatches(entry.directory, target.directory),
  );
  if (matching.some((entry) => !entry.ignore && !entry.allow)) return "covered";
  return matching.length > 0 ? "filtered" : "uncovered";
}

function recordStandings(record: RawRecord): Standing[] {
  return record.evergreen.findings.map((finding) => standing(finding, record.dependabot.entries));
}

function byEcosystem(standings: readonly Standing[], findings: readonly RawFinding[]): EcosystemResult[] {
  const counts = new Map<string, SurfaceCounts>();
  for (const [index, value] of standings.entries()) {
    const target = findings[index]!.dependabot;
    if (target === null) continue;
    const surface = counts.get(target.packageEcosystem) ?? emptySurface();
    if (value !== "not-comparable") surface[value]++;
    counts.set(target.packageEcosystem, surface);
  }
  return [...counts.entries()]
    .map(([packageEcosystem, surface]) => ({ packageEcosystem, counts: surface }))
    .sort((left, right) => text(left.packageEcosystem, right.packageEcosystem));
}

function notComparableRules(
  findings: readonly RawFinding[],
  standings: readonly Standing[],
): GroupResult["notComparableRules"] {
  const counts = new Map<string, number>();
  for (const [index, value] of standings.entries()) {
    if (value !== "not-comparable") continue;
    const family = findings[index]!.ruleId.split(".").slice(0, 2).join(".");
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([family, findings]) => ({ family, findings }))
    .sort((left, right) => right.findings - left.findings || text(left.family, right.family));
}

function groupResult(selection: Selection, records: readonly RawRecord[]): GroupResult {
  const outcomes = emptyOutcomes();
  let uncoveredWithoutConfig = 0;
  let uncoveredWithConfig = 0;
  let configEntries = 0;
  let filteredConfigEntries = 0;
  const allStandings: Standing[] = [];
  const allFindings: RawFinding[] = [];

  for (const record of records) {
    const standings = recordStandings(record);
    configEntries += record.dependabot.entries.length;
    filteredConfigEntries += record.dependabot.entries.filter((entry) => entry.ignore || entry.allow).length;
    for (const [index, value] of standings.entries()) {
      outcomes[value]++;
      if (value === "uncovered") {
        if (record.dependabot.configPath === undefined) uncoveredWithoutConfig++;
        else uncoveredWithConfig++;
      }
      allStandings.push(value);
      allFindings.push(record.evergreen.findings[index]!);
    }
  }

  return {
    selection,
    repositories: records.length,
    repositoriesWithConfig: records.filter((record) => record.dependabot.configPath !== undefined).length,
    repositoriesWithoutConfig: records.filter((record) => record.dependabot.configPath === undefined).length,
    configEntries,
    filteredConfigEntries,
    evergreenFindings: allFindings.length,
    outcomes,
    uncoveredWithoutConfig,
    uncoveredWithConfig,
    byEcosystem: byEcosystem(allStandings, allFindings),
    notComparableRules: notComparableRules(allFindings, allStandings),
  };
}

function configuredRepositories(records: readonly RawRecord[]): ConfiguredRepository[] {
  return records
    .filter(
      (record): record is RawRecord & { dependabot: { configPath: string } } =>
        record.dependabot.configPath !== undefined,
    )
    .map((record) => {
      const standings = recordStandings(record);
      return {
        repository: record.repository,
        commit: record.commit,
        selection: record.selection,
        configPath: record.dependabot.configPath,
        entries: record.dependabot.entries.length,
        findings: standings.length,
        covered: standings.filter((value) => value === "covered").length,
        uncovered: standings.filter((value) => value === "uncovered").length,
        filtered: standings.filter((value) => value === "filtered").length,
        notComparable: standings.filter((value) => value === "not-comparable").length,
      };
    })
    .sort((left, right) => text(left.repository, right.repository));
}

export function buildResult(records: readonly RawRecord[]): ComparisonResult {
  const ordered = [...records].sort((left, right) => text(left.repository, right.repository));
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    method: "docs/COMPARISON_METHOD.md",
    dependabot: { run: "not-run", reason: NOT_RUN_REASON },
    evergreenVersions: [...new Set(ordered.map((record) => record.evergreen.version))].sort(text),
    evergreenCommits: [...new Set(ordered.map((record) => record.evergreen.commit))].sort(text),
    groups: SELECTIONS.map((selection) =>
      groupResult(
        selection,
        ordered.filter((record) => record.selection === selection),
      ),
    ).filter((group) => group.repositories > 0),
    continuity: ordered.filter((record) => record.continuity).map((record) => record.repository),
    configuredRepositories: configuredRepositories(ordered),
    configErrors: ordered
      .flatMap((record) =>
        record.dependabot.parseError === undefined
          ? []
          : [{ repository: record.repository, detail: record.dependabot.parseError }],
      )
      .sort((left, right) => text(left.repository, right.repository)),
  };
}
