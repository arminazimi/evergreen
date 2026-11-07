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
  text?: () => Promise<string>;
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
  createGitHubClient: (options: { token: string; fetchImpl?: FetchStub }) => {
    getRepository: (owner: string, repo: string) => Promise<unknown>;
    getFileText: (owner: string, repo: string, path: string, ref?: string) => Promise<string | undefined>;
    getRefSha: (owner: string, repo: string, ref: string) => Promise<string>;
    getCommit: (owner: string, repo: string, sha: string) => Promise<unknown>;
    createBlob: (owner: string, repo: string, content: string) => Promise<string>;
    createTree: (
      owner: string,
      repo: string,
      baseTree: string,
      entries: Array<{ path: string; sha: string }>,
    ) => Promise<string>;
    createCommit: (
      owner: string,
      repo: string,
      input: { message: string; tree: string; parents: string[] },
    ) => Promise<string>;
    createRef: (owner: string, repo: string, ref: string, sha: string) => Promise<void>;
    updateRef: (owner: string, repo: string, ref: string, sha: string) => Promise<void>;
    listOpenPulls: (owner: string, repo: string, head: string) => Promise<unknown[]>;
    createPullRequest: (
      owner: string,
      repo: string,
      input: { title: string; body: string; head: string; base: string },
    ) => Promise<unknown>;
  };
  createInstallationToken: (input: {
    jwt: string;
    installationId: number | string;
    fetchImpl?: FetchStub;
  }) => Promise<string>;
  parseInstallationId: (value: unknown) => string;
  assertRepoName: (value: string, label: string) => string;
  nextInstallationsUrl: (header: string | null | undefined) => string | undefined;
}

