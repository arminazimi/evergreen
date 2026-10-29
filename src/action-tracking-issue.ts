/**
 * Keeps one lifecycle tracking issue up to date on scheduled Action runs. This is the Action's second
 * network call after the scan (`pr-comment` is the other); scans themselves never use the network.
 */
import type { Finding, Severity } from "./domain.js";
import { severityValues } from "./domain.js";

/** Hidden marker that identifies the one issue Evergreen owns, so a later run updates it instead of creating another. */
export const TRACKING_ISSUE_MARKER = "<!-- evergreen-tracking-issue -->";

/** The title of the issue Evergreen creates. */
export const TRACKING_ISSUE_TITLE = "Evergreen lifecycle tracking";

const SNAPSHOT_SCHEMA = "evergreen.tracking.v1";
const SNAPSHOT_PATTERN = /<!-- evergreen-tracking-snapshot: ([A-Za-z0-9+/=]+) -->/;
const REPOSITORY_LIST_LIMIT = 10;

/** GitHub caps issue bodies at 65,536 characters; keep a margin and shorten the findings tables first. */
export const TRACKING_ISSUE_BODY_LIMIT = 60_000;

export interface TrackingFinding {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  path: string;
  line?: number;
  deadline?: string;
  replacement?: string;
}

/** The last run's findings, stored as a hidden marker so the next run can say what changed. */
export interface TrackingSnapshot {
  schemaVersion: typeof SNAPSHOT_SCHEMA;
  /** The day the previous run happened (YYYY-MM-DD). */
  updated?: string;
  findings: TrackingFinding[];
}

export interface TrackingIssueOptions {
  /** owner/name, used for file links. Without it, locations are plain code spans. */
  repository?: string;
  /** The server origin, for example https://github.com. */
  serverUrl?: string;
  /** The commit or branch used in file links. */
  ref?: string;
  /** Prefix for scan locations when the `path` input points at a subdirectory. */
  pathPrefix?: string;
  /** The day the run happened (YYYY-MM-DD). */
  today: string;
}

export interface TrackingIssueTarget {
  /** API origin, for example https://api.github.com. */
  apiUrl: string;
  /** owner/name */
  repository: string;
  token: string;
  serverUrl?: string;
  ref?: string;
  pathPrefix?: string;
}

export type TrackingIssueAction = "created" | "updated" | "reopened" | "closed" | "none" | "too-large";

interface GitHubIssue {
  number: number;
  state: "open" | "closed";
  body?: string | null;
  pull_request?: unknown;
}

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replaceAll("\\", "\\\\").replaceAll("|", "\\|").trim();

function toTrackingFinding(finding: Finding): TrackingFinding {
  return {
    id: finding.id,
    ruleId: finding.ruleId,
    title: finding.title,
    severity: finding.severity,
    path: finding.location.path,
    ...(finding.location.line ? { line: finding.location.line } : {}),
    ...(finding.deadline ? { deadline: finding.deadline } : {}),
    ...(finding.replacement ? { replacement: finding.replacement } : {}),
  };
}

function isTrackingFinding(value: unknown): value is TrackingFinding {
  if (typeof value !== "object" || value === null) return false;
  const finding = value as Record<string, unknown>;
  return (
    typeof finding.id === "string" &&
    typeof finding.ruleId === "string" &&
    typeof finding.title === "string" &&
    typeof finding.path === "string" &&
    typeof finding.severity === "string" &&
    severityValues.includes(finding.severity as Severity) &&
    (finding.line === undefined || typeof finding.line === "number") &&
    (finding.deadline === undefined || typeof finding.deadline === "string") &&
    (finding.replacement === undefined || typeof finding.replacement === "string")
  );
}

/** Reads the previous run's snapshot from an issue body; a missing or malformed marker means "first run". */
export function readTrackingSnapshot(body: string): TrackingSnapshot | undefined {
  const encoded = SNAPSHOT_PATTERN.exec(body)?.[1];
  if (!encoded) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Partial<TrackingSnapshot>;
    if (parsed.schemaVersion !== SNAPSHOT_SCHEMA || !Array.isArray(parsed.findings)) return undefined;
    if (parsed.updated !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.updated)) return undefined;
    const findings = parsed.findings.filter(isTrackingFinding);
    if (findings.length !== parsed.findings.length) return undefined;
    return { schemaVersion: SNAPSHOT_SCHEMA, ...(parsed.updated ? { updated: parsed.updated } : {}), findings };
  } catch {
    return undefined;
  }
}

