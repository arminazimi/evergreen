import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { CONFIG_FILE_NAME } from "../src/config.js";
import { CI_WORKFLOW_FILE } from "../src/init.js";

type FetchStub = (
  url: unknown,
  init?: unknown,
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get: (name: string) => string | null };
  json: () => Promise<unknown>;
}>;

interface ReplayModule {
  replayInstallationWebhook: (options?: {
    files?: Record<string, string>;
    eventName?: string;
    rawBody?: string;
  }) => Promise<{
    result: { results: Array<Record<string, unknown>> };
    opened:
      | {
          head: string;
          title: string;
          body: string;
          blobContents: Record<string, string>;
        }
      | undefined;
    installationTokenCalls: Array<{ url: string }>;
  }>;
}

interface VerifyModule {
  signBody: (secret: string, rawBody: string) => string;
  verifySignature: (secret: string, signatureHeader: string, rawBody: string) => boolean;
}

interface HandleModule {
  repositoriesFromPayload: (
    eventName: string,
    payload: Record<string, unknown>,
  ) => Array<{ owner: string; repo: string }>;
  handleWebhook: (input: {
    rawBody: string;
    signature?: string;
    eventName: string;
    secret: string;
    appId: string | number;
    privateKeyPem: string;
    fetchImpl?: FetchStub;
    openPullRequest?: (input: { owner: string; repo: string; github: unknown }) => Promise<Record<string, unknown>>;
  }) => Promise<{ results: Array<Record<string, unknown>> }>;
  WebhookUnauthorizedError: new () => Error;
}

interface PrBodyModule {
  ONBOARDING_BRANCH: string;
  ONBOARDING_PULL_REQUEST_TITLE: string;
  onboardingPullRequestBody: (input: {
    repository: string;
    stacks: readonly string[];
    files: readonly string[];
  }) => string;
}

interface GitHubApiModule {
  createInstallationToken: (input: {
    jwt: string;
    installationId: number | string;
    fetchImpl?: FetchStub;
  }) => Promise<string>;
  parseInstallationId: (value: unknown) => string;
  nextInstallationsUrl: (header: string | null | undefined) => string | undefined;
}

interface CommitFilesModule {
  commitFilesAndOpenPullRequest: (input: {
    github: Record<string, (...args: unknown[]) => Promise<unknown>>;
    owner: string;
    repo: string;
    baseBranch: string;
    body: string;
    files: Record<string, string>;
  }) => Promise<Record<string, unknown>>;
  ensureBranch: (
    github: { createRef: (...args: unknown[]) => Promise<void> },
    owner: string,
    repo: string,
    commitSha: string,
  ) => Promise<{ created: boolean; reason?: string }>;
}

interface ServerModule {
  MAX_WEBHOOK_BODY_BYTES: number;
  PayloadTooLargeError: new () => Error;
  readBody: (request: Readable, limit?: number) => Promise<string>;
  createWebhookServer: (config: Record<string, unknown>) => http.Server;
}

const root = resolve("integrations/github-app");

async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(resolve(root, file)).href)) as T;
}

