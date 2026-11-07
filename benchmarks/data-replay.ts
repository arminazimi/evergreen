// Replays past data releases on pinned repositories: `npm run replay:data`.
//
// Every release (a `data-v*` tag) and the working tree's `registry/` are scanned against the same repository
// checkouts with the same Evergreen code, so any difference between two scans comes from the data alone. Each
// changed finding must be explained by a rule that was added, removed, or edited between the two releases (or
// by the GitHub Actions SHA map for github-actions findings). A change nothing explains fails the run: data
// updates must not cause surprises. Scans stay offline; only fetching the pinned checkouts uses the network.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { builtInDetectors } from "../src/detectors/index.js";
import {
  BUNDLED_ECOSYSTEMS,
  buildDataBundle,
  canonicalJson,
  computeContentDigest,
  serializeDataBundle,
  sha256Hex,
} from "../src/data-bundle.js";
import { BUNDLE_FILE, configureActiveData, SIGNATURE_FILE } from "../src/data-source.js";
import { scanRepository } from "../src/engine/index.js";
import { VERSION } from "../src/version.js";
import { ensureCorpusCacheEntry, resolveCorpusCacheDir } from "./corpus-cache.js";
import { inBatches, resolveCorpusConcurrency } from "./corpus-harness.js";
import { fetchWith, isCheckoutUsable, resolveFetchStrategy } from "./corpus-fetch.js";
import { parseOutputPath } from "./corpus-report.js";

const exec = promisify(execFile);

export const DATA_REPLAY_SCHEMA_VERSION = "evergreen.data-replay.v1" as const;
export const DATA_TAG_PATTERN = /^data-v(\d{4}\.\d{2}\.\d{2})(?:\.(\d+))?$/;
const SHA_MAP_PATH = "registry/github-actions-shas.json";

export interface ReplayRepository {
  repository: string;
  commit: string;
  ecosystem: string;
}

/** One finding as the replay compares it: where it is and which rule raised it. */
export interface ReplayFinding {
  ruleId: string;
  path: string;
  line?: number;
}

export type RuleChange = "added" | "removed" | "changed";

export interface ChangedRule {
  ruleId: string;
  change: RuleChange;
  file: string;
}

export interface FindingChange {
  kind: "appeared" | "disappeared";
  repository: string;
  ruleId: string;
  path: string;
  line?: number;
  /** What explains the change, or undefined when nothing in the data difference does. */
  explanation?: string;
}

const findingKey = (finding: ReplayFinding): string =>
  `${finding.ruleId}\u0000${finding.path}\u0000${finding.line ?? ""}`;

/** The data release tags in `tags`, oldest first by calendar version and revision. */
export function sortDataTags(tags: readonly string[]): string[] {
  const parsed = tags.flatMap((tag) => {
    const match = DATA_TAG_PATTERN.exec(tag);
    return match ? [{ tag, date: match[1] ?? "", revision: Number(match[2] ?? 1) }] : [];
  });
  return parsed
    .sort((left, right) => left.date.localeCompare(right.date) || left.revision - right.revision)
    .map((item) => item.tag);
}

/** Findings present in only one of the two scans of a repository; several findings on one line count separately. */
export function diffFindings(
  repository: string,
  before: readonly ReplayFinding[],
  after: readonly ReplayFinding[],
): FindingChange[] {
  const had = new Set(before.map(findingKey));
  const has = new Set(after.map(findingKey));
  const make = (kind: FindingChange["kind"], finding: ReplayFinding): FindingChange => ({
    kind,
    repository,
    ruleId: finding.ruleId,
    path: finding.path,
    ...(finding.line === undefined ? {} : { line: finding.line }),
  });
  const seen = new Set<string>();
  const unique = (finding: ReplayFinding) => !seen.has(findingKey(finding)) && seen.add(findingKey(finding));
  return [
    ...after.filter((finding) => !had.has(findingKey(finding)) && unique(finding)).map((f) => make("appeared", f)),
    ...before.filter((finding) => !has.has(findingKey(finding)) && unique(finding)).map((f) => make("disappeared", f)),
  ].sort(
    (a, b) =>
      a.repository.localeCompare(b.repository) || a.path.localeCompare(b.path) || a.ruleId.localeCompare(b.ruleId),
  );
}

/**
 * What can change a finding: a rule without its evidence trail. Sources and provenance say where a rule came from
 * and when it was reviewed, not what it matches, so a release that only re-reviewed a rule changes no finding.
 */
function scanInputs(rule: object): object {
  const { sources: _sources, provenance: _provenance, ...rest } = rule as Record<string, unknown>;
  return rest;
}

