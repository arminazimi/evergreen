// Issues a short-lived RS256 JWT so the app can mint installation access tokens.
// No dependency: Node's crypto signs the compact JWT. The key never leaves process memory.

import { createPrivateKey, createSign } from "node:crypto";

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * GitHub App JWT: `iss` is the numeric app id, `iat` is skewed back 60s, `exp` at most 10 minutes out.
 * @param {{ appId: string | number, privateKeyPem: string, nowSeconds?: number }} input
 */
export function createAppJwt(input) {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64urlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: String(input.appId),
  });
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(createPrivateKey(input.privateKeyPem)).toString("base64url");
  return `${unsigned}.${signature}`;
}
