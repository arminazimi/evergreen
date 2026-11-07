// Installation webhook handler: verify signature, then open one onboarding PR per selected repo.

import { createAppJwt } from "./app-jwt.mjs";
import { createGitHubClient, createInstallationToken } from "./github-api.mjs";
import { openOnboardingPullRequest } from "./open-onboarding-pr.mjs";
import { verifySignature } from "./verify-signature.mjs";

export class WebhookUnauthorizedError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "WebhookUnauthorizedError";
  }
}

/**
 * Repositories named by an `installation` or `installation_repositories` payload.
 * @param {string} eventName
 * @param {Record<string, unknown>} payload
 * @returns {{ owner: string, repo: string }[]}
 */
export function repositoriesFromPayload(eventName, payload) {
  if (eventName === "installation" && payload.action === "created") {
    return normalizeRepos(payload.repositories);
  }
  if (eventName === "installation_repositories" && payload.action === "added") {
    return normalizeRepos(payload.repositories_added);
  }
  return [];
}

function normalizeRepos(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    if (typeof entry?.full_name !== "string" || !entry.full_name.includes("/")) continue;
    const [owner, repo] = entry.full_name.split("/");
    if (owner && repo) out.push({ owner, repo });
  }
  return out;
}

/**
 * @param {{
 *   rawBody: string,
 *   signature: string | undefined,
 *   eventName: string,
 *   secret: string,
 *   appId: string | number,
 *   privateKeyPem: string,
 *   fetchImpl?: typeof fetch,
 *   apiBase?: string,
 *   openPullRequest?: typeof openOnboardingPullRequest,
 * }} input
 */
export async function handleWebhook(input) {
  if (!verifySignature(input.secret, input.signature ?? "", input.rawBody)) {
    throw new WebhookUnauthorizedError();
  }
  const payload = JSON.parse(input.rawBody);
  const repos = repositoriesFromPayload(input.eventName, payload);
  if (repos.length === 0) return { results: [] };

  const installationId = payload.installation?.id;
  if (installationId === undefined || installationId === null) {
    throw new Error("installation id missing from webhook payload");
  }

  const jwt = createAppJwt({ appId: input.appId, privateKeyPem: input.privateKeyPem });
  const token = await createInstallationToken({
    jwt,
    installationId,
    fetchImpl: input.fetchImpl,
    apiBase: input.apiBase,
  });
  const github = createGitHubClient({
    token,
    fetchImpl: input.fetchImpl,
    apiBase: input.apiBase,
  });
  const open = input.openPullRequest ?? openOnboardingPullRequest;
  const results = [];
  for (const { owner, repo } of repos) {
    results.push(await open({ owner, repo, github }));
  }
  return { results };
}