type RegistryFile = { rules?: Array<{ id?: unknown }>; actions?: unknown };

/** Rules added, removed, or edited between two versions of one data file (`file` names it in the result). */
export function diffRegistryFile(file: string, before: unknown, after: unknown): ChangedRule[] {
  const index = (value: unknown): Map<string, string> =>
    new Map(
      ((value as RegistryFile | undefined)?.rules ?? []).flatMap((rule) =>
        typeof rule.id === "string" ? [[rule.id, canonicalJson(scanInputs(rule))] as const] : [],
      ),
    );
  const was = index(before);
  const is = index(after);
  const changes: ChangedRule[] = [];
  for (const [ruleId, text] of is) {
    const previous = was.get(ruleId);
    if (previous === undefined) changes.push({ ruleId, change: "added", file });
    else if (previous !== text) changes.push({ ruleId, change: "changed", file });
  }
  for (const ruleId of was.keys()) if (!is.has(ruleId)) changes.push({ ruleId, change: "removed", file });
  return changes.sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

/** Everything that differs between two releases: rule changes, and whether the GitHub Actions SHA map changed. */
export interface DataDifference {
  rules: ChangedRule[];
  shaMapChanged: boolean;
}

export function diffReleases(before: ReleaseFiles, after: ReleaseFiles): DataDifference {
  const rules = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((file) => file !== SHA_MAP_PATH)
    .sort()
    .flatMap((file) => diffRegistryFile(file, before[file], after[file]));
  return {
    rules,
    shaMapChanged: canonicalJson(before[SHA_MAP_PATH] ?? null) !== canonicalJson(after[SHA_MAP_PATH] ?? null),
  };
}

/** Says why `ruleId` may differ between the releases, or undefined when no data difference accounts for it. */
export function explainRule(ruleId: string, difference: DataDifference): string | undefined {
  const rule = difference.rules.find((item) => ruleId === item.ruleId || ruleId.startsWith(`${item.ruleId}.`));
  if (rule) return `rule ${rule.ruleId} was ${rule.change} in ${rule.file}`;
  if (difference.shaMapChanged && ruleId.startsWith("github-actions.")) return `${SHA_MAP_PATH} changed`;
  return undefined;
}

export function explainChanges(changes: readonly FindingChange[], difference: DataDifference): FindingChange[] {
  return changes.map((change) => {
    const explanation = explainRule(change.ruleId, difference);
    return explanation === undefined ? change : { ...change, explanation };
  });
}

export const unexplained = (changes: readonly FindingChange[]): FindingChange[] =>
  changes.filter((change) => change.explanation === undefined);

/** Parsed data files of one release, by path (`registry/npm.json`). */
export type ReleaseFiles = Record<string, unknown>;

export interface Release {
  /** The tag, or `working-tree` for the registry in the checkout. */
  label: string;
  /** UTC `YYYY-MM-DDTHH:MM:SSZ`. */
  createdAt: string;
  files: ReleaseFiles;
}

const isDataFile = (path: string): boolean =>
  /^registry\/[a-z0-9][a-z0-9-]*\.json$/.test(path) && !path.endsWith(".lock.json") && !path.includes("sources.lock");

async function git(...args: string[]): Promise<string> {
  return (await exec("git", args, { maxBuffer: 64 * 1024 * 1024 })).stdout;
}

const utc = async (revision: string): Promise<string> =>
  (await git("log", "-1", "--format=%cd", "--date=format-local:%Y-%m-%dT%H:%M:%SZ", revision)).trim();

const isRegistryOrShaMap = (value: unknown): boolean => {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof version === "string" && (version === "evergreen.registry.v2" || /sha/i.test(version));
};

/** A registry with no rules, standing in for a file a release did not have yet (its rules then count as added). */
const emptyFile = (path: string): unknown =>
  path === SHA_MAP_PATH
    ? { schemaVersion: "evergreen.github-actions-shas.v1", actions: {} }
    : { schemaVersion: "evergreen.registry.v2", ecosystem: path.replace(/^registry\/|\.json$/g, ""), rules: [] };

/**
 * Brings a release published before a stricter registry schema up to what the current loader accepts, without
 * touching anything a scan reads: a source with no `accessedAt` gets the rule's `observedAt`, and a file the
 * release lacked becomes an empty registry. Without this the oldest releases could not be replayed at all.
 */
function normalizeRelease(files: ReleaseFiles): ReleaseFiles {
  const result: ReleaseFiles = {};
  for (const [path, value] of Object.entries(files)) {
    const registry = value as { rules?: Array<Record<string, any>> };
    result[path] = Array.isArray(registry.rules)
      ? {
          ...registry,
          rules: registry.rules.map((rule) => ({
            ...rule,
            sources: Array.isArray(rule.sources)
              ? rule.sources.map((source: Record<string, unknown>) => ({
                  ...source,
                  accessedAt: source.accessedAt ?? rule.provenance?.observedAt ?? "1970-01-01",
                }))
              : rule.sources,
          })),
        }
      : value;
  }
  for (const ecosystem of BUNDLED_ECOSYSTEMS)
    result[`registry/${ecosystem}.json`] ??= emptyFile(`registry/${ecosystem}.json`);
  result[SHA_MAP_PATH] ??= emptyFile(SHA_MAP_PATH);
  return result;
}

/** Reads every data file as it was at `revision`. */
async function releaseAt(label: string, revision: string): Promise<Release> {
  const files: ReleaseFiles = {};
  for (const path of (await git("ls-tree", "--name-only", revision, "registry/")).split("\n").filter(isDataFile)) {
    const value = JSON.parse(await git("show", `${revision}:${path}`)) as unknown;
    if (isRegistryOrShaMap(value)) files[path] = value;
  }
  return { label, createdAt: await utc(revision), files: normalizeRelease(files) };
}

async function workingTreeRelease(): Promise<Release> {
  const files: ReleaseFiles = {};
  for (const name of (await readdir(resolve("registry"))).map((entry) => `registry/${entry}`).filter(isDataFile)) {
    const value = JSON.parse(await readFile(resolve(name), "utf8")) as unknown;
    if (isRegistryOrShaMap(value)) files[name] = value;
  }
  return { label: "working-tree", createdAt: await utc("HEAD"), files: normalizeRelease(files) };
}

/** The last `count` data releases followed by the working tree, oldest first. */
export async function loadReleases(count: number): Promise<Release[]> {
  const tags = sortDataTags((await git("tag", "--list", "data-v*")).split("\n").filter(Boolean)).slice(-count);
  return [...(await Promise.all(tags.map((tag) => releaseAt(tag, tag)))), await workingTreeRelease()];
}

/**
 * Writes `release` as a bundle into a data cache directory and returns the version to pin. The bundle is built
 * with the real builder, so the replay reads data through the same path as a pinned user does; only the
 * signature check is replaced, because replayed data was not signed for this run. A registry the release has but
 * the builder no longer ships is added so every detector still has its data.
 */
async function installRelease(cache: string, release: Release, revision: number): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-replay-data-"));
  try {
    for (const [path, value] of Object.entries(release.files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), JSON.stringify(value));
    }
    const bundle = await buildDataBundle({
      root,
      createdAt: release.createdAt,
      revision,
      minimumEvergreenVersion: VERSION,
    });
    for (const [path, value] of Object.entries(release.files)) {
      if (path in bundle.files || path === SHA_MAP_PATH) continue;
      const content = value as { ecosystem: string; schemaVersion: string; rules: unknown[] };
      const canonical = canonicalJson(content);
      bundle.files[path] = content;
      bundle.manifest.files.push({
        path,
        kind: "registry",
        ecosystem: content.ecosystem,
        schemaVersion: content.schemaVersion,
        rules: content.rules.length,
        maxReviewAgeDays: 365,
        sha256: sha256Hex(canonical),
        bytes: Buffer.byteLength(canonical, "utf8"),
      });
    }
    bundle.manifest.files.sort((left, right) => (left.path < right.path ? -1 : 1));
    bundle.manifest.contentDigest = computeContentDigest(bundle.manifest.files);
    const directory = join(cache, "data", bundle.manifest.version);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, BUNDLE_FILE), serializeDataBundle(bundle));
    await writeFile(join(directory, SIGNATURE_FILE), "{}\n");
    return bundle.manifest.version;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export interface ReplayStep {
  from: string;
  to: string;
  changes: FindingChange[];
}

