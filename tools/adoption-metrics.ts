// Maintainer-run tool. It reads public data only and is never part of a scan or `npm run check`.
//
//   npm run metrics:adoption                       # writes metrics/adoption/<today>.json
//   node dist/tools/adoption-metrics.js --out file.json [--date YYYY-MM-DD]
//
// It needs the network. A GitHub token (GITHUB_TOKEN or GH_TOKEN) is required for GitHub code search;
// without one those metrics are recorded as unavailable. Nothing is collected from users: Evergreen has no
// telemetry, and every number below can be reproduced by anyone from the public sources named in the file.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const SCHEMA_VERSION = "evergreen.adoption-snapshot.v1";
const OWNER = "arminazimi";
const REPOSITORY = `${OWNER}/evergreen`;
const PACKAGE = "evergreen-deprecation";
const MAXIMUM_SEARCH_PAGES = 10;

export const SERVICE_REPORTS: Record<string, string> = {
  openSsfScorecard: `https://securityscorecards.dev/viewer/?uri=github.com/${REPOSITORY}`,
  socket: `https://socket.dev/npm/package/${PACKAGE}`,
  depsDev: `https://deps.dev/npm/${PACKAGE}`,
  npmsIo: `https://npms.io/search?q=${PACKAGE}`,
  snykAdvisor: `https://security.snyk.io/package/npm/${PACKAGE}`,
};

export type Metric =
  | { status: "ok"; value: number | boolean; detail?: string; source: string }
  | { status: "unavailable"; reason: string; source: string };

export interface Snapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  date: string;
  metrics: Record<string, Metric>;
  serviceReports?: Record<string, string>;
}

export interface Fetcher {
  (url: string, headers?: Record<string, string>): Promise<{ status: number; text: string }>;
}

const defaultFetch: Fetcher = async (url, headers = {}) => {
  const response = await fetch(url, { headers: { "User-Agent": "evergreen-adoption-metrics", ...headers } });
  return { status: response.status, text: await response.text() };
};

/** Distinct repositories among code-search hits, leaving out the project's own repositories. */
export function distinctRepositories(items: Array<{ repository?: { full_name?: string } }>): number {
  const names = new Set<string>();
  for (const item of items) {
    const name = item.repository?.full_name;
    if (name && !name.toLowerCase().startsWith(`${OWNER}/`)) names.add(name.toLowerCase());
  }
  return names.size;
}

export function parseDownloads(status: number, text: string): Metric {
  const source = `https://api.npmjs.org/downloads/point/last-week/${PACKAGE}`;
  if (status === 404) return { status: "unavailable", reason: "The package is not published on npm yet.", source };
  if (status !== 200) return { status: "unavailable", reason: `npm returned HTTP ${status}.`, source };
  const downloads = (JSON.parse(text) as { downloads?: unknown }).downloads;
  return typeof downloads === "number"
    ? { status: "ok", value: downloads, source }
    : { status: "unavailable", reason: "The response had no download count.", source };
}

export function parseMcpRegistry(status: number, text: string): Metric {
  const source = `https://registry.modelcontextprotocol.io/v0/servers?search=${PACKAGE}`;
  if (status !== 200) return { status: "unavailable", reason: `The MCP Registry returned HTTP ${status}.`, source };
  const servers = (JSON.parse(text) as { servers?: Array<{ server?: { name?: string; repository?: { url?: string } } }> }).servers ?? [];
  const entry = servers.find((candidate) => candidate.server?.repository?.url?.toLowerCase().includes(REPOSITORY));
  return entry
    ? { status: "ok", value: true, detail: entry.server?.name ?? "", source }
    : { status: "ok", value: false, source };
}

export function parseSkillsInstalls(status: number, text: string): Metric {
  const source = `https://www.skills.sh/${REPOSITORY}/${PACKAGE}`;
  if (status !== 200) return { status: "unavailable", reason: `skills.sh returned HTTP ${status}.`, source };
  const match = /"userInteractionCount":\s*(\d+)/.exec(text);
  return match
    ? { status: "ok", value: Number(match[1]), source }
    : { status: "unavailable", reason: "The page does not publish an install count.", source };
}

export function parseScorecard(status: number, text: string): Metric {
  const source = `https://api.securityscorecards.dev/projects/github.com/${REPOSITORY}`;
  if (status === 404) return { status: "unavailable", reason: "The repository is not indexed by OpenSSF Scorecard yet.", source };
  if (status !== 200) return { status: "unavailable", reason: `Scorecard returned HTTP ${status}.`, source };
  try {
    const data = JSON.parse(text) as { score?: unknown };
    return typeof data.score === "number"
      ? { status: "ok", value: data.score, detail: `https://securityscorecards.dev/viewer/?uri=github.com/${REPOSITORY}`, source }
      : { status: "unavailable", reason: "The response had no score.", source };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message : String(error), source };
  }
}