function encodeSnapshot(findings: readonly TrackingFinding[], today: string): string {
  const snapshot: TrackingSnapshot = { schemaVersion: SNAPSHOT_SCHEMA, updated: today, findings: [...findings] };
  return Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
}

/** Compares by end-of-life date, dated findings first, then severity and location for a stable order. */
function compareFindings(left: TrackingFinding, right: TrackingFinding): number {
  if (left.deadline && right.deadline && left.deadline !== right.deadline) return left.deadline.localeCompare(right.deadline);
  if (left.deadline && !right.deadline) return -1;
  if (!left.deadline && right.deadline) return 1;
  return (
    (severityRank.get(right.severity) ?? 0) - (severityRank.get(left.severity) ?? 0) ||
    left.path.localeCompare(right.path) ||
    (left.line ?? 0) - (right.line ?? 0) ||
    left.id.localeCompare(right.id)
  );
}

function repositoryPath(finding: TrackingFinding, options: TrackingIssueOptions): string {
  const prefix = options.pathPrefix?.replaceAll("\\", "/").replace(/^\.?\/+|\/+$/g, "");
  const path = prefix ? `${prefix}/${finding.path}` : finding.path;
  return path.replaceAll("\\", "/").replace(/^\.?\/+/, "");
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function locationLabel(finding: TrackingFinding, options: TrackingIssueOptions, link: boolean): string {
  const path = repositoryPath(finding, options);
  const label = `${path}${finding.line ? `:${finding.line}` : ""}`;
  if (!link || !options.repository || !options.ref) return `\`${label}\``;
  const server = (options.serverUrl ?? "https://github.com").replace(/\/+$/, "");
  const ref = options.ref.split("/").map(encodeURIComponent).join("/");
  const line = finding.line ? `#L${finding.line}` : "";
  return `[\`${label}\`](${server}/${options.repository}/blob/${ref}/${encodePath(path)}${line})`;
}

function renderChanges(previous: TrackingSnapshot | undefined, added: readonly TrackingFinding[], resolved: readonly TrackingFinding[], options: TrackingIssueOptions): string[] {
  if (!previous) return ["## First run", "", "This is the first run of the tracking issue.", ""];
  const since = previous.updated ? ` since the last run on ${previous.updated}` : " since the last run";
  if (added.length === 0 && resolved.length === 0) return [`## Changed${since}`, "", "No lifecycle findings changed.", ""];
  const lines = [`## Changed${since}`, "", `**${added.length}** new, **${resolved.length}** resolved.`, "", "| Change | Severity | Finding | Location |", "|---|---|---|---|"];
  for (const finding of added) lines.push(`| New | ${finding.severity} | ${cell(finding.title)} | ${locationLabel(finding, options, true)} |`);
  for (const finding of resolved) lines.push(`| Resolved | ${finding.severity} | ${cell(finding.title)} | ${locationLabel(finding, options, false)} |`);
  lines.push("");
  return lines;
}

function renderFindings(findings: readonly TrackingFinding[], options: TrackingIssueOptions, shown = findings.length): string[] {
  if (findings.length === 0) {
    return ["## No lifecycle findings", "", `Nothing to track as of ${options.today}. This issue closes itself; a later run reopens it if findings return.`, ""];
  }

  const sorted = [...findings].sort(compareFindings);
  const visible = sorted.slice(0, shown);
  const dated = visible.filter((finding) => finding.deadline !== undefined);
  const undated = visible.filter((finding) => finding.deadline === undefined);
  const passed = findings.filter((finding) => finding.deadline !== undefined && finding.deadline < options.today).length;
  const reached = passed === 0 ? "" : `; **${passed}** ${passed === 1 ? "has" : "have"} reached the end-of-life date`;
  const lines = [
    "## Findings by end-of-life date",
    "",
    `**${findings.length}** lifecycle finding${findings.length === 1 ? "" : "s"}${reached}.`,
    "",
  ];

  if (dated.length > 0) {
    lines.push("| End of life | Severity | Finding | Location | Replacement |", "|---|---|---|---|---|");
    for (const finding of dated) {
      const deadline = `${finding.deadline}${finding.deadline! < options.today ? " (past)" : ""}`;
      lines.push(`| ${deadline} | ${finding.severity} | ${cell(finding.title)} | ${locationLabel(finding, options, true)} | ${finding.replacement ? cell(finding.replacement) : "—"} |`);
    }
    lines.push("");
  }

  if (undated.length > 0) {
    lines.push("## Findings without an end-of-life date", "", "| Severity | Finding | Location | Replacement |", "|---|---|---|---|");
    for (const finding of undated) {
      lines.push(`| ${finding.severity} | ${cell(finding.title)} | ${locationLabel(finding, options, true)} | ${finding.replacement ? cell(finding.replacement) : "—"} |`);
    }
    lines.push("");
  }

  const hidden = findings.length - visible.length;
  if (hidden > 0) lines.push(`…and ${hidden} more finding${hidden === 1 ? "" : "s"}; the hidden snapshot still tracks every finding.`, "");

  lines.push("Run `npx evergreen-deprecation scan .` for evidence and migration steps.", "");
  return lines;
}

/** The tracking issue body: the two hidden markers, what changed, and every finding by end-of-life date. */
export function renderTrackingIssue(findings: readonly Finding[], previous: TrackingSnapshot | undefined, options: TrackingIssueOptions): string {
  const current = findings.map(toTrackingFinding).sort(compareFindings);
  const known = new Set(previous?.findings.map((finding) => finding.id) ?? []);
  const currentIds = new Set(current.map((finding) => finding.id));
  const added = current.filter((finding) => !known.has(finding.id));
  const resolved = (previous?.findings ?? []).filter((finding) => !currentIds.has(finding.id)).sort(compareFindings);
  const snapshot = `${TRACKING_ISSUE_MARKER}\n<!-- evergreen-tracking-snapshot: ${encodeSnapshot(current, options.today)} -->\n\n`;
  const render = (shown: number): string => {
    const lines = [
      `_Updated by Evergreen on ${options.today}._`,
      "",
      ...renderChanges(previous, added, resolved, options),
      ...renderFindings(current, options, shown),
    ];
    return `${snapshot}${lines.join("\n")}`;
  };

  const full = render(current.length);
  if (full.length <= TRACKING_ISSUE_BODY_LIMIT) return full;
  let low = 0;
  let high = current.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (render(middle).length <= TRACKING_ISSUE_BODY_LIMIT) low = middle;
    else high = middle - 1;
  }
  return render(low);
}