export interface ReplayReport {
  schemaVersion: typeof DATA_REPLAY_SCHEMA_VERSION;
  releases: string[];
  /** Releases the current Evergreen refuses to load (for example, data from before a stricter registry schema). */
  skipped: Array<{ release: string; reason: string }>;
  repositories: number;
  scannedAt: string;
  steps: ReplayStep[];
  unexplained: number;
}

type Scans = Map<string, ReplayFinding[]>;

async function scanAll(checkouts: ReadonlyMap<string, string>, scannedAt: string): Promise<Scans> {
  const rows = await inBatches([...checkouts], resolveCorpusConcurrency(), async ([repository, path]) => {
    const scan = await scanRepository(path, builtInDetectors, { noCache: true, scannedAt });
    const findings = scan.findings
      .filter((finding) => finding.dependencyPath === undefined)
      .map((finding) => ({
        ruleId: finding.ruleId,
        path: finding.location.path,
        ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
      }));
    return [repository, findings] as const;
  });
  return new Map(rows);
}

/** Replays `releases` over the checkouts and compares each release with the one before it. */
export async function replay(
  releases: readonly Release[],
  checkouts: ReadonlyMap<string, string>,
): Promise<ReplayReport> {
  // One clock for every scan, so date-dependent findings (a deadline passing) cannot differ between releases.
  const scannedAt = releases[releases.length - 1]?.createdAt ?? new Date(0).toISOString();
  const cache = await mkdtemp(join(tmpdir(), "evergreen-replay-cache-"));
  const scans: Scans[] = [];
  const replayed: Release[] = [];
  const skipped: ReplayReport["skipped"] = [];
  try {
    for (const [index, release] of releases.entries()) {
      let version: string;
      try {
        version = await installRelease(cache, release, index + 1);
      } catch (error) {
        // Data the current code cannot load cannot be replayed; say so instead of comparing against nothing.
        skipped.push({ release: release.label, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      configureActiveData({
        cacheDirectory: cache,
        pinnedVersion: version,
        verifySignature: () => ({ identity: "data-replay", issuer: "data-replay" }),
      });
      scans.push(await scanAll(checkouts, scannedAt));
      replayed.push(release);
    }
  } finally {
    configureActiveData();
    await rm(cache, { recursive: true, force: true });
  }
  const steps: ReplayStep[] = [];
  for (let index = 1; index < replayed.length; index += 1) {
    const [from, to] = [replayed[index - 1], replayed[index]] as [Release, Release];
    const difference = diffReleases(from.files, to.files);
    const changes = [...checkouts.keys()].flatMap((repository) =>
      explainChanges(
        diffFindings(repository, scans[index - 1]?.get(repository) ?? [], scans[index]?.get(repository) ?? []),
        difference,
      ),
    );
    steps.push({ from: from.label, to: to.label, changes });
  }
  return {
    schemaVersion: DATA_REPLAY_SCHEMA_VERSION,
    releases: replayed.map((release) => release.label),
    skipped,
    repositories: checkouts.size,
    scannedAt,
    steps,
    unexplained: steps.reduce((sum, step) => sum + unexplained(step.changes).length, 0),
  };
}

export function formatReplay(report: ReplayReport): string[] {
  const lines: string[] = [];
  for (const step of report.steps) {
    lines.push(`${step.from} -> ${step.to}: ${step.changes.length} changed finding(s)`);
    for (const change of step.changes) {
      const where = `${change.repository} ${change.path}${change.line === undefined ? "" : `:${change.line}`}`;
      lines.push(
        `  ${change.explanation === undefined ? "UNEXPLAINED" : "explained  "} ${change.kind} ${change.ruleId} ${where}${change.explanation === undefined ? "" : ` (${change.explanation})`}`,
      );
    }
  }
  for (const item of report.skipped) lines.push(`skipped ${item.release}: ${item.reason.split("\n")[0]}`);
  lines.push(
    `data-replay: ${report.releases.length} releases, ${report.repositories} repositories, ${report.unexplained} unexplained change(s)`,
  );
  return lines;
}

function parseCount(argv: readonly string[]): number {
  const index = argv.indexOf("--releases");
  if (index === -1) return 3;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) throw new Error("--releases needs a positive integer.");
  return value;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = JSON.parse(await readFile(resolve("benchmarks/data-replay/repositories.json"), "utf8")) as {
    repositories: ReplayRepository[];
  };
  const strategy = resolveFetchStrategy();
  const cacheDir = resolveCorpusCacheDir();
  const root = await mkdtemp(join(tmpdir(), "evergreen-data-replay-"));
  try {
    const releases = await loadReleases(parseCount(process.argv));
    const paths = await inBatches(file.repositories, resolveCorpusConcurrency(), async (entry, index) => {
      const fetchInto = async (directory: string) => {
        await fetchWith(strategy, directory, entry);
      };
      const path = cacheDir
        ? (await ensureCorpusCacheEntry(cacheDir, entry, fetchInto, (existing) => isCheckoutUsable(existing, strategy)))
            .path
        : await (async () => {
            const target = join(root, String(index));
            await fetchInto(target);
            return target;
          })();
      return [entry.repository, path] as const;
    });
    const report = await replay(releases, new Map(paths));
    for (const line of formatReplay(report)) console.log(line);
    const output = parseOutputPath();
    if (output) await writeFile(resolve(output), `${JSON.stringify(report, null, 2)}\n`);
    if (report.unexplained > 0) process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
