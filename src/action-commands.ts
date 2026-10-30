/**
 * `/evergreen explain <finding-id>` and `/evergreen ignore <finding-id> <reason>` on pull request
 * comments. The comment body is untrusted input: it is parsed, never evaluated, and a reply is only
 * written for authors whose `author_association` is OWNER, MEMBER, or COLLABORATOR. Nothing here
 * pushes: the ignore reply is a baseline entry a reviewer reviews and commits.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { findingFingerprint } from "./baseline.js";
import { builtInDetectors } from "./detectors/index.js";
import type { Finding } from "./domain.js";
import { scanRepository } from "./engine.js";

/** The command word at the start of a trimmed comment line. */
export const COMMAND_PREFIX = "/evergreen";

/** How long an `/evergreen ignore <finding-id> <reason>` entry lasts by default. */
export const DEFAULT_IGNORE_DAYS = 90;

/** The `author_association` values GitHub reports for people who can already write to the repository. */
export const trustedAssociations = ["OWNER", "MEMBER", "COLLABORATOR"] as const;

export type TrustedAssociation = (typeof trustedAssociations)[number];

export type CommentCommand =
  | { kind: "explain"; findingId: string }
  | { kind: "ignore"; findingId: string; reason: string };

export type CommentParse = { command: CommentCommand } | { error: string } | undefined;

const USAGE = "Usage: `/evergreen explain <finding-id>` or `/evergreen ignore <finding-id> <reason>`.";
const MAX_REASON_LENGTH = 500;
const MAX_FINDING_ID_LENGTH = 300;

/**
 * Reads the first line of a comment that starts with `/evergreen`. A line that is not an Evergreen
 * command yields `undefined`; a command with the wrong arguments yields a short usage error.
 */
export function parseCommentCommand(body: string): CommentParse {
  const line = body
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => new RegExp(`^${COMMAND_PREFIX}(?:\\s|$)`, "i").test(candidate));
  if (line === undefined) return undefined;

  const rest = line.slice(COMMAND_PREFIX.length).trim();
  if (rest.length === 0) return { error: USAGE };

  const [verb, ...words] = rest.split(/\s+/);
  const command = (verb ?? "").toLowerCase();
  if (command !== "explain" && command !== "ignore") return { error: `Unknown command \`${code(command)}\`. ${USAGE}` };

  const argumentsText = rest.slice((verb ?? "").length).trim();
  if (argumentsText.length === 0) return { error: USAGE };

  if (command === "explain") {
    if (words.length !== 1) return { error: USAGE };
    const findingId = words[0] ?? "";
    if (findingId.length > MAX_FINDING_ID_LENGTH) return { error: "That finding id is too long." };
    return { command: { kind: "explain", findingId } };
  }

  const separator = argumentsText.search(/\s/);
  if (separator < 0) return { error: USAGE };
  const findingId = argumentsText.slice(0, separator);
  const reason = argumentsText.slice(separator + 1).trim();
  if (findingId.length > MAX_FINDING_ID_LENGTH) return { error: "That finding id is too long." };
  if (reason.length === 0) return { error: USAGE };
  if (reason.length > MAX_REASON_LENGTH) return { error: `The reason must be at most ${MAX_REASON_LENGTH} characters.` };
  return { command: { kind: "ignore", findingId, reason } };
}

/** One pull request comment event, as the Action reads it. Every field is untrusted. */
export interface IssueCommentPayload {
  issue?: { number?: number; pull_request?: { url?: string } };
  comment?: {
    id?: number;
    body?: string;
    author_association?: string;
    user?: { login?: string };
  };
}

export type CommentDecision =
  | { kind: "skip"; reason: string }
  | { kind: "reply"; commentId: number; body: string };

export interface AnswerCommandOptions {
  /** Finds the findings of the checkout. Called only when a trusted command asks for one. */
  loadFindings: () => Promise<readonly Finding[]>;
  /** The reference day (YYYY-MM-DD) the ignore entry starts on; defaults to today in UTC. */
  today?: string;
  /** The baseline the entry is meant for, shown in the reply. */
  baselinePath?: string;
  /** Days until the ignore entry expires; defaults to {@link DEFAULT_IGNORE_DAYS}. */
  ignoreDays?: number;
}

/**
 * Decides what to do with one `issue_comment` payload. Everything is checked before the checkout is
 * scanned, so a comment from an untrusted author or on an issue costs no work and gets no reply.
 */
