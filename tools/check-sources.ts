// Checks that the evidence behind every lifecycle rule is still reachable and has not moved.
//
//   node dist/tools/check-sources.js [--out report.json] [--summary summary.md] [--update-lock]
//                                    [--fail-on stale,changed,unreachable]
//
// Reports, separately: rules not reviewed within their freshness window (stale), sources that cannot
// be fetched (unreachable), sources that moved or were retitled since they were recorded (changed),
// sources behind a bot challenge (blocked), and sources not recorded yet (unrecorded).
// It never edits rules. Only `--update-lock`, run by a maintainer, writes the lock file.
// Scans never use this tool or the network.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { REGISTRY_V2_SCHEMA_VERSION, staleRules, validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2, StaleRule } from "../src/registry.js";

export const SOURCE_CHECK_SCHEMA = "evergreen.source-check.v1" as const;
export const SOURCE_LOCK_SCHEMA = "evergreen.source-lock.v1" as const;

export interface SourceObservation {
  /** HTTP status of the final response, or null when the request failed. */
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  error?: string;
}

export interface LockEntry {
  finalUrl: string;
  title: string | null;
  checkedAt: string;
}

export interface SourceLock {
  schemaVersion: typeof SOURCE_LOCK_SCHEMA;
  sources: Record<string, LockEntry>;
}

export type ChangeReason = "final-url" | "title";

export interface SourceReport {
  schemaVersion: typeof SOURCE_CHECK_SCHEMA;
  checkedAt: string;
  registries: number;
  rules: number;
  sources: number;
  ok: number;
  stale: (StaleRule & { registry: string })[];
  unreachable: { url: string; reason: string; ruleIds: string[] }[];
  changed: { url: string; reasons: ChangeReason[]; recorded: LockEntry; current: { finalUrl: string; title: string | null }; ruleIds: string[] }[];
  blocked: { url: string; status: number; ruleIds: string[] }[];
  unrecorded: { url: string; ruleIds: string[] }[];
}

export type FailCategory = "stale" | "changed" | "unreachable";

export interface CheckInput {
  registries: { name: string; registry: RegistryV2 }[];
  lock: SourceLock;
  now: Date;
  observe: (url: string) => Promise<SourceObservation>;
  concurrency?: number;
}

const BOT_CHALLENGE = /just a moment|attention required|access denied|verify you are human|are you a robot|security check/i;

const normalizeText = (value: string | null) => (value ?? "").replace(/\s+/g, " ").trim();

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  return url.href.replace(/\/$/, "");
}

export function isBotChallenge(observation: SourceObservation): boolean {
  return (
    observation.status !== null &&
    [403, 429, 503].includes(observation.status) &&
    BOT_CHALLENGE.test(observation.title ?? "")
  );
}

async function inBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(size, items.length)) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]!);
      }
    }),
  );
  return results;
}