/** `tracking-issue` works on scheduled and manual runs, not on pull requests, whose token is read-only. */
export function trackingIssueEventAllowed(eventName: string | undefined): boolean {
  return eventName === undefined || eventName === "schedule" || eventName === "workflow_dispatch";
}

async function githubRequest(target: TrackingIssueTarget, method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${target.apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${target.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${path} failed with ${response.status}`);
  return response.json();
}

/** Finds the one issue carrying the marker, newest first so the issue a previous run touched is found early. */
async function findTrackingIssue(target: TrackingIssueTarget): Promise<GitHubIssue | undefined> {
  const base = `/repos/${target.repository}/issues?state=all&sort=updated&direction=desc&per_page=100`;
  for (let page = 1; page <= REPOSITORY_LIST_LIMIT; page += 1) {
    const issues = (await githubRequest(target, "GET", `${base}&page=${page}`)) as GitHubIssue[];
    const existing = issues.find((issue) => issue.pull_request === undefined && issue.body?.includes(TRACKING_ISSUE_MARKER));
    if (existing) return existing;
    if (issues.length < 100) break;
  }
  return undefined;
}

/**
 * Creates the one tracking issue, updates it, closes it when nothing is left, or reopens it when findings
 * return. Returns what happened; the caller logs it.
 */
export async function upsertTrackingIssue(target: TrackingIssueTarget, findings: readonly Finding[], today: string): Promise<TrackingIssueAction> {
  const existing = await findTrackingIssue(target);
  const previous = existing?.body ? readTrackingSnapshot(existing.body) : undefined;
  const options: TrackingIssueOptions = {
    repository: target.repository,
    today,
    ...(target.serverUrl ? { serverUrl: target.serverUrl } : {}),
    ...(target.ref ? { ref: target.ref } : {}),
    ...(target.pathPrefix ? { pathPrefix: target.pathPrefix } : {}),
  };
  const body = renderTrackingIssue(findings, previous, options);
  if (body.length > TRACKING_ISSUE_BODY_LIMIT) return "too-large";
  const issues = `/repos/${target.repository}/issues`;

  if (findings.length === 0) {
    if (!existing || existing.state === "closed") return "none";
    await githubRequest(target, "PATCH", `${issues}/${existing.number}`, { body, state: "closed" });
    return "closed";
  }

  if (!existing) {
    await githubRequest(target, "POST", issues, { title: TRACKING_ISSUE_TITLE, body });
    return "created";
  }

  await githubRequest(target, "PATCH", `${issues}/${existing.number}`, {
    body,
    ...(existing.state === "closed" ? { state: "open" } : {}),
  });
  return existing.state === "closed" ? "reopened" : "updated";
}