export async function answerComment(event: IssueCommentPayload, options: AnswerCommandOptions): Promise<CommentDecision> {
  if (!event.issue?.pull_request) return { kind: "skip", reason: "the comment is not on a pull request" };

  const association = event.comment?.author_association;
  if (!trustedAssociations.includes(association as TrustedAssociation)) {
    return { kind: "skip", reason: `the author association "${association ?? "unknown"}" is not allowed` };
  }

  const parsed = parseCommentCommand(event.comment?.body ?? "");
  if (parsed === undefined) return { kind: "skip", reason: "the comment is not an /evergreen command" };

  const commentId = event.comment?.id;
  if (commentId === undefined || !Number.isInteger(commentId) || commentId <= 0) {
    return { kind: "skip", reason: "the comment has no id to reply to" };
  }

  if ("error" in parsed) return { kind: "reply", commentId, body: parsed.error };

  const findings = await options.loadFindings();
  const finding = findings.find((candidate) => candidate.id === parsed.command.findingId);
  if (!finding) return { kind: "reply", commentId, body: renderMissingFinding(parsed.command.findingId) };

  if (parsed.command.kind === "explain") return { kind: "reply", commentId, body: renderExplainReply(finding) };
  return {
    kind: "reply",
    commentId,
    body: renderIgnoreReply(finding, parsed.command.reason, {
      today: options.today ?? today(),
      ...(options.baselinePath === undefined ? {} : { baselinePath: options.baselinePath }),
      ...(options.ignoreDays === undefined ? {} : { days: options.ignoreDays }),
    }),
  };
}

/** The marker that ties a reply to the comment that asked for it, so a re-run updates it instead of posting again. */
export function replyMarker(commentId: number): string {
  return `<!-- evergreen-command-reply:${commentId} -->`;
}

/** The explanation a reviewer asked for: the finding, where it is, what replaces it, and its sources. */
export function renderExplainReply(finding: Finding): string {
  const line = finding.location.line === undefined ? "" : `:${finding.location.line}`;
  const lines = [
    `### ${finding.severity.toUpperCase()} · ${finding.title}`,
    "",
    finding.summary,
    "",
    `**Rule:** ${code(finding.ruleId)}`,
    `**Finding:** ${code(finding.id)}`,
    `**Location:** ${code(`${finding.location.path}${line}`)}`,
  ];
  if (finding.dependencyPath && finding.dependencyPath.length > 0) {
    lines.push(`**Dependency path:** ${finding.dependencyPath.map((entry) => code(entry)).join(" › ")}`);
  }
  if (finding.replacement) lines.push(`**Replacement:** ${finding.replacement}`);
  if (finding.deadline) lines.push(`**Deadline:** ${finding.deadline}`);
  if (finding.advisoryIds && finding.advisoryIds.length > 0) lines.push(`**Advisories:** ${finding.advisoryIds.map((id) => code(id)).join(", ")}`);

  const usages = finding.usages ?? [];
  if (usages.length > 0) {
    lines.push("", "**Affected usages**");
    for (const usage of usages.slice(0, 20)) {
      const usageLine = usage.location.line === undefined ? "" : `:${usage.location.line}`;
      lines.push(`- ${code(`${usage.location.path}${usageLine}`)} — ${code(usage.kind)} ${code(usage.symbol)}`);
    }
    if (usages.length > 20) lines.push(`…and ${usages.length - 20} more.`);
  }

  lines.push("", "**Sources**");
  if (finding.sources.length === 0) lines.push("- No source is recorded for this finding.");
  for (const source of finding.sources) lines.push(`- [${linkLabel(source.title)}](${source.url})`);
  return lines.join("\n");
}

export interface IgnoreReplyOptions {
  /** The day the entry is created (YYYY-MM-DD). */
  today: string;
  /** Where the entry belongs; `.evergreen-baseline.json` when unknown. */
  baselinePath?: string;
  days?: number;
}

/** A baseline entry ready to review and commit, with the day it stops hiding the finding. */
export function renderIgnoreReply(finding: Finding, reason: string, options: IgnoreReplyOptions): string {
  const days = options.days ?? DEFAULT_IGNORE_DAYS;
  const expires = addDays(options.today, days);
  const entry = {
    fingerprint: findingFingerprint(finding),
    ruleId: finding.ruleId,
    path: finding.location.path,
    reason,
    created: options.today,
    expires,
  };
  const path = options.baselinePath ?? ".evergreen-baseline.json";
  const where = options.baselinePath === undefined ? `${code(path)} (and set the \`baseline\` input to it)` : code(path);
  return [
    `**${finding.severity.toUpperCase()} · ${finding.title}**`,
    "",
    `Nothing was pushed. Add this entry to ${where} and commit it:`,
    "",
    "```json",
    JSON.stringify(entry, null, 2),
    "```",
    "",
    `The suppression hides this finding until **${expires}**. After that the finding is reported again, and \`on-expired: fail\` fails the job as well.`,
    "",
    `Fingerprint source: ${code(finding.id)}.`,
  ].join("\n");
}

