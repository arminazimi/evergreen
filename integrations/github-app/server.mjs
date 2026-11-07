#!/usr/bin/env node
// Stateless HTTP server for the Evergreen onboarding GitHub App.
// Verifies webhook signatures, opens one `evergreen/onboarding` pull request per selected repo,
// and stores nothing about the repository beyond the in-flight request.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

import { handleWebhook, WebhookUnauthorizedError } from "./handle-webhook.mjs";

const REQUIRED_ENV = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_WEBHOOK_SECRET"];

/**
 * Maximum webhook body size. GitHub documents webhook payloads up to 25 MB
 * (https://docs.github.com/en/webhooks/webhook-events-and-payloads#delivery-headers);
 * we stop reading before HMAC so an oversized body cannot burn CPU on signature work.
 */
export const MAX_WEBHOOK_BODY_BYTES = 25 * 1024 * 1024;

export class PayloadTooLargeError extends Error {
  constructor() {
    super(`webhook body exceeds ${MAX_WEBHOOK_BODY_BYTES} byte limit`);
    this.name = "PayloadTooLargeError";
  }
}

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
    const rawBody = await readBody(request, config.maxBodyBytes ?? MAX_WEBHOOK_BODY_BYTES);
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
    if (error instanceof PayloadTooLargeError) {
      response.writeHead(413, { "content-type": "text/plain" });
      response.end("payload too large");
      return;
    }
    if (error instanceof WebhookUnauthorizedError) {
      response.writeHead(401, { "content-type": "text/plain" });
      response.end("unauthorized");
      return;
    }
    const detail = error instanceof Error ? error.message : String(error);
    process.stderr.write(`evergreen onboarding webhook error: ${detail}\n`);
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("internal error");
  }
}

function header(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Reads the request body up to {@link MAX_WEBHOOK_BODY_BYTES}. Rejects with
 * {@link PayloadTooLargeError} as soon as the limit is crossed, before the body is complete
 * and before any HMAC verification runs in the caller.
 */
export function readBody(request, limit = MAX_WEBHOOK_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        chunks.length = 0;
        // Keep the socket flowing so the caller can still write 413; do not destroy here.
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
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