function appKeyPem(): string {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

test("webhook signatures reject tampering and accept a matching HMAC", async () => {
  const { signBody, verifySignature } = await load<VerifyModule>("verify-signature.mjs");
  const body = '{"ok":true}';
  const signature = signBody("secret", body);
  assert.equal(verifySignature("secret", signature, body), true);
  assert.equal(verifySignature("secret", signature, '{"ok":false}'), false);
  assert.equal(verifySignature("secret", "sha256=dead", body), false);
  assert.equal(verifySignature("secret", "", body), false);
});

test("installation payloads list selected repositories and ignore other actions", async () => {
  const { repositoriesFromPayload } = await load<HandleModule>("handle-webhook.mjs");
  assert.deepEqual(
    repositoriesFromPayload("installation", {
      action: "created",
      repositories: [{ full_name: "acme/demo" }, { full_name: "bad" }],
    }),
    [{ owner: "acme", repo: "demo" }],
  );
  assert.deepEqual(
    repositoriesFromPayload("installation_repositories", {
      action: "added",
      repositories_added: [{ full_name: "acme/extra" }],
    }),
    [{ owner: "acme", repo: "extra" }],
  );
  assert.deepEqual(repositoriesFromPayload("installation", { action: "deleted", repositories: [] }), []);
});

test("the pull request body names added files and how to remove them", async () => {
  const { onboardingPullRequestBody } = await load<PrBodyModule>("pr-body.mjs");
  const body = onboardingPullRequestBody({
    repository: "acme/demo",
    stacks: ["node"],
    files: [CI_WORKFLOW_FILE, CONFIG_FILE_NAME, "README.md"],
  });
  assert.match(body, /acme\/demo/);
  assert.match(body, /`node`/);
  assert.match(body, new RegExp(CI_WORKFLOW_FILE.replaceAll(".", "\\.")));
  assert.match(body, /How to remove/);
  assert.match(body, /uninstall the Evergreen GitHub App/);
});

test("a local webhook replay opens the evergreen/onboarding pull request", async () => {
  const { replayInstallationWebhook } = await load<ReplayModule>("replay.mjs");
  const { ONBOARDING_BRANCH, ONBOARDING_PULL_REQUEST_TITLE } = await load<PrBodyModule>("pr-body.mjs");
  const { result, opened, installationTokenCalls } = await replayInstallationWebhook();
  const first = result.results[0];
  assert.equal(first?.["status"], "opened");
  assert.equal(opened?.head, ONBOARDING_BRANCH);
  assert.equal(opened?.title, ONBOARDING_PULL_REQUEST_TITLE);
  assert.deepEqual(first?.["stacks"], ["node"]);
  assert.deepEqual(first?.["files"], [CONFIG_FILE_NAME, CI_WORKFLOW_FILE, "README.md"].sort());
  assert.match(opened?.body ?? "", /How to remove/);
  const contents = Object.values(opened?.blobContents ?? {}).join("\n");
  assert.match(contents, /name: Evergreen/);
  assert.match(contents, /evergreen\.config\.v1/);
  assert.match(contents, /# Demo/);
  assert.equal(installationTokenCalls.length, 1);
  assert.match(installationTokenCalls[0]!.url, /\/app\/installations\/1\/access_tokens$/);
});

test("replay skips a repository that already has the Evergreen workflow", async () => {
  const { replayInstallationWebhook } = await load<ReplayModule>("replay.mjs");
  const { result, opened } = await replayInstallationWebhook({
    files: {
      [CI_WORKFLOW_FILE]: "name: Evergreen\n",
      "package.json": `${JSON.stringify({ name: "demo" })}\n`,
    },
  });
  assert.equal(result.results[0]?.["status"], "skipped");
  assert.equal(result.results[0]?.["reason"], "already-onboarded");
  assert.equal(opened, undefined);
});

test("handleWebhook rejects a bad signature before calling GitHub", async () => {
  const { handleWebhook, WebhookUnauthorizedError } = await load<HandleModule>("handle-webhook.mjs");
  const rawBody = await readFile(resolve(root, "fixtures/installation.created.json"), "utf8");
  await assert.rejects(
    () =>
      handleWebhook({
        rawBody,
        signature: "sha256=00",
        eventName: "installation",
        secret: "secret",
        appId: "1",
        privateKeyPem: appKeyPem(),
        fetchImpl: async () => {
          throw new Error("fetch should not run");
        },
      }),
    WebhookUnauthorizedError,
  );
});

test("createInstallationToken follows Link pages until the installation id is found", async () => {
  const { createInstallationToken, parseInstallationId, nextInstallationsUrl } =
    await load<GitHubApiModule>("github-api.mjs");
  assert.equal(parseInstallationId(150), "150");
  assert.equal(
    nextInstallationsUrl(
      '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next", <https://api.github.com/app/installations?per_page=100&page=2>; rel="last"',
    ),
    "https://api.github.com/app/installations?per_page=100&page=2",
  );
  assert.equal(nextInstallationsUrl('<https://evil.example/next>; rel="next"'), undefined);

  const page1 = Array.from({ length: 100 }, (_, index) => ({ id: index + 1 }));
  const calls: string[] = [];
  const token = await createInstallationToken({
    jwt: "jwt",
    installationId: 150,
    fetchImpl: async (url) => {
      const href = String(url);
      calls.push(href);
      if (href === "https://api.github.com/app/installations?per_page=100") {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name) =>
              name.toLowerCase() === "link"
                ? '<https://api.github.com/app/installations?per_page=100&page=2>; rel="next"'
                : null,
          },
          async json() {
            return page1;
          },
        };
      }
      if (href === "https://api.github.com/app/installations?per_page=100&page=2") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          async json() {
            return [{ id: 150 }, { id: 151 }];
          },
        };
      }
      if (href === "https://api.github.com/app/installations/150/access_tokens") {
        return {
          ok: true,
          status: 201,
          headers: { get: () => null },
          async json() {
            return { token: "installation-token-150" };
          },
        };
      }
      throw new Error(`unexpected fetch: ${href}`);
    },
  });
  assert.equal(token, "installation-token-150");
  assert.deepEqual(calls, [
    "https://api.github.com/app/installations?per_page=100",
    "https://api.github.com/app/installations?per_page=100&page=2",
    "https://api.github.com/app/installations/150/access_tokens",
  ]);
});

