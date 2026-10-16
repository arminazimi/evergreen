import { readFileSync } from "node:fs";

import { bundleFromJSON } from "@sigstore/bundle";
import { TrustedRoot } from "@sigstore/protobuf-specs";
import { toSignedEntity, toTrustMaterial, Verifier } from "@sigstore/verify";

import { DATA_SIGNER } from "./data-bundle.js";
import { findPackageFileSync } from "./package-files.js";

export class DataSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataSignatureError";
  }
}

export interface SignerPolicy {
  /** OIDC issuer the signing certificate must carry. */
  issuer: string;
  /** Regular expression the certificate's identity (the signing workflow's ref) must match. */
  identityPattern: string;
}

export interface VerifiedSigner {
  identity: string;
  issuer: string;
}

let bundledRoot: TrustedRoot | undefined;

/** The Sigstore public-good trusted root shipped with the package (`data/sigstore-trusted-root.json`). */
function bundledTrustedRoot(): TrustedRoot {
  bundledRoot ??= TrustedRoot.fromJSON(JSON.parse(readFileSync(findPackageFileSync("data/sigstore-trusted-root.json", import.meta.url), "utf8")));
  return bundledRoot;
}

/**
 * Verifies, offline, that `artifact` was signed by the signer the policy names. Checks the signature itself, the
 * certificate chain and validity against the trusted root, the transparency-log inclusion, and the certificate
 * identity and issuer. Anything else throws {@link DataSignatureError}; nothing is ever returned for a bundle that
 * did not verify.
 */
export function verifyArtifactSignature(
  artifact: Uint8Array,
  signatureJson: string,
  policy: SignerPolicy = DATA_SIGNER,
  trustedRoot: TrustedRoot = bundledTrustedRoot(),
): VerifiedSigner {
  let parsed: unknown;
  try {
    parsed = JSON.parse(signatureJson);
  } catch {
    throw new DataSignatureError("The signature file is not valid JSON.");
  }
  let entity;
  try {
    entity = toSignedEntity(bundleFromJSON(parsed), Buffer.from(artifact));
  } catch (error) {
    throw new DataSignatureError(`The signature file is not a Sigstore bundle: ${(error as Error).message}`);
  }
  try {
    const signer = new Verifier(toTrustMaterial(trustedRoot)).verify(entity, {
      subjectAlternativeName: new RegExp(policy.identityPattern),
      extensions: { issuer: policy.issuer },
    });
    return {
      identity: signer.identity?.subjectAlternativeName ?? "",
      issuer: signer.identity?.extensions?.issuer ?? "",
    };
  } catch (error) {
    throw new DataSignatureError(`The signature did not verify: ${(error as Error).message}`);
  }
}