interface OpenOnboardingModule {
  openOnboardingPullRequest: (input: {
    owner: string;
    repo: string;
    github: Record<string, (...args: unknown[]) => Promise<unknown>>;
    propose?: () => Promise<{ stacks: string[]; files: Record<string, string> }>;
  }) => Promise<Record<string, unknown>>;
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
      repositories: [{ full_name: "acme/demo" }, { full_name: "bad" }, { full_name: "acme/has space" }],
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
  assert.match(
    onboardingPullRequestBody({ repository: "acme/empty", stacks: [], files: [CI_WORKFLOW_FILE] }),
    /none detected/,
  );
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
  const broken = new Readable({
    read() {
      this.destroy(new Error("socket reset"));
    },
  });
  await assert.rejects(() => readBody(broken), /socket reset/);
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

test("parseInstallationId and assertRepoName reject unsafe values", async () => {
  const { parseInstallationId, assertRepoName } = await load<GitHubApiModule>("github-api.mjs");
  assert.equal(parseInstallationId("42"), "42");
  assert.throws(() => parseInstallationId("0"), /positive integer/);
  assert.throws(() => parseInstallationId("abc"), /positive integer/);
  assert.equal(assertRepoName("acme-app", "owner"), "acme-app");
  assert.throws(() => assertRepoName("../etc", "owner"), /invalid owner/);
});

test("createGitHubClient covers the REST helpers used to open a pull request", async () => {
  const { createGitHubClient } = await load<GitHubApiModule>("github-api.mjs");
  const calls: Array<{ method: string; url: string; body?: string }> = [];
  const fetchImpl: FetchStub = async (url, init) => {
    const request = (init ?? {}) as { method?: string; body?: string };
    const href = String(url);
    const entry: { method: string; url: string; body?: string } = {
      method: request.method ?? "GET",
      url: href,
    };
    if (typeof request.body === "string") entry.body = request.body;
    calls.push(entry);
    if (href.endsWith("/repos/acme/demo") && request.method === "GET") {
      return textResponse(200, { default_branch: "main" });
    }
    if (href.includes("/contents/README.md")) {
      return textResponse(200, {
        type: "file",
        content: Buffer.from("# Hi\n", "utf8").toString("base64"),
      });
    }
    if (href.includes("/contents/missing.txt")) {
      return textResponse(404, { message: "Not Found" });
    }
    if (href.includes("/git/ref/heads/main")) {
      return textResponse(200, { object: { sha: "base-sha" } });
    }
    if (href.includes("/git/commits/base-sha")) {
      return textResponse(200, { tree: { sha: "base-tree" } });
    }
    if (href.includes("/git/blobs") && request.method === "POST") {
      return textResponse(201, { sha: "blob-sha" });
    }
    if (href.includes("/git/trees") && request.method === "POST") {
      return textResponse(201, { sha: "tree-sha" });
    }
    if (href.includes("/git/commits") && request.method === "POST") {
      return textResponse(201, { sha: "commit-sha" });
    }
    if (href.includes("/git/refs") && request.method === "POST") {
      return textResponse(201, {});
    }
    if (href.includes("/git/refs/heads/evergreen/onboarding") && request.method === "PATCH") {
      return textResponse(200, {});
    }
    if (href.includes("/pulls?state=open")) {
      return textResponse(200, []);
    }
    if (href.endsWith("/pulls") && request.method === "POST") {
      return textResponse(201, { html_url: "https://github.com/acme/demo/pull/3", number: 3 });
    }
    if (href.includes("/boom")) {
      return textResponse(500, { message: "nope" });
    }
    throw new Error(`unexpected ${request.method} ${href}`);
  };
  const github = createGitHubClient({ token: "tok", fetchImpl });
  assert.deepEqual(await github.getRepository("acme", "demo"), { default_branch: "main" });
  assert.equal(await github.getFileText("acme", "demo", "README.md", "main"), "# Hi\n");
  assert.equal(await github.getFileText("acme", "demo", "missing.txt"), undefined);
  assert.equal(await github.getRefSha("acme", "demo", "heads/main"), "base-sha");
  assert.deepEqual(await github.getCommit("acme", "demo", "base-sha"), { tree: { sha: "base-tree" } });
  assert.equal(await github.createBlob("acme", "demo", "body"), "blob-sha");
  assert.equal(await github.createTree("acme", "demo", "base-tree", [{ path: "a.yml", sha: "blob-sha" }]), "tree-sha");
  assert.equal(
    await github.createCommit("acme", "demo", { message: "m", tree: "tree-sha", parents: ["base-sha"] }),
    "commit-sha",
  );
  await github.createRef("acme", "demo", "refs/heads/evergreen/onboarding", "commit-sha");
  await github.updateRef("acme", "demo", "heads/evergreen/onboarding", "commit-sha");
  assert.deepEqual(await github.listOpenPulls("acme", "demo", "acme:evergreen/onboarding"), []);
  assert.deepEqual(
    await github.createPullRequest("acme", "demo", {
      title: "t",
      body: "b",
      head: "evergreen/onboarding",
      base: "main",
    }),
    { html_url: "https://github.com/acme/demo/pull/3", number: 3 },
  );
  await assert.rejects(async () => {
    const bad = createGitHubClient({
      token: "tok",
      fetchImpl: async () => textResponse(500, { message: "nope" }),
    });
    await bad.getRepository("acme", "demo");
  }, /failed \(500\): nope/);
  assert.ok(calls.length >= 10);

  const emptyBody = createGitHubClient({
    token: "tok",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return "";
      },
      async json() {
        return undefined;
      },
    }),
  });
  assert.deepEqual(await emptyBody.listOpenPulls("acme", "demo", "acme:head"), []);

  const notFile = createGitHubClient({
    token: "tok",
    fetchImpl: async () =>
      textResponse(200, {
        type: "dir",
        content: undefined,
      }),
  });
  assert.equal(await notFile.getFileText("acme", "demo", "src"), undefined);

  const plainError = createGitHubClient({
    token: "tok",
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async text() {
        return "unavailable";
      },
      async json() {
        return undefined;
      },
    }),
  });
  await assert.rejects(() => plainError.getRepository("acme", "demo"), /unavailable/);
});

test("createInstallationToken fails when the installation is missing from every page", async () => {
  const { createInstallationToken } = await load<GitHubApiModule>("github-api.mjs");
  await assert.rejects(
    () =>
      createInstallationToken({
        jwt: "jwt",
        installationId: 99,
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          async json() {
            return [{ id: 1 }];
          },
        }),
      }),
    /not registered/,
  );
});

