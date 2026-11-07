#!/usr/bin/env node
// Local webhook replay: signs a fixture installation payload and drives the handler against a
// fake GitHub API. Proves the app would open `evergreen/onboarding` without calling the network.

import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CI_WORKFLOW_FILE } from "../../dist/src/init.js";

import { handleWebhook } from "./handle-webhook.mjs";
import { ONBOARDING_BRANCH, ONBOARDING_PULL_REQUEST_TITLE } from "./pr-body.mjs";
import { signBody } from "./verify-signature.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "fixtures", "installation.created.json");
const SECRET = "replay-webhook-secret";
const APP_ID = "12345";

/**
 * In-memory GitHub stand-in that records the onboarding pull request.
 * Pre-seed `files` with remote contents (for example a package.json).
 */
export function createReplayGitHub(seed = {}) {
  const remoteFiles = { ...seed.files };
  const blobs = new Map();
  let blobCounter = 0;
  let opened;

  return {
    github: {
      async getRepository() {
        return { default_branch: seed.defaultBranch ?? "main" };
      },
      async getFileText(_owner, _repo, path) {
        return remoteFiles[path];
      },
      async getRefSha() {
        return seed.baseSha ?? "base-sha";
      },
      async getCommit() {
        return { tree: { sha: seed.baseTree ?? "base-tree" } };
      },
      async createBlob(_owner, _repo, content) {
        blobCounter += 1;
        const sha = `blob-${blobCounter}`;
        blobs.set(sha, content);
        return sha;
      },
      async createTree() {
        return "tree-sha";
      },
      async createCommit() {
        return "commit-sha";
      },
      async createRef() {},
      async updateRef() {},
      async listOpenPulls() {
        return [];
      },
      async createPullRequest(_owner, _repo, pull) {
        opened = {
          ...pull,
          html_url: `https://github.com/${seed.owner ?? "acme"}/${seed.repo ?? "app"}/pull/1`,
          number: 1,
          blobContents: Object.fromEntries(blobs),
        };
        return opened;
      },
    },
    getOpened: () => opened,
    remoteFiles,
  };
}

export async function replayInstallationWebhook(options = {}) {
  const rawBody = options.rawBody ?? (await readFile(FIXTURE, "utf8"));
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const replay = createReplayGitHub({
    files: {
      "package.json": `${JSON.stringify({ name: "demo" }, null, 2)}\n`,
      "README.md": "# Demo\n",
      ...(options.files ?? {}),
    },
    owner: "acme",
    repo: "demo",
  });

  const installationTokenCalls = [];
  const fetchImpl = async (url, init) => {
    const href = String(url);
    if (href.includes("/app/installations") && !href.includes("/access_tokens")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        async json() {
          return [{ id: 1, account: { login: "acme" } }];
        },
      };
    }
    if (href.includes("/access_tokens")) {
      installationTokenCalls.push({ url: href, init });
      return {
        ok: true,
        status: 201,
        headers: { get: () => null },
        async json() {
          return { token: "installation-token" };
        },
      };
    }
    throw new Error(`unexpected fetch in replay: ${url}`);
  };

  const result = await handleWebhook({
    rawBody,
    signature: signBody(SECRET, rawBody),
    eventName: options.eventName ?? "installation",
    secret: SECRET,
    appId: APP_ID,
    privateKeyPem,
    fetchImpl,
    openPullRequest: async ({ owner, repo }) => {
      const { openOnboardingPullRequest } = await import("./open-onboarding-pr.mjs");
      return openOnboardingPullRequest({ owner, repo, github: replay.github });
    },
  });

  return { result, opened: replay.getOpened(), installationTokenCalls };
}

/** CLI entry used by `node integrations/github-app/replay.mjs` and by tests. */
export async function runReplayCli(replay = replayInstallationWebhook) {
  const { result, opened } = await replay();
  const first = result.results[0];
  if (first?.status !== "opened") {
    process.stderr.write(`replay failed: expected opened, got ${JSON.stringify(first)}\n`);
    process.exitCode = 1;
    return;
  }
  if (opened?.head !== ONBOARDING_BRANCH || opened?.title !== ONBOARDING_PULL_REQUEST_TITLE) {
    process.stderr.write(`replay failed: unexpected pull request shape ${JSON.stringify(opened)}\n`);
    process.exitCode = 1;
    return;
  }
  const paths = Object.values(opened.blobContents);
  const joined = paths.join("\n");
  if (!joined.includes("name: Evergreen") || !joined.includes("evergreen.config.v1")) {
    process.stderr.write("replay failed: proposed files missing workflow or config contents\n");
    process.exitCode = 1;
    return;
  }
  if (!first.files?.includes(CI_WORKFLOW_FILE) || !first.files?.includes("README.md")) {
    process.stderr.write(`replay failed: unexpected file list ${JSON.stringify(first.files)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        pullRequestUrl: first.pullRequestUrl,
        branch: ONBOARDING_BRANCH,
        workflow: CI_WORKFLOW_FILE,
        files: first.files,
        stacks: first.stacks,
      },
      null,
      2,
    ) + "\n",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runReplayCli();
}
