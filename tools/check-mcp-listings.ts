// Checks that every tracked MCP directory listing shows the version in server.json.
//
//   node dist/tools/check-mcp-listings.js [--server server.json] [--summary summary.md]
//                                        [--out report.json] [--open-issue]
//                                        [--repo owner/name]
//
// Needs the network. Scans never use this tool or the network.
// With --open-issue, opens (or updates) one GitHub issue when any listing is stale.

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const REPORT_SCHEMA = "evergreen.mcp-listings-check.v1" as const;
export const ISSUE_MARKER = "<!-- evergreen-mcp-listings-stale -->";
export const ISSUE_TITLE = "MCP directory listing is behind server.json";

export type CheckKind = "official-registry-latest" | "http-ok" | "html-semver" | "docker-server-yaml" | "skip";

export interface Listing {
  id: string;
  name: string;
  url: string;
  update: string;
  account: string;
  check: CheckKind;
  /** URL fetched for the version check; omitted when check is `skip`. */
  checkUrl?: string;
}

/** Catalog mirrored by docs/MCP_LISTINGS.md. */
export const LISTINGS: readonly Listing[] = [
  {
    id: "official-mcp-registry",
    name: "Official MCP Registry",
    url: "https://registry.modelcontextprotocol.io/v0/servers?search=evergreen",
    update: "Republished per release by the registry job in publish.yml from server.json",
    account: "arminazimi GitHub (OIDC / mcp-publisher)",
    check: "official-registry-latest",
    checkUrl: "https://registry.modelcontextprotocol.io/v0/servers/io.github.arminazimi%2Fevergreen/versions/latest",
  },
  {
    id: "github-mcp-registry",
    name: "GitHub MCP Registry",
    url: "https://github.com/mcp/arminazimi/evergreen",
    update: "Manual onboarding, then versions sync from the official Registry",
    account: "GitHub curation; request from arminazimi",
    check: "http-ok",
    checkUrl: "https://github.com/mcp/arminazimi/evergreen",
  },
  {
    id: "vscode-copilot-gallery",
    name: "VS Code / Copilot MCP gallery",
    url: "https://github.com/mcp/arminazimi/evergreen",
    update: "Same GitHub MCP Registry entry; no separate publish step",
    account: "Same as GitHub MCP Registry",
    check: "http-ok",
    checkUrl: "https://github.com/mcp/arminazimi/evergreen",
  },
  {
    id: "docker-mcp-catalog",
    name: "Docker MCP Catalog",
    url: "https://hub.docker.com/mcp",
    update: "PR to docker/mcp-registry; catalog pins a commit in servers/evergreen/server.yaml",
    account: "arminazimi GitHub (upstream PR author)",
    check: "docker-server-yaml",
    checkUrl: "https://raw.githubusercontent.com/docker/mcp-registry/main/servers/evergreen/server.yaml",
  },
  {
    id: "glama",
    name: "Glama",
    url: "https://glama.ai/mcp/servers/arminazimi/evergreen",
    update: "Continuous re-index of public MCP servers; claim needs a browser sign-in",
    account: "Maintainer Glama account (arminazimi)",
    check: "html-semver",
    checkUrl: "https://glama.ai/mcp/servers/arminazimi/evergreen",
  },
  {
    id: "pulsemcp",
    name: "PulseMCP",
    url: "https://www.pulsemcp.com",
    update: "Ingests the official Registry when submissions reopen",
    account: "None yet (paused)",
    check: "skip",
  },
  {
    id: "mcp-so",
    name: "mcp.so",
    url: "https://mcp.so",
    update: "Maintainer form submission; review queue",
    account: "Maintainer mcp.so account",
    check: "skip",
  },
  {
    id: "smithery",
    name: "Smithery",
    url: "https://smithery.ai",
    update: "Not pursued (HTTP/MCPB focus; publishing flow shut down)",
    account: "—",
    check: "skip",
  },
  {
    id: "cursor-directory",
    name: "Cursor Directory",
    url: "https://cursor.directory",
    update: "Not pursued (plugin gallery, not stdio-only servers)",
    account: "—",
    check: "skip",
  },
  {
    id: "cline-marketplace",
    name: "Cline MCP Marketplace",
    url: "https://cline.bot/mcp-marketplace",
    update: "GitHub issue on cline/mcp-marketplace",
    account: "arminazimi GitHub",
    check: "skip",
  },
  {
    id: "mcp-market",
    name: "MCP Market",
    url: "https://mcpmarket.com",
    update: "Maintainer submission (epic #1611)",
    account: "Maintainer account",
    check: "skip",
  },
  {
    id: "lobehub",
    name: "LobeHub",
    url: "https://lobehub.com/mcp",
    update: "Maintainer submission (epic #1611)",
    account: "Maintainer account",
    check: "skip",
  },
  {
    id: "awesome-mcp-servers",
    name: "awesome-mcp-servers",
    url: "https://github.com/punkpeye/awesome-mcp-servers",
    update: "Upstream PR (epic #1616)",
    account: "arminazimi GitHub",
    check: "skip",
  },
  {
    id: "mcpservers-org",
    name: "mcpservers.org",
    url: "https://mcpservers.org",
    update: "Upstream listing (epic #1616)",
    account: "Maintainer account",
    check: "skip",
  },
];

