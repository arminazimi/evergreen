// Thin GitHub REST client for installation tokens. Inject `fetch` in tests; production uses global fetch.
// Requests always target https://api.github.com so a webhook field cannot redirect the client (SSRF).

const API_ORIGIN = "https://api.github.com";
const ACCEPT = "application/vnd.github+json";
const API_VERSION = "2022-11-28";
const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Positive integer installation id from a signed webhook.
 * Strips every non-digit first so the value cannot reshape a URL path (CodeQL SSRF sanitizer).
 */
export function parseInstallationId(value) {
  const digits = String(value).replace(/[^0-9]/g, "");
  if (digits.length === 0 || digits.startsWith("0")) {
    throw new Error("installation id must be a positive integer");
  }
  return digits;
}

/** Owner or repository name segment safe for a path under api.github.com. */
export function assertRepoName(value, label) {
  if (typeof value !== "string" || !NAME.test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function apiUrl(pathname) {
  return new URL(pathname, API_ORIGIN);
}

/**
 * @param {{ token: string, fetchImpl?: typeof fetch }} options
 */
export function createGitHubClient(options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function request(method, pathname, body) {
    const response = await fetchImpl(apiUrl(pathname), {
      method,
      headers: {
        accept: ACCEPT,
        authorization: `Bearer ${options.token}`,
        "x-github-api-version": API_VERSION,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 404) return { status: 404, json: undefined };
    const text = await response.text();
    const json = text.length === 0 ? undefined : JSON.parse(text);
    if (!response.ok) {
      const message = json?.message ?? text.slice(0, 200);
      throw new Error(`GitHub ${method} ${pathname} failed (${response.status}): ${message}`);
    }
    return { status: response.status, json };
  }

  return {
    async getRepository(owner, repo) {
      const { json } = await request(
        "GET",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}`,
      );
      return json;
    },

    async getFileText(owner, repo, path, ref) {
      const encoded = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const query = ref === undefined ? "" : `?ref=${encodeURIComponent(ref)}`;
      const { status, json } = await request(
        "GET",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/contents/${encoded}${query}`,
      );
      if (status === 404 || json === undefined || json.type !== "file" || typeof json.content !== "string") {
        return undefined;
      }
      return Buffer.from(json.content.replaceAll("\n", ""), "base64").toString("utf8");
    },

    async getRefSha(owner, repo, ref) {
      const { json } = await request(
        "GET",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/ref/${ref}`,
      );
      return json.object.sha;
    },

    async getCommit(owner, repo, sha) {
      const { json } = await request(
        "GET",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/commits/${sha}`,
      );
      return json;
    },

    async createBlob(owner, repo, content) {
      const { json } = await request(
        "POST",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/blobs`,
        {
          content: Buffer.from(content, "utf8").toString("base64"),
          encoding: "base64",
        },
      );
      return json.sha;
    },

    async createTree(owner, repo, baseTree, entries) {
      const { json } = await request(
        "POST",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/trees`,
        {
          base_tree: baseTree,
          tree: entries.map((entry) => ({
            path: entry.path,
            mode: "100644",
            type: "blob",
            sha: entry.sha,
          })),
        },
      );
      return json.sha;
    },

    async createCommit(owner, repo, { message, tree, parents }) {
      const { json } = await request(
        "POST",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/commits`,
        {
          message,
          tree,
          parents,
        },
      );
      return json.sha;
    },

    async createRef(owner, repo, ref, sha) {
      await request("POST", `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/refs`, {
        ref,
        sha,
      });
    },

    async updateRef(owner, repo, ref, sha) {
      await request(
        "PATCH",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/git/refs/${ref}`,
        { sha, force: true },
      );
    },

    async listOpenPulls(owner, repo, head) {
      const { json } = await request(
        "GET",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/pulls?state=open&head=${encodeURIComponent(head)}`,
      );
      return Array.isArray(json) ? json : [];
    },

    async createPullRequest(owner, repo, { title, body, head, base }) {
      const { json } = await request(
        "POST",
        `/repos/${assertRepoName(owner, "owner")}/${assertRepoName(repo, "repo")}/pulls`,
        {
          title,
          body,
          head,
          base,
        },
      );
      return json;
    },
  };
}

/**
 * Next page URL from a GitHub `Link` header, only when the host is api.github.com.
 * @param {string | null | undefined} header
 * @returns {string | undefined}
 */
export function nextInstallationsUrl(header) {
  if (typeof header !== "string" || header.length === 0) return undefined;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/i);
    if (!match) continue;
    try {
      const url = new URL(match[1]);
      if (url.protocol === "https:" && url.hostname === "api.github.com") return url.href;
    } catch {
      // Ignore malformed Link entries.
    }
  }
  return undefined;
}

/**
 * Exchanges an app JWT for a short-lived installation token.
 *
 * Pages through `GET /app/installations` (following `Link: rel="next"`) until the
 * digits-only webhook id matches an installation GitHub returned, then POSTs a token
 * using that list id. The webhook body never shapes the request URL (CodeQL SSRF).
 *
 * @param {{ jwt: string, installationId: number | string, fetchImpl?: typeof fetch }} input
 */
export async function createInstallationToken(input) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const requested = parseInstallationId(input.installationId);
  const headers = {
    accept: ACCEPT,
    authorization: `Bearer ${input.jwt}`,
    "x-github-api-version": API_VERSION,
  };

  let pageUrl = "https://api.github.com/app/installations?per_page=100";
  let pathId;
  while (pageUrl !== undefined) {
    const listed = await fetchImpl(pageUrl, { method: "GET", headers });
    const installations = await listed.json();
    if (!listed.ok || !Array.isArray(installations)) {
      throw new Error(`list installations failed (${listed.status})`);
    }
    const match = installations.find((entry) => parseInstallationId(entry?.id) === requested);
    if (match !== undefined) {
      pathId = parseInstallationId(match.id);
      break;
    }
    const link = typeof listed.headers?.get === "function" ? listed.headers.get("link") : undefined;
    pageUrl = nextInstallationsUrl(link);
  }
  if (pathId === undefined) {
    throw new Error("installation is not registered for this app");
  }

  // codeql[js/request-forgery] Fixed https://api.github.com host; path id comes from the app installation list, not the webhook body.
  const response = await fetchImpl("https://api.github.com/app/installations/" + pathId + "/access_tokens", {
    method: "POST",
    headers,
  });
  const json = await response.json();
  if (!response.ok || typeof json.token !== "string") {
    throw new Error(`installation token failed (${response.status}): ${json.message ?? "unknown"}`);
  }
  return json.token;
}