function renderMissingFinding(findingId: string): string {
  return [
    `I could not find a lifecycle finding with id ${code(findingId)} in this checkout.`,
    "",
    "Take the id from an annotation's `Finding:` line, or run `npx evergreen-deprecation scan . --json` to list the current ids.",
  ].join("\n");
}

/** Adds whole calendar days to a `YYYY-MM-DD` day. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Renders untrusted text inside a code span: no backticks and no line breaks, so it cannot mention or link. */
function code(text: string): string {
  return `\`${text.replace(/[`\r\n\t]+/g, " ").trim()}\``;
}

/** Escapes the label of a Markdown link. */
function linkLabel(text: string): string {
  return text.replace(/[\\[\]]/g, (character) => `\\${character}`).replace(/\r?\n/g, " ");
}

export interface CommentCommandRunOptions {
  /** Repository root to scan for the finding id. */
  root: string;
  /** Path to the event payload; `GITHUB_EVENT_PATH` in the Action. */
  eventPath?: string;
  /** The baseline path shown in an ignore reply. */
  baselinePath?: string;
  /** The reference day (YYYY-MM-DD); defaults to today in UTC. */
  today?: string;
  token?: string;
  /** owner/name */
  repository?: string;
  apiUrl?: string;
  /** Replaces the global `fetch`; the tests use it to observe the API calls. */
  fetchImpl?: typeof fetch;
}

interface CommentTarget {
  apiUrl: string;
  repository: string;
  pullRequest: number;
  token: string;
}

async function githubRequest(target: CommentTarget, method: string, path: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${target.apiUrl}${path}`, {
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

/** Creates the reply, or updates the one a re-run left for the same comment. Returns "created" or "updated". */
async function upsertReply(target: CommentTarget, marker: string, body: string, fetchImpl: typeof fetch): Promise<"created" | "updated"> {
  const base = `/repos/${target.repository}/issues`;
  for (let page = 1; page <= 10; page += 1) {
    const comments = (await githubRequest(target, "GET", `${base}/${target.pullRequest}/comments?per_page=100&page=${page}`, undefined, fetchImpl)) as Array<{ id: number; body?: string }>;
    const existing = comments.find((comment) => comment.body?.startsWith(marker));
    if (existing) {
      await githubRequest(target, "PATCH", `${base}/comments/${existing.id}`, { body }, fetchImpl);
      return "updated";
    }
    if (comments.length < 100) break;
  }
  await githubRequest(target, "POST", `${base}/${target.pullRequest}/comments`, { body }, fetchImpl);
  return "created";
}

/**
 * Answers one `issue_comment` payload: reads the event, checks the author, scans the checkout for the
 * finding, and posts the reply. Skips are logged as notices, never as failures.
 */
export async function runCommentCommands(options: CommentCommandRunOptions): Promise<"replied" | "skipped"> {
  if (!options.eventPath) {
    console.log("::notice title=Evergreen comment command skipped::commands: true needs GITHUB_EVENT_PATH, which the runner sets for issue_comment events.");
    return "skipped";
  }

  const event = JSON.parse(await readFile(options.eventPath, "utf8")) as IssueCommentPayload;
  const pullRequest = event.issue?.number;
  const token = options.token;
  const repository = options.repository;
  if (pullRequest === undefined || !token || !repository) {
    console.log("::notice title=Evergreen comment command skipped::commands needs a pull request number, a token, and GITHUB_REPOSITORY.");
    return "skipped";
  }

  const decision = await answerComment(event, {
    loadFindings: async () => (await scanRepository(resolve(options.root), builtInDetectors)).findings,
    ...(options.today === undefined ? {} : { today: options.today }),
    ...(options.baselinePath === undefined ? {} : { baselinePath: options.baselinePath }),
  });

  if (decision.kind === "skip") {
    console.log(`::notice title=Evergreen comment command skipped::${decision.reason}.`);
    return "skipped";
  }

  const marker = replyMarker(decision.commentId);
  try {
    const done = await upsertReply(
      { apiUrl: options.apiUrl ?? "https://api.github.com", repository, pullRequest, token },
      marker,
      `${marker}\n${decision.body}`,
      options.fetchImpl ?? fetch,
    );
    console.log(`Evergreen ${done} its reply to comment ${decision.commentId}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning title=Evergreen could not reply to the comment::${message}`);
    return "skipped";
  }
  return "replied";
}