/** Runs every check. `observe` is injected so tests never touch the network. */
export async function checkSources(input: CheckInput): Promise<{ report: SourceReport; observations: Map<string, SourceObservation> }> {
  const rulesByUrl = new Map<string, Set<string>>();
  let ruleCount = 0;
  const stale: SourceReport["stale"] = [];
  for (const { name, registry } of input.registries) {
    stale.push(...staleRules(registry, input.now).map((entry) => ({ registry: name, ...entry })));
    for (const rule of registry.rules) {
      ruleCount++;
      for (const source of rule.sources) {
        if (!rulesByUrl.has(source.url)) rulesByUrl.set(source.url, new Set());
        rulesByUrl.get(source.url)!.add(rule.id);
      }
    }
  }

  const urls = [...rulesByUrl.keys()].sort();
  const observed = await inBatches(urls, input.concurrency ?? 4, (url) => input.observe(url));
  const observations = new Map(urls.map((url, index) => [url, observed[index]!]));
  const ids = (url: string) => [...rulesByUrl.get(url)!].sort();

  const report: SourceReport = {
    schemaVersion: SOURCE_CHECK_SCHEMA,
    checkedAt: input.now.toISOString(),
    registries: input.registries.length,
    rules: ruleCount,
    sources: urls.length,
    ok: 0,
    stale: stale.sort((a, b) => a.registry.localeCompare(b.registry) || a.ruleId.localeCompare(b.ruleId)),
    unreachable: [],
    changed: [],
    blocked: [],
    unrecorded: [],
  };

  for (const url of urls) {
    const observation = observations.get(url)!;
    if (isBotChallenge(observation)) {
      report.blocked.push({ url, status: observation.status!, ruleIds: ids(url) });
      continue;
    }
    if (observation.status === null || observation.status < 200 || observation.status >= 300 || !observation.finalUrl) {
      const reason = observation.error ?? `HTTP ${observation.status}`;
      report.unreachable.push({ url, reason, ruleIds: ids(url) });
      continue;
    }
    const recorded = input.lock.sources[url];
    if (!recorded) {
      report.unrecorded.push({ url, ruleIds: ids(url) });
      continue;
    }
    const reasons: ChangeReason[] = [];
    if (normalizeUrl(recorded.finalUrl) !== normalizeUrl(observation.finalUrl)) reasons.push("final-url");
    if (normalizeText(recorded.title) !== normalizeText(observation.title)) reasons.push("title");
    if (reasons.length > 0) {
      report.changed.push({ url, reasons, recorded, current: { finalUrl: observation.finalUrl, title: observation.title }, ruleIds: ids(url) });
    } else {
      report.ok++;
    }
  }
  return { report, observations };
}

/** The lock after a maintainer accepts what was observed: reachable pages are recorded, failures keep their old entry. */
export function updatedLock(lock: SourceLock, observations: Map<string, SourceObservation>, now: Date): SourceLock {
  const sources: Record<string, LockEntry> = {};
  for (const [url, observation] of [...observations].sort(([a], [b]) => a.localeCompare(b))) {
    if (observation.status !== null && observation.status >= 200 && observation.status < 300 && observation.finalUrl) {
      sources[url] = { finalUrl: observation.finalUrl, title: observation.title, checkedAt: now.toISOString().slice(0, 10) };
    } else if (lock.sources[url]) {
      sources[url] = lock.sources[url]!;
    }
  }
  return { schemaVersion: SOURCE_LOCK_SCHEMA, sources };
}

export function failingCategories(report: SourceReport, failOn: readonly FailCategory[]): FailCategory[] {
  return failOn.filter((category) => report[category].length > 0);
}