async function searchRepositories(query: string, fetcher: Fetcher, token: string | undefined): Promise<Metric> {
  const source = `https://github.com/search?type=code&q=${encodeURIComponent(query)}`;
  if (!token) return { status: "unavailable", reason: "GitHub code search needs GITHUB_TOKEN or GH_TOKEN.", source };
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
  const items: Array<{ repository?: { full_name?: string } }> = [];
  let total = 0;
  for (let page = 1; page <= MAXIMUM_SEARCH_PAGES; page++) {
    const response = await fetcher(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=100&page=${page}`, headers);
    if (response.status !== 200) {
      return page === 1
        ? { status: "unavailable", reason: `GitHub code search returned HTTP ${response.status}.`, source }
        : { status: "ok", value: distinctRepositories(items), detail: `lower bound: stopped at page ${page} with HTTP ${response.status}`, source };
    }
    const body = JSON.parse(response.text) as { total_count?: number; items?: typeof items };
    total = body.total_count ?? total;
    items.push(...(body.items ?? []));
    if ((body.items?.length ?? 0) < 100 || items.length >= total) break;
    // Code search allows about ten requests a minute.
    await new Promise((done) => setTimeout(done, 7000));
  }
  const truncated = total > items.length;
  return { status: "ok", value: distinctRepositories(items), ...(truncated ? { detail: `lower bound: GitHub returns at most ${items.length} of ${total} matching files` } : {}), source };
}

async function repositoryStat(field: "stargazers_count" | "forks_count", fetcher: Fetcher, token: string | undefined): Promise<Metric> {
  const source = `https://api.github.com/repos/${REPOSITORY}`;
  const response = await fetcher(source, token ? { Authorization: `Bearer ${token}` } : {});
  if (response.status !== 200) return { status: "unavailable", reason: `GitHub returned HTTP ${response.status}.`, source };
  const value = (JSON.parse(response.text) as Record<string, unknown>)[field];
  return typeof value === "number" ? { status: "ok", value, source } : { status: "unavailable", reason: `The repository has no ${field}.`, source };
}

/** Collects the snapshot. A source that fails is recorded as unavailable and never stops the others. */
export async function collect(date: string, fetcher: Fetcher = defaultFetch, token: string | undefined = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN): Promise<Snapshot> {
  const guarded = async (run: () => Promise<Metric>, source: string): Promise<Metric> => {
    try {
      return await run();
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : String(error), source };
    }
  };
  const get = async (url: string) => fetcher(url);

  const metrics: Record<string, Metric> = {
    githubActionRepositories: await guarded(() => searchRepositories(`"${REPOSITORY}@" path:.github/workflows`, fetcher, token), "GitHub code search"),
    preCommitRepositories: await guarded(() => searchRepositories(`"https://github.com/${REPOSITORY}" filename:.pre-commit-config.yaml`, fetcher, token), "GitHub code search"),
    gitlabComponentRepositories: await guarded(() => searchRepositories(`"${REPOSITORY}" filename:.gitlab-ci.yml`, fetcher, token), "GitHub code search"),
    npmWeeklyDownloads: await guarded(async () => { const r = await get(`https://api.npmjs.org/downloads/point/last-week/${PACKAGE}`); return parseDownloads(r.status, r.text); }, "npm"),
    mcpRegistryListed: await guarded(async () => { const r = await get(`https://registry.modelcontextprotocol.io/v0/servers?search=${PACKAGE}`); return parseMcpRegistry(r.status, r.text); }, "MCP Registry"),
    skillsShInstalls: await guarded(async () => { const r = await get(`https://www.skills.sh/${REPOSITORY}/${PACKAGE}`); return parseSkillsInstalls(r.status, r.text); }, "skills.sh"),
    githubStars: await guarded(() => repositoryStat("stargazers_count", fetcher, token), "GitHub"),
    githubForks: await guarded(() => repositoryStat("forks_count", fetcher, token), "GitHub"),
    scorecardScore: await guarded(async () => { const r = await get(`https://api.securityscorecards.dev/projects/github.com/${REPOSITORY}`); return parseScorecard(r.status, r.text); }, "OpenSSF Scorecard"),
  };
  return { schemaVersion: SCHEMA_VERSION, date, metrics, serviceReports: { ...SERVICE_REPORTS } };
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const date = option("--date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD.");
  const out = resolve(option("--out") ?? `metrics/adoption/${date}.json`);
  const snapshot = await collect(date);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(`Wrote ${out}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  });
}