test("readBody rejects oversize payloads before the stream ends", async () => {
  const { readBody, PayloadTooLargeError, MAX_WEBHOOK_BODY_BYTES } = await load<ServerModule>("server.mjs");
  assert.equal(MAX_WEBHOOK_BODY_BYTES, 25 * 1024 * 1024);
  const stream = Readable.from([Buffer.alloc(10, 0x61), Buffer.alloc(10, 0x62)]);
  await assert.rejects(() => readBody(stream, 15), PayloadTooLargeError);
});

test("webhook server answers 413 when the body exceeds the configured limit", async () => {
  const { createWebhookServer } = await load<ServerModule>("server.mjs");
  const server = createWebhookServer({
    appId: "1",
    privateKeyPem: appKeyPem(),
    secret: "secret",
    maxBodyBytes: 32,
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const status = await new Promise<number>((resolveStatus, reject) => {
      const request = http.request(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path: "/webhook",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-github-event": "installation",
            "x-hub-signature-256": "sha256=00",
          },
        },
        (response) => {
          response.resume();
          response.on("end", () => resolveStatus(response.statusCode ?? 0));
        },
      );
      request.on("error", reject);
      request.write(Buffer.alloc(64, 0x61));
      request.end();
    });
    assert.equal(status, 413);
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
});

test("handleWebhook continues after one repository fails", async () => {
  const { handleWebhook } = await load<HandleModule>("handle-webhook.mjs");
  const { signBody } = await load<VerifyModule>("verify-signature.mjs");
  const rawBody = JSON.stringify({
    action: "created",
    installation: { id: 9 },
    repositories: [{ full_name: "acme/one" }, { full_name: "acme/two" }],
  });
  const opened: string[] = [];
  const { results } = await handleWebhook({
    rawBody,
    signature: signBody("secret", rawBody),
    eventName: "installation",
    secret: "secret",
    appId: "1",
    privateKeyPem: appKeyPem(),
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes("/app/installations") && !href.includes("/access_tokens")) {
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          async json() {
            return [{ id: 9 }];
          },
        };
      }
      assert.match(href, /\/app\/installations\/9\/access_tokens$/);
      return {
        ok: true,
        status: 201,
        headers: { get: () => null },
        async json() {
          return { token: "tok" };
        },
      };
    },
    openPullRequest: async ({ owner, repo }) => {
      if (repo === "one") throw new Error("simulated failure");
      opened.push(`${owner}/${repo}`);
      return { status: "opened", repository: `${owner}/${repo}`, pullRequestUrl: "https://example/pr/2" };
    },
  });
  assert.equal(results.length, 2);
  assert.equal(results[0]?.["status"], "failed");
  assert.equal(results[0]?.["repository"], "acme/one");
  assert.match(String(results[0]?.["reason"]), /simulated failure/);
  assert.equal(results[1]?.["status"], "opened");
  assert.equal(results[1]?.["repository"], "acme/two");
  assert.deepEqual(opened, ["acme/two"]);
});

test("commitFilesAndOpenPullRequest skips when evergreen/onboarding already exists", async () => {
  const { commitFilesAndOpenPullRequest, ensureBranch } = await load<CommitFilesModule>("commit-files.mjs");
  let updateRefCalls = 0;
  const github = {
    async listOpenPulls() {
      return [];
    },
    async getRefSha() {
      return "base-sha";
    },
    async getCommit() {
      return { tree: { sha: "base-tree" } };
    },
    async createBlob() {
      return "blob-sha";
    },
    async createTree() {
      return "tree-sha";
    },
    async createCommit() {
      return "commit-sha";
    },
    async createRef() {
      throw new Error("Reference already exists");
    },
    async updateRef() {
      updateRefCalls += 1;
      throw new Error("updateRef must not run");
    },
    async createPullRequest() {
      throw new Error("pull request must not open");
    },
  };
  const result = await commitFilesAndOpenPullRequest({
    github,
    owner: "acme",
    repo: "demo",
    baseBranch: "main",
    body: "body",
    files: { ".github/workflows/evergreen.yml": "name: Evergreen\n" },
  });
  assert.equal(result["status"], "skipped");
  assert.equal(result["reason"], "branch-exists");
  assert.equal(updateRefCalls, 0);

  const ensured = await ensureBranch(
    {
      async createRef() {
        throw new Error("GitHub POST /git/refs failed (422): Reference already exists");
      },
    },
    "acme",
    "demo",
    "commit-sha",
  );
  assert.deepEqual(ensured, { created: false, reason: "branch-exists" });
});
