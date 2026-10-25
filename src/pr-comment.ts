/**
 * Posts the pull request summary comment. This is the only network call in the Action, made after the
 * scan has finished and only when `pr-comment` is on; scans never use the network.
 */
import { PR_COMMENT_MARKER } from "./github-action.js";

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
  return response.json();
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