test("commitFilesAndOpenPullRequest skips when an onboarding pull request already exists", async () => {
  const { commitFilesAndOpenPullRequest } = await load<CommitFilesModule>("commit-files.mjs");
  const result = await commitFilesAndOpenPullRequest({
    github: {
      async listOpenPulls() {
        return [{ html_url: "https://github.com/acme/demo/pull/9" }];
      },
      async getRefSha() {
        throw new Error("should not run");
      },
      async createRef() {
        throw new Error("should not run");
      },
      async createPullRequest() {
        throw new Error("should not run");
      },
    },
    owner: "acme",
    repo: "demo",
    baseBranch: "main",
    body: "body",
    files: { a: "b" },
  });
  assert.equal(result["status"], "skipped");
  assert.equal(result["reason"], "pr-exists");
  assert.equal(result["pullRequestUrl"], "https://github.com/acme/demo/pull/9");
});

test("commitFilesAndOpenPullRequest opens when the branch is created", async () => {
  const { commitFilesAndOpenPullRequest } = await load<CommitFilesModule>("commit-files.mjs");
  const result = await commitFilesAndOpenPullRequest({
    github: {
      async listOpenPulls() {
        return [];
      },
      async getRefSha() {
        return "base";
      },
      async getCommit() {
        return { tree: { sha: "tree" } };
      },
      async createBlob() {
        return "blob";
      },
      async createTree() {
        return "new-tree";
      },
      async createCommit() {
        return "commit";
      },
      async createRef() {},
      async createPullRequest() {
        return { html_url: "https://github.com/acme/demo/pull/4", number: 4 };
      },
    },
    owner: "acme",
    repo: "demo",
    baseBranch: "main",
    body: "body",
    files: { ".evergreen.json": "{}\n" },
  });
  assert.equal(result["status"], "opened");
  assert.equal(result["number"], 4);
});

test("openOnboardingPullRequest skips repositories that already have the workflow", async () => {
  const { openOnboardingPullRequest } = await load<OpenOnboardingModule>("open-onboarding-pr.mjs");
  const result = await openOnboardingPullRequest({
    owner: "acme",
    repo: "demo",
    github: {
      async getFileText(_owner: unknown, _repo: unknown, path: unknown) {
        return path === ".github/workflows/evergreen.yml" ? "name: Evergreen\n" : undefined;
      },
      async getRepository() {
        throw new Error("should not run");
      },
    },
  });
  assert.equal(result["status"], "skipped");
  assert.equal(result["reason"], "already-onboarded");
});

test("openOnboardingPullRequest keeps a README that already contains the badge snippet", async () => {
  const { openOnboardingPullRequest } = await load<OpenOnboardingModule>("open-onboarding-pr.mjs");
  const badge = "![evergreen](https://example/badge)";
  const blobs: string[] = [];
  const result = await openOnboardingPullRequest({
    owner: "acme",
    repo: "demo",
    github: {
      async getFileText(_owner: unknown, _repo: unknown, path: unknown) {
        if (path === "README.md") return `# App\n\n${badge}`;
        return undefined;
      },
      async getRepository() {
        return { default_branch: "main" };
      },
      async listOpenPulls() {
        return [];
      },
      async getRefSha() {
        return "base";
      },
      async getCommit() {
        return { tree: { sha: "tree" } };
      },
      async createBlob(_o: unknown, _r: unknown, content: unknown) {
        blobs.push(String(content));
        return `blob-${blobs.length}`;
      },
      async createTree() {
        return "new-tree";
      },
      async createCommit() {
        return "commit";
      },
      async createRef() {},
      async createPullRequest(_o: unknown, _r: unknown, pull: unknown) {
        return { ...(pull as object), html_url: "https://github.com/acme/demo/pull/8", number: 8 };
      },
    },
    propose: async () => ({
      stacks: ["node"],
      files: {
        [CI_WORKFLOW_FILE]: "name: Evergreen\n",
        [CONFIG_FILE_NAME]: '{ "schemaVersion": "evergreen.config.v1" }\n',
        "README.badge.md": badge,
      },
    }),
  });
  assert.equal(result["status"], "opened");
  assert.ok(blobs.some((content) => content.includes(badge) && content.endsWith("\n")));
});

