/**
 * Verifies the tree-sitter payloads under `src/usage/vendor/tree-sitter/` against the committed
 * `manifest.json`. The wasm files are stored as base64 text so no binary artifact is committed;
 * the payloads are decoded here only to hash them.
 *
 * Offline by design: this reads committed files and never fetches, so it can run in `npm run check`
 * and in a scanned repository. Run `node dist/tools/verify-tree-sitter-wasm.js [directory]`.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const VENDOR_DIRECTORY = resolve("src/usage/vendor/tree-sitter");
export const MANIFEST_FILE = "manifest.json";

/** One upstream WebAssembly module, stored as a committed base64 payload. */
export interface TreeSitterWasmFile {
  /** Committed payload name, for example `tree-sitter-python.wasm.b64`. */
  file: string;
  /** Path of the same file inside the upstream package, for example `tree-sitter-python.wasm`. */
  upstream: string;
  /** Decoded payload size in bytes. */
  bytes: number;
  /** Lowercase hex SHA-256 of the decoded payload. */
  sha256: string;
}

export interface TreeSitterWasmManifest {
  schemaVersion: string;
  package: string;
  version: string;
  /** Pinned upstream tarball; the source of every payload below. */
  source: string;
  license: string;
  files: TreeSitterWasmFile[];
}

export interface VerificationResult {
  manifest: TreeSitterWasmManifest;
  /** Human-readable mismatches; empty when the payloads match the manifest. */
  problems: string[];
}

/** Decodes a committed payload. Base64 decoders ignore the line breaks the sync tool writes. */
export function decodePayload(encoded: string): Uint8Array {
  return new Uint8Array(Buffer.from(encoded, "base64"));
}

/** Deterministic text form: base64 wrapped at 120 columns with a trailing newline. */
export function encodePayload(bytes: Uint8Array): string {
  const encoded = Buffer.from(bytes).toString("base64");
  const lines = encoded.match(/.{1,120}/g) ?? [];
  return `${lines.join("\n")}\n`;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWasmFile(value: unknown): value is TreeSitterWasmFile {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    value.file.endsWith(".wasm.b64") &&
    typeof value.upstream === "string" &&
    value.upstream.endsWith(".wasm") &&
    typeof value.bytes === "number" &&
    Number.isSafeInteger(value.bytes) &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  );
}

export async function readManifest(directory: string): Promise<TreeSitterWasmManifest> {
  const raw = JSON.parse(await readFile(join(directory, MANIFEST_FILE), "utf8")) as unknown;
  if (!isRecord(raw) || !Array.isArray(raw.files) || raw.files.length === 0) {
    throw new Error(`${MANIFEST_FILE} must name at least one payload.`);
  }
  if (
    raw.schemaVersion !== "evergreen.tree-sitter-wasm.v1" ||
    raw.package !== "@vscode/tree-sitter-wasm" ||
    typeof raw.version !== "string" ||
    typeof raw.source !== "string" ||
    typeof raw.license !== "string" ||
    !raw.files.every(isWasmFile)
  ) {
    throw new Error(`${MANIFEST_FILE} is not a valid evergreen.tree-sitter-wasm.v1 manifest.`);
  }
  return raw as unknown as TreeSitterWasmManifest;
}

/** Reads every payload, decodes it, and compares size and SHA-256 with the manifest. */
export async function verifyVendor(directory = VENDOR_DIRECTORY): Promise<VerificationResult> {
  const manifest = await readManifest(directory);
  const problems: string[] = [];
  const expected = new Set<string>();

  for (const file of manifest.files) {
    if (expected.has(file.file)) problems.push(`${file.file}: listed more than once in ${MANIFEST_FILE}`);
    expected.add(file.file);
    let bytes: Uint8Array;
    try {
      bytes = decodePayload(await readFile(join(directory, file.file), "utf8"));
    } catch (error) {
      problems.push(`${file.file}: cannot read payload (${(error as NodeJS.ErrnoException).code ?? String(error)})`);
      continue;
    }
    if (bytes.byteLength !== file.bytes) {
      problems.push(`${file.file}: decoded ${bytes.byteLength} bytes, manifest records ${file.bytes}`);
      continue;
    }
    const digest = sha256(bytes);
    if (digest !== file.sha256) problems.push(`${file.file}: sha256 ${digest}, manifest records ${file.sha256}`);
  }

  for (const entry of await readdir(directory)) {
    if (entry.endsWith(".wasm")) {
      problems.push(`${entry}: committed WebAssembly binary; store it as ${entry}.b64 instead`);
    } else if (entry.endsWith(".wasm.b64") && !expected.has(entry)) {
      problems.push(`${entry}: payload is not listed in ${MANIFEST_FILE}`);
    }
  }

  return { manifest, problems };
}

export async function main(argv: readonly string[]): Promise<number> {
  const directory = resolve(argv[0] ?? VENDOR_DIRECTORY);
  const { manifest, problems } = await verifyVendor(directory);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`tree-sitter vendor: ${problem}\n`);
    return 1;
  }
  process.stdout.write(
    `Verified ${manifest.files.length} tree-sitter payloads against ${MANIFEST_FILE} (${manifest.package}@${manifest.version}).\n`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${(error as Error).message}\n`);
      process.exit(2);
    },
  );
}
