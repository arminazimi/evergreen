// Verifies GitHub webhook deliveries with HMAC-SHA256 (X-Hub-Signature-256).
// Uses a timing-safe compare so a forged signature cannot be probed by latency.

import { createHmac, timingSafeEqual } from "node:crypto";

/** `sha256=<hex>` for the raw body, matching GitHub's X-Hub-Signature-256 format. */
export function signBody(secret, rawBody) {
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return `sha256=${digest}`;
}

/**
 * Returns true when `signatureHeader` matches the HMAC of `rawBody` under `secret`.
 * False for missing headers, wrong length, or a mismatch — never throws on bad input.
 */
export function verifySignature(secret, signatureHeader, rawBody) {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof signatureHeader !== "string" || signatureHeader.length === 0) return false;
  const expected = signBody(secret, rawBody);
  const left = Buffer.from(signatureHeader);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
