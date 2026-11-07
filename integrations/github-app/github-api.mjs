// Thin GitHub REST client for installation tokens. Inject `fetch` in tests; production uses global fetch.

const API = "https://api.github.com";
const ACCEPT = "application/vnd.github+json";
const API_VERSION = "2022-11-28";

/**
 * @param {{ token: string, fetchImpl?: typeof fetch, apiBase?: string }} options
 */
export function createGitHubClient(options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const apiBase = options.apiBase ?? API;

  async function request(method, path, body) {
    const response = await fetchImpl(`${apiBase}${path}`, {
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
      throw new Error(`GitHub ${method} ${path} failed (${response.status}): ${message}`);
    }
    return { status: response.status, json };
  }

  return {
    async getRepository(owner, repo) {
      const { json } = await request("GET", `/repos/${owner}/${repo}`);
      return json;
    },

    async getFileText(owner, repo, path, ref) {
      const encoded = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const query = ref === undefined ? "" : `?ref=${encodeURIComponent(ref)}`;
      const { status, json } = await request("GET", `/repos/${owner}/${repo}/contents/${encoded}${query}`);
      if (status === 404 || json === undefined || json.type !== "file" || typeof json.content !== "string") {
        return undefined;
      }
      return Buffer.from(json.content.replaceAll("\n", ""), "base64").toString("utf8");
    },

    async getRefSha(owner, repo, ref) {
      const { json } = await request("GET", `/repos/${owner}/${repo}/git/ref/${ref}`);
      return json.object.sha;
    },

    async getCommit(owner, repo, sha) {
      const { json } = await request("GET", `/repos/${owner}/${repo}/git/commits/${sha}`);
      return json;
    },

    async createBlob(owner, repo, content) {
      const { json } = await request("POST", `/repos/${owner}/${repo}/git/blobs`, {
        content: Buffer.from(content, "utf8").toString("base64"),
        encoding: "base64",
      });
      return json.sha;
    },

    async createTree(owner, repo, baseTree, entries) {
      const { json } = await request("POST", `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTree,
        tree: entries.map((entry) => ({
          path: entry.path,
          mode: "100644",
          type: "blob",
          sha: entry.sha,
        })),
      });
      return json.sha;
    },

    async createCommit(owner, repo, { message, tree, parents }) {
      const { json } = await request("POST", `/repos/${owner}/${repo}/git/commits`, {
        message,
        tree,
        parents,
      });
      return json.sha;
    },

    async createRef(owner, repo, ref, sha) {
      await request("POST", `/repos/${owner}/${repo}/git/refs`, { ref, sha });
    },

    async updateRef(owner, repo, ref, sha) {
      await request("PATCH", `/repos/${owner}/${repo}/git/refs/${ref}`, { sha, force: true });
    },

    async listOpenPulls(owner, repo, head) {
      const { json } = await request(
        "GET",
        `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(head)}`,
      );
      return Array.isArray(json) ? json : [];
    },

    async createPullRequest(owner, repo, { title, body, head, base }) {
      const { json } = await request("POST", `/repos/${owner}/${repo}/pulls`, {
        title,
        body,
        head,
        base,
      });
      return json;
    },
  };
}

/**
 * Exchanges an app JWT for a short-lived installation token.
 * @param {{ jwt: string, installationId: number | string, fetchImpl?: typeof fetch, apiBase?: string }} input
 */
export async function createInstallationToken(input) {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  const apiBase = input.apiBase ?? API;
  const response = await fetchImpl(`${apiBase}/app/installations/${input.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      accept: ACCEPT,
      authorization: `Bearer ${input.jwt}`,
      "x-github-api-version": API_VERSION,
    },
  });
  const json = await response.json();
  if (!response.ok || typeof json.token !== "string") {
    throw new Error(`installation token failed (${response.status}): ${json.message ?? "unknown"}`);
  }
  return json.token;
}
