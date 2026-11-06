import { getDataStatus } from "./data-status.js";
import {
  installedPackageRoot,
  RELEASE_MANIFEST_PATH,
  RELEASE_SIGNATURE_PATH,
  readPackageNameAndVersion,
  ReleaseManifestError,
  verifyReleaseManifest,
  verifyReleaseSignature,
} from "./release-manifest.js";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * What `evergreen verify` checked, and what it could not. The command never uses the network: the registry
 * signature, the npm provenance attestation, and the binary build attestations live outside the installed tree.
 */
export interface ReleaseVerification {
  root: string;
  name: string;
  version: string;
  files: {
    /** False when the installation carries no release manifest (a version released before manifests shipped). */
    checked: boolean;
    count: number;
    problems: string[];
  };
  signature: {
    /** False when the installation carries no Sigstore bundle for the manifest. */
    checked: boolean;
    identity: string | null;
    issuer: string | null;
    problems: string[];
  };
  data: {
    source: string;
    version: string;
    identity: string | null;
    issuer: string | null;
    note: string;
  };
  unchecked: readonly string[];
  ok: boolean;
}

export const UNCHECKED_OFFLINE: readonly string[] = [
  "the npm registry signature over the published tarball: run `npm audit signatures` (needs network)",
  "the npm provenance attestation: run `npm audit signatures --json`, or read `dist.attestations` from the registry (needs network)",
  "GitHub build attestations for a standalone binary: run `gh attestation verify <file> --repo arminazimi/evergreen` (needs network)",
];

/** The parts of the active-data status this report shows; `getDataStatus` returns them, tests can replace them. */
export interface DataReport {
  source: string;
  version: string;
  signer: { identity: string; issuer: string } | null;
}

export interface VerifyReleaseOptions {
  /** Replaces the active-data report. Only tests use this. */
  dataStatus?: () => Promise<DataReport>;
}

async function dataSection(readStatus: () => Promise<DataReport>): Promise<ReleaseVerification["data"]> {
  try {
    const status = await readStatus();
    const signerNote = status.signer
      ? `signed by ${status.signer.identity} (${status.signer.issuer})`
      : status.source === "bundled"
        ? "ships inside this package; covered by the files above and not separately signed"
        : "no signer was recorded";
    return {
      source: status.source,
      version: status.version,
      identity: status.signer?.identity ?? null,
      issuer: status.signer?.issuer ?? null,
      note: signerNote,
    };
  } catch (error) {
    return {
      source: "unavailable",
      version: "unknown",
      identity: null,
      issuer: null,
      note: `could not read the active lifecycle data (${errorMessage(error)})`,
    };
  }
}

/** Verifies the installed package, or the package rooted at `root`, as far as local files allow. */
export async function verifyInstalledRelease(
  root: string = installedPackageRoot(),
  options: VerifyReleaseOptions = {},
): Promise<ReleaseVerification> {
  const pkg = await readPackageNameAndVersion(root);
  let files: ReleaseVerification["files"];
  try {
    const manifest = await verifyReleaseManifest(root);
    files = manifest
      ? { checked: true, count: manifest.manifest.files.length, problems: manifest.problems }
      : { checked: false, count: 0, problems: [] };
  } catch (error) {
    if (!(error instanceof ReleaseManifestError)) throw error;
    files = { checked: true, count: 0, problems: [error.message] };
  }

  let signature: ReleaseVerification["signature"];
  try {
    const checked = await verifyReleaseSignature(root);
    signature = {
      checked: checked.checked,
      identity: checked.signer?.identity ?? null,
      issuer: checked.signer?.issuer ?? null,
      problems: checked.problems,
    };
  } catch (error) {
    signature = { checked: true, identity: null, issuer: null, problems: [errorMessage(error)] };
  }

  const problems = [...files.problems, ...signature.problems];
  return {
    root,
    name: pkg.name,
    version: pkg.version,
    files,
    signature,
    data: await dataSection(options.dataStatus ?? getDataStatus),
    unchecked: UNCHECKED_OFFLINE,
    ok: problems.length === 0,
  };
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export function renderReleaseVerification(result: ReleaseVerification): string {
  const lines = [
    "Evergreen release verification",
    `Install: ${result.name}@${result.version}`,
    `Location: ${result.root}`,
    result.files.checked
      ? `Files: ${plural(result.files.count, "file")} verified against ${RELEASE_MANIFEST_PATH}`
      : `Files: not checked: this installation has no ${RELEASE_MANIFEST_PATH} (the version predates release manifests)`,
    result.signature.checked
      ? `Signature: verified${result.signature.identity ? `, signed by ${result.signature.identity}` : ""}${result.signature.issuer ? ` (${result.signature.issuer})` : ""}`
      : `Signature: not checked: this installation has no ${RELEASE_SIGNATURE_PATH}`,
    `Lifecycle data: ${result.data.source} ${result.data.version} — ${result.data.note}`,
  ];
  for (const problem of [...result.files.problems, ...result.signature.problems]) lines.push(`Problem: ${problem}`);
  lines.push("", "Could not check offline (these need the network):");
  for (const item of result.unchecked) lines.push(`  - ${item}`);
  lines.push(
    "",
    result.ok
      ? result.files.checked
        ? `Result: all ${plural(result.files.count, "file")} match the release manifest. Authenticity is not established offline.`
        : "Result: nothing could be verified offline in this installation; see the commands above."
      : `Result: verification failed with ${plural(result.files.problems.length + result.signature.problems.length, "problem")}.`,
  );
  return lines.join("\n");
}
