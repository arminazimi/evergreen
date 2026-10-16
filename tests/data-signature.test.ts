import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { TrustedRoot } from "@sigstore/protobuf-specs";

import { DATA_SIGNER } from "../src/data-bundle.js";
import { DataSignatureError, verifyArtifactSignature } from "../src/data-signature.js";

const artifact = await readFile(resolve("tests/fixtures/sigstore/cosign_checksums.txt"));
const signature = await readFile(resolve("tests/fixtures/sigstore/cosign_checksums.txt.sigstore.json"), "utf8");

// The fixture is signed by cosign's own release identity, so it stands in for "a real, valid signature".
const cosign = { issuer: "https://accounts.google.com", identityPattern: "^keyless@projectsigstore\\.iam\\.gserviceaccount\\.com$" };

const refuses = (run: () => unknown, pattern: RegExp) =>
  assert.throws(run, (error: unknown) => error instanceof DataSignatureError && pattern.test(error.message));

test("a genuine keyless signature verifies offline against the bundled trusted root", () => {
  const signer = verifyArtifactSignature(artifact, signature, cosign);
  assert.equal(signer.identity, "keyless@projectsigstore.iam.gserviceaccount.com");
  assert.equal(signer.issuer, "https://accounts.google.com");
});

test("a valid signature from anyone but Evergreen's release workflow is refused", () => {
  refuses(() => verifyArtifactSignature(artifact, signature), /did not verify/);
  refuses(() => verifyArtifactSignature(artifact, signature, { ...cosign, issuer: DATA_SIGNER.issuer }), /did not verify/);
  refuses(() => verifyArtifactSignature(artifact, signature, { ...cosign, identityPattern: "^someone-else@example\\.com$" }), /did not verify/);
});

test("changing a single byte of the artifact fails closed", () => {
  for (const tampered of [Buffer.concat([artifact, Buffer.from("\n")]), Buffer.from(artifact.subarray(0, artifact.length - 1)), Buffer.from(artifact.toString("utf8").replace("cosign", "cosigm")), Buffer.alloc(0)]) {
    refuses(() => verifyArtifactSignature(tampered, signature, cosign), /did not verify/);
  }
});

test("a damaged or foreign signature file is refused with a clear reason", () => {
  refuses(() => verifyArtifactSignature(artifact, "not json", cosign), /not valid JSON/);
  refuses(() => verifyArtifactSignature(artifact, "", cosign), /not valid JSON/);
  refuses(() => verifyArtifactSignature(artifact, "{}", cosign), /not a Sigstore bundle/);
  refuses(() => verifyArtifactSignature(artifact, "[]", cosign), /not a Sigstore bundle/);
  const bundle = JSON.parse(signature) as { verificationMaterial: { tlogEntries?: unknown[] } };
  delete bundle.verificationMaterial.tlogEntries;
  refuses(() => verifyArtifactSignature(artifact, JSON.stringify(bundle), cosign), /not a Sigstore bundle|did not verify/);
  const wrongDigest = JSON.parse(signature) as { messageSignature: { signature: string } };
  wrongDigest.messageSignature.signature = Buffer.from("forged").toString("base64");
  refuses(() => verifyArtifactSignature(artifact, JSON.stringify(wrongDigest), cosign), /did not verify/);
});

test("a trusted root that knows none of the signing authorities refuses everything", () => {
  const empty = TrustedRoot.fromJSON({ mediaType: "application/vnd.dev.sigstore.trustedroot+json;version=0.1", tlogs: [], certificateAuthorities: [], ctlogs: [], timestampAuthorities: [] });
  refuses(() => verifyArtifactSignature(artifact, signature, cosign, empty), /did not verify/);
});

test("the bundled trusted root is the file whose hash is documented", async () => {
  const root = await readFile(resolve("data/sigstore-trusted-root.json"));
  const readme = await readFile(resolve("data/README.md"), "utf8");
  assert.ok(readme.includes(createHash("sha256").update(root).digest("hex")), "data/README.md must record the trusted root's SHA-256");
  const parsed = JSON.parse(root.toString("utf8")) as { tlogs: unknown[]; certificateAuthorities: unknown[]; ctlogs: unknown[] };
  assert.ok(parsed.tlogs.length > 0 && parsed.certificateAuthorities.length > 0 && parsed.ctlogs.length > 0);
});