export type ListingStatus = "current" | "stale" | "not-listed" | "unreachable" | "skipped";

export interface ListingResult {
  id: string;
  name: string;
  url: string;
  status: ListingStatus;
  expectedVersion: string;
  observedVersion: string | null;
  detail?: string;
}

export interface CheckReport {
  schemaVersion: typeof REPORT_SCHEMA;
  checkedAt: string;
  expectedVersion: string;
  results: ListingResult[];
  stale: ListingResult[];
}

export interface FetchTextResult {
  status: number | null;
  text: string;
  error?: string;
}

export type TextFetcher = (url: string) => Promise<FetchTextResult>;

export interface IssueRecord {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url?: string;
}

export interface IssueClient {
  listOpenIssues(repo: string): Promise<IssueRecord[]>;
  createIssue(repo: string, title: string, body: string): Promise<IssueRecord>;
  updateIssue(repo: string, number: number, body: string): Promise<IssueRecord>;
}

const SEMVER = /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/;
const USER_AGENT = "evergreen-mcp-listings-check (+https://github.com/arminazimi/evergreen)";

export function readExpectedVersion(serverJson: string): string {
  const parsed = JSON.parse(serverJson) as { version?: unknown; packages?: Array<{ version?: unknown }> };
  if (typeof parsed.version !== "string" || !parsed.version.trim()) {
    throw new Error("server.json has no version string.");
  }
  const packageVersions = (parsed.packages ?? [])
    .map((entry) => entry.version)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  for (const version of packageVersions) {
    if (version !== parsed.version) {
      throw new Error(`server.json package version ${version} does not match server version ${parsed.version}.`);
    }
  }
  return parsed.version;
}

export function extractOfficialRegistryLatest(text: string): string | null {
  try {
    const parsed = JSON.parse(text) as { server?: { version?: unknown } };
    return typeof parsed.server?.version === "string" ? parsed.server.version : null;
  } catch {
    return null;
  }
}

export function extractHtmlSemver(text: string, expected: string): string | null {
  if (text.includes(expected)) return expected;
  const match = SEMVER.exec(text);
  return match?.[1] ?? null;
}

export function extractDockerServerYaml(text: string): string | null {
  const match = /(?:^|\n)\s*version:\s*["']?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)["']?\s*(?:\n|$)/.exec(text)
    ?? /(?:^|\n)\s*(?:image|tag):\s*.*?[:@v]?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?)\b/.exec(text);
  return match?.[1] ?? null;
}

export async function defaultFetchText(url: string, timeoutMs = 15_000): Promise<FetchTextResult> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "application/json,text/plain,text/html,*/*;q=0.8" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    return { status: null, text: "", error: (error as Error).message.slice(0, 160) };
  }
}

export async function checkListing(
  listing: Listing,
  expectedVersion: string,
  fetchText: TextFetcher,
): Promise<ListingResult> {
  if (listing.check === "skip" || !listing.checkUrl) {
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "skipped",
      expectedVersion,
      observedVersion: null,
      detail: "Not checked until the listing exists.",
    };
  }

  const response = await fetchText(listing.checkUrl);
  if (response.status === null) {
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "unreachable",
      expectedVersion,
      observedVersion: null,
      detail: response.error ?? "fetch failed",
    };
  }

  if (listing.check === "http-ok") {
    if (response.status === 404) {
      return {
        id: listing.id,
        name: listing.name,
        url: listing.url,
        status: "not-listed",
        expectedVersion,
        observedVersion: null,
        detail: `HTTP ${response.status}`,
      };
    }
    if (response.status >= 400) {
      return {
        id: listing.id,
        name: listing.name,
        url: listing.url,
        status: "unreachable",
        expectedVersion,
        observedVersion: null,
        detail: `HTTP ${response.status}`,
      };
    }
    // Onboarded: the GitHub page does not reliably expose a package semver, so presence is enough.
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "current",
      expectedVersion,
      observedVersion: expectedVersion,
      detail: `HTTP ${response.status}; listing present (version syncs from the official Registry)`,
    };
  }

  if (response.status === 404) {
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "not-listed",
      expectedVersion,
      observedVersion: null,
      detail: `HTTP ${response.status}`,
    };
  }
  if (response.status >= 400) {
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "unreachable",
      expectedVersion,
      observedVersion: null,
      detail: `HTTP ${response.status}`,
    };
  }

  let observed: string | null = null;
  if (listing.check === "official-registry-latest") observed = extractOfficialRegistryLatest(response.text);
  else if (listing.check === "html-semver") observed = extractHtmlSemver(response.text, expectedVersion);
  else if (listing.check === "docker-server-yaml") observed = extractDockerServerYaml(response.text);

  if (observed === null) {
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "not-listed",
      expectedVersion,
      observedVersion: null,
      detail: "No version found in the listing response",
    };
  }
  if (observed !== expectedVersion) {
    return {
      id: listing.id,
      name: listing.name,
      url: listing.url,
      status: "stale",
      expectedVersion,
      observedVersion: observed,
      detail: `Listing shows ${observed}; server.json has ${expectedVersion}`,
    };
  }
  return {
    id: listing.id,
    name: listing.name,
    url: listing.url,
    status: "current",
    expectedVersion,
    observedVersion: observed,
  };
}

