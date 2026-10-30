/**
 * Posts the pull request comment and the fix-suggestion review. These are the only network calls in the
 * Action, made after the scan has finished and only when `pr-comment` or `suggest-fixes` is on; scans
 * never use the network.
 */
import { FIX_SUGGESTION_MARKER, PR_COMMENT_MARKER } from "./github-action.js";
import type { SuggestionComment } from "./github-action.js";

export interface PullRequestCommentTarget {
  /** API origin, for example https://api.github.com. */
  apiUrl: string;
  /** owner/name */
  repository: string;
  pullRequest: number;
  token: string;
}

interface IssueComment {
  id: number;
  body?: string;
}

interface PullRequestReview {
  id: number;
  body?: string | null;
}

interface ReviewComment {
  id: number;
  body?: string | null;
  path: string;
  line?: number | null;
  original_line?: number | null;
  start_line?: number | null;
  original_start_line?: number | null;
}

async function githubRequest(target: PullRequestCommentTarget, method: string, path: string, body?: unknown): Promise<unknown> {
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
  const text = await response.text();
  return text.length === 0 ? undefined : JSON.parse(text);
}

/** Reads every page of a GitHub list endpoint, up to the API's 1,000-item ceiling. */
async function listAll<T>(target: PullRequestCommentTarget, path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = (await githubRequest(target, "GET", `${path}?per_page=100&page=${page}`)) as T[];
    items.push(...batch);
    if (batch.length < 100) break;
  }
  return items;
}

/** Creates the Evergreen comment on the pull request, or updates the one a previous run left. Returns "created" or "updated". */
export async function upsertPullRequestComment(target: PullRequestCommentTarget, body: string): Promise<"created" | "updated"> {
  const base = `/repos/${target.repository}/issues`;
  for (let page = 1; page <= 10; page += 1) {
    const comments = (await githubRequest(target, "GET", `${base}/${target.pullRequest}/comments?per_page=100&page=${page}`)) as IssueComment[];
    const existing = comments.find((comment) => comment.body?.startsWith(PR_COMMENT_MARKER));
    if (existing) {
      await githubRequest(target, "PATCH", `${base}/comments/${existing.id}`, { body });
      return "updated";
    }
    if (comments.length < 100) break;
  }
  await githubRequest(target, "POST", `${base}/${target.pullRequest}/comments`, { body });
  return "created";
}

/** The review the runner posts: a body that carries the marker and one comment per suggested fix. */
export interface FixSuggestionsReview {
  body: string;
  /** The pull request head SHA the suggestions were computed against. */
  commitId?: string;
  comments: SuggestionComment[];
}

/** How an existing comment is matched to a planned suggestion: the same file and the same replaced lines. */
function suggestionKey(path: string, start: number | null | undefined, line: number | null | undefined): string {
  return `${path}\u0000${start ?? line ?? 0}\u0000${line ?? 0}`;
}

/**
 * Posts the fix-suggestion review, or updates the one a previous run left: the review body and the
 * comments on the same file and lines are rewritten, comments whose suggestion is gone are deleted,
 * and a suggestion at a new line arrives as one more review, because the API cannot add comments to a
 * submitted review.
 */
export async function upsertFixSuggestionsReview(target: PullRequestCommentTarget, review: FixSuggestionsReview): Promise<"created" | "updated"> {
  const base = `/repos/${target.repository}/pulls/${target.pullRequest}`;
  const payload = {
    ...(review.commitId === undefined ? {} : { commit_id: review.commitId }),
    body: review.body,
    event: "COMMENT",
    comments: review.comments,
  };
  const reviews = await listAll<PullRequestReview>(target, `${base}/reviews`);
  const existing = reviews.find((candidate) => candidate.body?.startsWith(FIX_SUGGESTION_MARKER));
  if (!existing) {
    await githubRequest(target, "POST", `${base}/reviews`, payload);
    return "created";
  }

  if (existing.body !== review.body) await githubRequest(target, "PUT", `${base}/reviews/${existing.id}`, { body: review.body });

  const comments = await listAll<ReviewComment>(target, `${base}/reviews/${existing.id}/comments`);
  const remaining = new Map<string, ReviewComment>();
  for (const comment of comments) {
    const line = comment.line ?? comment.original_line ?? 0;
    const start = comment.start_line ?? comment.original_start_line ?? line;
    remaining.set(suggestionKey(comment.path, start, line), comment);
  }

  const missing: SuggestionComment[] = [];
  for (const comment of review.comments) {
    const key = suggestionKey(comment.path, comment.start_line, comment.line);
    const match = remaining.get(key);
    if (!match) {
      missing.push(comment);
      continue;
    }
    remaining.delete(key);
    if (match.body !== comment.body) {
      await githubRequest(target, "PATCH", `/repos/${target.repository}/pulls/comments/${match.id}`, { body: comment.body });
    }
  }
  for (const comment of remaining.values()) {
    await githubRequest(target, "DELETE", `/repos/${target.repository}/pulls/comments/${comment.id}`);
  }
  if (missing.length > 0) await githubRequest(target, "POST", `${base}/reviews`, { ...payload, comments: missing });
  return "updated";
}
