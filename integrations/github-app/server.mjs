#!/usr/bin/env node
// Stateless HTTP server for the Evergreen onboarding GitHub App.
// Verifies webhook signatures, opens one `evergreen/onboarding` pull request per selected repo,
// and stores nothing about the repository beyond the in-flight request.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { handleWebhook, WebhookUnauthorizedError } from "./handle-webhook.mjs";

const REQUIRED_ENV = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"];

function readConfig(env = process.env) {
  for (const key of REQUIRED_ENV) {
    if (!env[key]) throw new Error(`missing required environment variable ${key}`);
  }
  return {
    appId: env.GITHUB_APP_ID,
    privateKeyPem: env.GITHUB_APP_PRIVATE_KEY.replaceAll("\\n", "\n"),
    secret: env.GITHUB_WEBHOOK_SECRET,
    port: Number(env.PORT ?? "3000"),
  };
}

export function createWebhookServer(config) {
  return createServer((request, response) => {
    void handleRequest(request, response, config);
  });
}

async function handleRequest(request, response, config) {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.method !== "POST" || request.url !== "/webhook") {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }

  try {
    const rawBody = await readBody(request);
    const result = await handleWebhook({
      rawBody,
      signature: header(request, "x-hub-signature-256"),
      eventName: header(request, "x-github-event") ?? "",
      secret: config.secret,
      appId: config.appId,
      privateKeyPem: config.privateKeyPem,
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof WebhookUnauthorizedError) {
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("unauthorized");
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    response.writeHead(500, { "content-type": "text/plain" });
    response.end(message);
  }
}

function header(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig();
  const server = createWebhookServer(config);
  server.listen(config.port, () => {
    process.stdout.write(`evergreen onboarding app listening on :${config.port}\n`);
  });
}

export { readConfig };