export async function checkListings(input: {
  expectedVersion: string;
  listings?: readonly Listing[];
  fetchText: TextFetcher;
  now?: Date;
}): Promise<CheckReport> {
  const listings = input.listings ?? LISTINGS;
  const results: ListingResult[] = [];
  for (const listing of listings) {
    results.push(await checkListing(listing, input.expectedVersion, input.fetchText));
  }
  return {
    schemaVersion: REPORT_SCHEMA,
    checkedAt: (input.now ?? new Date()).toISOString(),
    expectedVersion: input.expectedVersion,
    results,
    stale: results.filter((result) => result.status === "stale"),
  };
}

/** Escapes a cell so `|` and `\` cannot break a Markdown table row. */
export function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

/**
 * True when `candidate` is the same listing location as `listingUrl`: same host and path.
 * Uses the URL parser so a lookalike host (for example modelcontextprotocolXio) does not match.
 */
export function sameListingLocation(candidate: string, listingUrl: string): boolean {
  let left: URL;
  let right: URL;
  try {
    left = new URL(candidate);
    right = new URL(listingUrl);
  } catch {
    return false;
  }
  return left.hostname === right.hostname && left.pathname === right.pathname;
}

export function renderSummary(report: CheckReport): string {
  const counts = {
    current: report.results.filter((r) => r.status === "current").length,
    stale: report.stale.length,
    notListed: report.results.filter((r) => r.status === "not-listed").length,
    unreachable: report.results.filter((r) => r.status === "unreachable").length,
    skipped: report.results.filter((r) => r.status === "skipped").length,
  };
  const lines = [
    "### MCP directory listings",
    "",
    `- **Expected version (\`server.json\`):** ${report.expectedVersion}`,
    `- **Current:** ${counts.current}`,
    `- **Stale:** ${counts.stale}`,
    `- **Not listed yet:** ${counts.notListed}`,
    `- **Unreachable:** ${counts.unreachable}`,
    `- **Skipped:** ${counts.skipped}`,
    "",
    "| Directory | Status | Observed | Detail |",
    "| --- | --- | --- | --- |",
  ];
  for (const result of report.results) {
    const observed = result.observedVersion ?? "—";
    const detail = escapeMarkdownTableCell(result.detail ?? "");
    lines.push(`| [${result.name}](${result.url}) | ${result.status} | ${observed} | ${detail} |`);
  }
  lines.push("");
  if (report.stale.length === 0) {
    lines.push("No stale listings.");
  } else {
    lines.push("### Stale listings", "");
    for (const result of report.stale) {
      lines.push(`- **${result.name}**: shows \`${result.observedVersion}\`, expected \`${result.expectedVersion}\` ([listing](${result.url}))`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export function renderStaleIssueBody(report: CheckReport): string {
  const lines = [
    ISSUE_MARKER,
    "",
    "The weekly MCP listing check found at least one directory showing a version other than `server.json`.",
    "",
    `Expected version: \`${report.expectedVersion}\``,
    "",
    "| Directory | Observed | Expected |",
    "| --- | --- | --- |",
  ];
  for (const result of report.stale) {
    lines.push(`| [${result.name}](${result.url}) | \`${result.observedVersion}\` | \`${result.expectedVersion}\` |`);
  }
  lines.push(
    "",
    "See [MCP directory listings](docs/MCP_LISTINGS.md) and [Releasing](docs/RELEASING.md) for how each directory updates.",
    "",
    "_Opened by `tools/check-mcp-listings.ts`._",
    "",
  );
  return lines.join("\n");
}

export function findOpenStaleIssue(issues: readonly IssueRecord[]): IssueRecord | undefined {
  return issues.find(
    (issue) =>
      issue.state === "open" &&
      (issue.title === ISSUE_TITLE || (issue.body ?? "").includes(ISSUE_MARKER)),
  );
}

export async function ensureStaleIssue(
  report: CheckReport,
  repo: string,
  client: IssueClient,
): Promise<{ action: "created" | "updated" | "none"; issue?: IssueRecord }> {
  if (report.stale.length === 0) return { action: "none" };
  const body = renderStaleIssueBody(report);
  const existing = findOpenStaleIssue(await client.listOpenIssues(repo));
  if (existing) {
    const updated = await client.updateIssue(repo, existing.number, body);
    return { action: "updated", issue: updated };
  }
  const created = await client.createIssue(repo, ISSUE_TITLE, body);
  return { action: "created", issue: created };
}

export function createGitHubIssueClient(token: string, fetcher: typeof fetch = fetch): IssueClient {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };

  return {
    async listOpenIssues(repo) {
      const response = await fetcher(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers });
      if (!response.ok) throw new Error(`Failed to list issues: HTTP ${response.status}`);
      const issues = (await response.json()) as Array<IssueRecord & { pull_request?: unknown }>;
      return issues.filter((issue) => !issue.pull_request);
    },
    async createIssue(repo, title, body) {
      const response = await fetcher(`https://api.github.com/repos/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, labels: ["area: agent", "area: release"] }),
      });
      if (!response.ok) throw new Error(`Failed to create issue: HTTP ${response.status} ${await response.text()}`);
      return (await response.json()) as IssueRecord;
    },
    async updateIssue(repo, number, body) {
      const response = await fetcher(`https://api.github.com/repos/${repo}/issues/${number}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) throw new Error(`Failed to update issue #${number}: HTTP ${response.status} ${await response.text()}`);
      return (await response.json()) as IssueRecord;
    },
  };
}

export interface CommandLineOptions {
  serverPath: string;
  summaryPath?: string | undefined;
  outPath?: string | undefined;
  openIssue: boolean;
  repo: string;
  token?: string | undefined;
}

const KNOWN_OPTIONS = new Set(["--server", "--summary", "--out", "--repo", "--token"]);
const KNOWN_FLAGS = new Set(["--open-issue"]);

export function parseArguments(argv: readonly string[]): CommandLineOptions {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}".`);
    if (KNOWN_FLAGS.has(arg)) {
      flags.add(arg);
      continue;
    }
    if (!KNOWN_OPTIONS.has(arg)) throw new Error(`Unexpected argument "${arg}".`);
    const value = argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
    options.set(arg, value);
  }
  return {
    serverPath: resolve(options.get("--server") ?? "server.json"),
    summaryPath: options.get("--summary"),
    outPath: options.get("--out"),
    openIssue: flags.has("--open-issue"),
    repo: options.get("--repo") ?? process.env.GITHUB_REPOSITORY ?? "arminazimi/evergreen",
    token: options.get("--token") ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  };
}

export async function main(
  argv: string[],
  deps: {
    fetchText?: TextFetcher;
    issueClient?: IssueClient;
    readFile?: (path: string, encoding: "utf8") => Promise<string>;
  } = {},
): Promise<number> {
  const options = parseArguments(argv);
  const read = deps.readFile ?? ((path, encoding) => readFile(path, encoding));
  const expectedVersion = readExpectedVersion(await read(options.serverPath, "utf8"));
  const report = await checkListings({
    expectedVersion,
    fetchText: deps.fetchText ?? defaultFetchText,
  });

  const summary = renderSummary(report);
  if (options.summaryPath) await writeFile(options.summaryPath, summary, { flag: "a" });
  else process.stdout.write(summary);
  if (options.outPath) await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`);

  if (options.openIssue) {
    if (!options.token && !deps.issueClient) {
      throw new Error("--open-issue needs GITHUB_TOKEN, GH_TOKEN, or --token.");
    }
    const client = deps.issueClient ?? createGitHubIssueClient(options.token!);
    const result = await ensureStaleIssue(report, options.repo, client);
    if (result.action === "created") {
      process.stdout.write(`Opened issue #${result.issue?.number}: ${result.issue?.html_url ?? ""}\n`);
    } else if (result.action === "updated") {
      process.stdout.write(`Updated issue #${result.issue?.number}: ${result.issue?.html_url ?? ""}\n`);
    } else {
      process.stdout.write("No stale listings; no issue opened.\n");
    }
  }

  if (report.stale.length > 0) {
    process.stderr.write(`Stale MCP listings: ${report.stale.map((entry) => entry.id).join(", ")}\n`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
