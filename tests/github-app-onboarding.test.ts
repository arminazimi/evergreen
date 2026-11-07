import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

import { CONFIG_FILE_NAME } from "../src/config.js";
import { CI_WORKFLOW_FILE } from "../src/init.js";

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
  handleWebhook: (input: Record<string, unknown>) => Promise<{ results: unknown[] }>;
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

const root = resolve("integrations/github-app");

async function load<T>(file: string): Promise<T> {
  return (await import(pathToFileURL(resolve(root, file)).href)) as T;
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
  const { result, opened } = await replayInstallationWebhook();
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
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const rawBody = await readFile(resolve(root, "fixtures/installation.created.json"), "utf8");
  await assert.rejects(
    () =>
      handleWebhook({
        rawBody,
        signature: "sha256=00",
        eventName: "installation",
        secret: "secret",
        appId: "1",
        privateKeyPem,
        fetchImpl: async () => {
          throw new Error("fetch should not run");
        },
      }),
    WebhookUnauthorizedError,
  );
});
