import { ecosystems, matchesForm, profiles, type Ecosystem } from "./profiles.js";
import { snapshotSchema, type Evidence, type Snapshot } from "./snapshot.js";

function activityCutoff(date: string): string {
  const end = new Date(`${date}T00:00:00Z`);
  const year = end.getUTCFullYear() - 2;
  const month = end.getUTCMonth();
  const day = Math.min(end.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString();
}

function evaluate(item: Evidence, ecosystem: Ecosystem, date: string) {
  const pin = item.commit?.sha ?? null;
  const paths = item.tree?.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path) ?? [];
  const forms = profiles[ecosystem].filter((form) => paths.some((path) => matchesForm(path, form)));
  const license = item.licenseReview;
  const commitDate = item.commit?.commit.committer.date;
  const checks = {
    independent:
      !item.repository.private && !item.repository.fork && !item.repository.archived && !item.repository.mirror_url,
    pin: pin !== null && item.ref === item.repository.default_branch,
    activity:
      commitDate !== undefined &&
      Date.parse(commitDate) >= Date.parse(activityCutoff(date)) &&
      Date.parse(commitDate) < Date.parse(`${date}T00:00:00Z`) + 86400000,
    size: item.repository.size <= 50000,
    tree: item.tree !== null && !item.tree.truncated && item.tree.sha === item.commit?.commit.tree.sha,
    license:
      license !== null &&
      pin !== null &&
      license.commit === pin &&
      license.osiApproved &&
      license.coversInputs &&
      !["NOASSERTION", "NONE"].includes(license.spdxId) &&
      paths.includes(license.path),
    ecosystem: forms.length > 0,
    primaryBucket: true,
  };
  return {
    repository: `https://github.com/${item.repository.full_name}`,
    repositoryId: item.repository.id,
    commit: pin,
    checks,
    eligible: Object.values(checks).every(Boolean),
    reasons: Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name),
    stratum: `${forms[0] ?? "unverified"}:${item.repository.size <= 5000 ? "small" : "medium"}`,
    forms,
    sizeKb: item.repository.size,
    commitDate: commitDate ?? null,
    licenseReview: license,
  };
}

function roundRobin<T extends { stratum: string; repository: string }>(items: T[], order: string[]): T[] {
  const groups = order.map((stratum) =>
    items
      .filter((item) => item.stratum === stratum)
      .sort((a, b) => a.repository.toLowerCase().localeCompare(b.repository.toLowerCase(), "en")),
  );
  const result: T[] = [];
  for (let index = 0; groups.some((group) => group.length > index); index++) {
    for (const group of groups) {
      const item = group[index];
      if (item) result.push(item);
    }
  }
  return result;
}

function findBucket(snapshot: Snapshot, ecosystem: Ecosystem, count: number, assigned: Set<number>) {
  const sources = snapshot.sources.filter((source) => source.ecosystem === ecosystem);
  const seen = new Set<number>();
  const duplicates: Array<{ repositoryId: number; commit: string | null }> = [];
  const candidates = sources.flatMap((source, sourceIndex) =>
    source.items.flatMap((item) => {
      if (seen.has(item.repository.id)) {
        duplicates.push({ repositoryId: item.repository.id, commit: item.commit?.sha ?? null });
        return [];
      }
      seen.add(item.repository.id);
      const candidate = { ...evaluate(item, ecosystem, snapshot.discoveredAt), sourceIndex };
      if (assigned.has(item.repository.id)) {
        candidate.checks.primaryBucket = false;
        candidate.eligible = false;
        candidate.reasons.push("primary-bucket-already-assigned");
      }
      return [candidate];
    }),
  );
  const strata = [...profiles[ecosystem], "unverified"].flatMap((form) => [`${form}:small`, `${form}:medium`]);
  const ordered = roundRobin(candidates, strata);
  const reviewed = ordered.slice(0, count).map((item, index) => ({ ...item, order: index + 1 }));
  for (const item of reviewed) if (item.eligible) assigned.add(item.repositoryId);
  return {
    ecosystem,
    requested: count,
    shortfall: Math.max(0, count - reviewed.length),
    eligible: reviewed.filter((item) => item.eligible).length,
    // Candidates are not independently labeled corpus entries and do not count toward 200.
    reviewedCorpusCount: 0,
    sources: sources.map(({ items, ...source }) => ({ ...source, exported: items.length })),
    strata: strata.map((name) => ({ name, available: candidates.filter((item) => item.stratum === name).length })),
    duplicates,
    candidates: reviewed,
    remaining: ordered.length - reviewed.length,
  };
}

/** Query saved public-source metadata only. Never fetch, scan, or execute a repository. */
export function findCandidates(input: unknown, count = 300) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("Candidate count must be a positive safe integer");
  const snapshot = snapshotSchema.parse(input);
  const assigned = new Set<number>();
  return {
    schemaVersion: "evergreen.candidates.v1",
    policy: "0030",
    discoveredAt: snapshot.discoveredAt,
    activityCutoff: activityCutoff(snapshot.discoveredAt),
    selection: "blind",
    buckets: ecosystems.map((ecosystem) => findBucket(snapshot, ecosystem, count, assigned)),
  };
}