export function renderSummary(report: SourceReport): string {
  const lines = [
    "## Source freshness",
    "",
    `Checked ${report.sources} sources behind ${report.rules} rules on ${report.checkedAt.slice(0, 10)}.`,
    "",
    "| Result | Count |",
    "|---|---|",
    `| Unchanged | ${report.ok} |`,
    `| Stale rules (past their review window) | ${report.stale.length} |`,
    `| Changed sources (moved or retitled) | ${report.changed.length} |`,
    `| Unreachable sources | ${report.unreachable.length} |`,
    `| Blocked by a bot challenge (not verifiable) | ${report.blocked.length} |`,
    `| Not recorded yet | ${report.unrecorded.length} |`,
    "",
  ];
  const section = (title: string, items: string[]) => {
    if (items.length > 0) lines.push(`### ${title}`, "", ...items, "");
  };
  section("Stale rules", report.stale.map((entry) => `- \`${entry.ruleId}\` (${entry.registry}): reviewed ${entry.reviewedAt}, ${entry.ageDays} days ago; window is ${entry.maxReviewAgeDays}`));
  section("Changed sources", report.changed.map((entry) => `- ${entry.url} (${entry.reasons.join(", ")}) → ${entry.current.finalUrl}; rules: ${entry.ruleIds.map((id) => `\`${id}\``).join(", ")}`));
  section("Unreachable sources", report.unreachable.map((entry) => `- ${entry.url}: ${entry.reason}; rules: ${entry.ruleIds.map((id) => `\`${id}\``).join(", ")}`));
  section("Blocked by a bot challenge", report.blocked.map((entry) => `- ${entry.url} (HTTP ${entry.status}); rules: ${entry.ruleIds.map((id) => `\`${id}\``).join(", ")}`));
  section("Not recorded yet", report.unrecorded.map((entry) => `- ${entry.url}`));
  lines.push("Rules are never edited by this check. A maintainer reviews each item, updates the rule and its provenance, and refreshes `registry/sources.lock.json` with `node dist/tools/check-sources.js --update-lock`.");
  return `${lines.join("\n")}\n`;
}

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;

/** Fetches one page, retrying once, and reads only the start of the body. */
export async function fetchObservation(url: string, timeoutMs = 15_000): Promise<SourceObservation> {
  let last: SourceObservation = { status: null, finalUrl: null, title: null, error: "not attempted" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "evergreen-source-check (+https://github.com/arminazimi/evergreen)", accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      let head = "";
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (head.length < 262_144) {
          const { done, value } = await reader.read();
          if (done) break;
          head += decoder.decode(value, { stream: true });
          if (TITLE.test(head)) break;
        }
        await reader.cancel().catch(() => undefined);
      }
      const title = TITLE.exec(head)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
      last = { status: response.status, finalUrl: response.url || url, title };
      if (response.status < 500 && response.status !== 429) return last;
    } catch (error) {
      last = { status: null, finalUrl: null, title: null, error: (error as Error).message.slice(0, 120) };
    }
  }
  return last;
}

async function loadRegistries(directory: string): Promise<{ name: string; registry: RegistryV2 }[]> {
  const registries: { name: string; registry: RegistryV2 }[] = [];
  for (const file of (await readdir(directory)).filter((name) => name.endsWith(".json") && !name.startsWith("sources.")).sort()) {
    const value = JSON.parse(await readFile(join(directory, file), "utf8")) as { schemaVersion?: string };
    if (value.schemaVersion === REGISTRY_V2_SCHEMA_VERSION) registries.push({ name: file.replace(/\.json$/, ""), registry: validateRegistryV2(value) });
  }
  return registries;
}

async function loadLock(path: string): Promise<SourceLock> {
  try {
    const lock = JSON.parse(await readFile(path, "utf8")) as SourceLock;
    if (lock.schemaVersion !== SOURCE_LOCK_SCHEMA) throw new Error(`Unsupported source lock: ${String(lock.schemaVersion)}`);
    return lock;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: SOURCE_LOCK_SCHEMA, sources: {} };
    throw error;
  }
}

export async function main(argv: string[]): Promise<number> {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument "${argument}".`);
    if (argument === "--update-lock") flags.add(argument);
    else options.set(argument, argv[++index] ?? (() => { throw new Error(`${argument} needs a value.`); })());
  }
  const directory = resolve(options.get("--registry-dir") ?? "registry");
  const lockPath = resolve(options.get("--lock") ?? join(directory, "sources.lock.json"));
  const failOn = (options.get("--fail-on") ?? "").split(",").filter(Boolean) as FailCategory[];
  for (const category of failOn) if (!["stale", "changed", "unreachable"].includes(category)) throw new Error(`Unknown --fail-on category "${category}".`);
  const now = options.has("--now") ? new Date(options.get("--now")!) : new Date();

  const lock = await loadLock(lockPath);
  const timeout = Number(options.get("--timeout") ?? 15_000);
  const { report, observations } = await checkSources({
    registries: await loadRegistries(directory),
    lock,
    now,
    observe: (url) => fetchObservation(url, timeout),
    concurrency: Number(options.get("--concurrency") ?? 4),
  });

  if (options.has("--out")) await writeFile(options.get("--out")!, `${JSON.stringify(report, null, 2)}\n`);
  const summary = renderSummary(report);
  if (options.has("--summary")) await writeFile(options.get("--summary")!, summary, { flag: "a" });
  else process.stdout.write(summary);
  if (flags.has("--update-lock")) {
    await writeFile(lockPath, `${JSON.stringify(updatedLock(lock, observations, now), null, 2)}\n`);
    process.stdout.write(`Updated ${lockPath}\n`);
  }

  const failing = failingCategories(report, failOn);
  if (failing.length > 0) process.stderr.write(`Needs review: ${failing.join(", ")}\n`);
  return failing.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(2);
    },
  );
}