test("webhook server answers healthz, 404, and 401", async () => {
  const { createWebhookServer } = await load<ServerModule>("server.mjs");
  const server = createWebhookServer({
    appId: "1",
    privateKeyPem: appKeyPem(),
    secret: "secret",
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    assert.equal(await httpStatus(address.port, "GET", "/healthz"), 200);
    assert.equal(await httpStatus(address.port, "GET", "/webhook"), 404);
    assert.equal(
      await httpStatus(address.port, "POST", "/webhook", {
        body: "{}",
        headers: {
          "content-type": "application/json",
          "x-github-event": "installation",
          "x-hub-signature-256": "sha256=00",
        },
      }),
      401,
    );
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
});

function textResponse(
  status: number,
  body: unknown,
): {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
} {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    async text() {
      return text;
    },
    async json() {
      return body;
    },
  };
}

async function httpStatus(
  port: number,
  method: string,
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<number> {
  const { status } = await httpExchange(port, method, path, options);
  return status;
}

async function httpExchange(
  port: number,
  method: string,
  path: string,
  options: { body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

test("runReplayCli prints ok for a successful local replay", async () => {
  const { runReplayCli } = (await load("replay.mjs")) as {
    runReplayCli: () => Promise<void>;
  };
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await runReplayCli();
  } finally {
    process.stdout.write = original;
  }
  assert.match(chunks.join(""), /"ok": true/);
});

test("runReplayCli fails when the replay does not open a pull request", async () => {
  const { runReplayCli } = (await load("replay.mjs")) as {
    runReplayCli: (replay?: () => Promise<unknown>) => Promise<void>;
  };
  const previous = process.exitCode;
  process.exitCode = 0;
  try {
    await runReplayCli(async () => ({
      result: { results: [{ status: "skipped", reason: "already-onboarded" }] },
      opened: undefined,
    }));
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previous;
  }
});

test("readConfig requires the GitHub App environment and accepts escaped PEM newlines", async () => {
  const { readConfig } = (await load("server.mjs")) as {
    readConfig: (env?: NodeJS.ProcessEnv) => {
      appId: string;
      privateKeyPem: string;
      secret: string;
      port: number;
    };
  };
  assert.throws(() => readConfig({}), /GITHUB_APP_ID/);
  const config = readConfig({
    GITHUB_APP_ID: "9",
    GITHUB_APP_PRIVATE_KEY: "line1\\nline2",
    GITHUB_WEBHOOK_SECRET: "secret",
    PORT: "4123",
  });
  assert.equal(config.appId, "9");
  assert.equal(config.privateKeyPem, "line1\nline2");
  assert.equal(config.secret, "secret");
  assert.equal(config.port, 4123);
});

test("webhook server answers 200 for a signed delivery with no repositories", async () => {
  const { createWebhookServer } = await load<ServerModule>("server.mjs");
  const { signBody } = await load<VerifyModule>("verify-signature.mjs");
  const rawBody = JSON.stringify({ action: "deleted", installation: { id: 1 }, repositories: [] });
  const server = createWebhookServer({
    appId: "1",
    privateKeyPem: appKeyPem(),
    secret: "secret",
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const { status, body } = await httpExchange(address.port, "POST", "/webhook", {
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "x-github-event": "installation",
        "x-hub-signature-256": signBody("secret", rawBody),
      },
    });
    assert.equal(status, 200);
    assert.deepEqual(JSON.parse(body), { results: [] });
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
});

test("webhook server answers 500 when handling throws after a valid signature", async () => {
  const { createWebhookServer } = await load<ServerModule>("server.mjs");
  const { signBody } = await load<VerifyModule>("verify-signature.mjs");
  const rawBody = JSON.stringify({
    action: "created",
    installation: {},
    repositories: [{ full_name: "acme/demo" }],
  });
  const server = createWebhookServer({
    appId: "1",
    privateKeyPem: appKeyPem(),
    secret: "secret",
  });
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    assert.equal(
      await httpStatus(address.port, "POST", "/webhook", {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          "x-github-event": "installation",
          "x-hub-signature-256": signBody("secret", rawBody),
        },
      }),
      500,
    );
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error ? reject(error) : resolveClose()));
    });
  }
});

test("createInstallationToken rejects a failed list page and a failed token response", async () => {
  const { createInstallationToken, nextInstallationsUrl } = await load<GitHubApiModule>("github-api.mjs");
  assert.equal(nextInstallationsUrl('<not a url>; rel="next"'), undefined);
  await assert.rejects(
    () =>
      createInstallationToken({
        jwt: "jwt",
        installationId: 1,
        fetchImpl: async () => ({
          ok: false,
          status: 500,
          headers: { get: () => null },
          async json() {
            return { message: "boom" };
          },
        }),
      }),
    /list installations failed/,
  );
  await assert.rejects(
    () =>
      createInstallationToken({
        jwt: "jwt",
        installationId: 1,
        fetchImpl: async (url) => {
          if (String(url).includes("/access_tokens")) {
            return {
              ok: false,
              status: 401,
              headers: { get: () => null },
              async json() {
                return { message: "bad credentials" };
              },
            };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            async json() {
              return [{ id: 1 }];
            },
          };
        },
      }),
    /installation token failed/,
  );
});

test("openOnboardingPullRequest rejects a proposal that omits the workflow", async () => {
  const { openOnboardingPullRequest } = await load<OpenOnboardingModule>("open-onboarding-pr.mjs");
  await assert.rejects(
    () =>
      openOnboardingPullRequest({
        owner: "acme",
        repo: "demo",
        github: {
          async getFileText() {
            return undefined;
          },
          async getRepository() {
            return { default_branch: "main" };
          },
        },
        propose: async () => ({ stacks: [], files: { "README.badge.md": "badge" } }),
      }),
    /missing workflow or config/,
  );
});

test("ensureBranch rethrows unexpected createRef failures", async () => {
  const { ensureBranch } = await load<CommitFilesModule>("commit-files.mjs");
  await assert.rejects(
    () =>
      ensureBranch(
        {
          async createRef() {
            throw new Error("GitHub POST failed (500): boom");
          },
        },
        "acme",
        "demo",
        "sha",
      ),
    /500/,
  );
});

test("runReplayCli fails on unexpected pull request shape and file list", async () => {
  const { runReplayCli } = (await load("replay.mjs")) as {
    runReplayCli: (replay?: () => Promise<unknown>) => Promise<void>;
  };
  const { ONBOARDING_BRANCH, ONBOARDING_PULL_REQUEST_TITLE } = await load<PrBodyModule>("pr-body.mjs");
  const previous = process.exitCode;
  process.exitCode = 0;
  try {
    await runReplayCli(async () => ({
      result: {
        results: [{ status: "opened", files: [CI_WORKFLOW_FILE, "README.md"], pullRequestUrl: "u" }],
      },
      opened: { head: "wrong", title: ONBOARDING_PULL_REQUEST_TITLE, blobContents: {} },
    }));
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    await runReplayCli(async () => ({
      result: {
        results: [{ status: "opened", files: [CI_WORKFLOW_FILE, "README.md"], pullRequestUrl: "u" }],
      },
      opened: {
        head: ONBOARDING_BRANCH,
        title: ONBOARDING_PULL_REQUEST_TITLE,
        blobContents: { a: "name: Evergreen\nevergreen.config.v1" },
      },
    }));
    assert.equal(process.exitCode, 0);
    process.exitCode = 0;
    await runReplayCli(async () => ({
      result: { results: [{ status: "opened", files: ["only.txt"], pullRequestUrl: "u" }] },
      opened: {
        head: ONBOARDING_BRANCH,
        title: ONBOARDING_PULL_REQUEST_TITLE,
        blobContents: { a: "name: Evergreen\nevergreen.config.v1" },
      },
    }));
    assert.equal(process.exitCode, 1);
    process.exitCode = 0;
    await runReplayCli(async () => ({
      result: {
        results: [{ status: "opened", files: [CI_WORKFLOW_FILE, "README.md"], pullRequestUrl: "u" }],
      },
      opened: {
        head: ONBOARDING_BRANCH,
        title: ONBOARDING_PULL_REQUEST_TITLE,
        blobContents: { a: "no evergreen markers" },
      },
    }));
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previous;
  }
});
