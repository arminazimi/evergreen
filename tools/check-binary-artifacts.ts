// Fails when a tracked file under `src/` or `tests/` is binary, so a generated or vendored
// artifact cannot land again (OpenSSF Scorecard Binary-Artifacts, issue #2287).
//
// Git's own test decides what binary means: a NUL byte in the first 8,000 bytes. A file that
// contains one cannot be reviewed in a diff. A few malformed-input fixtures must contain a literal
// NUL to exercise a parser; those are listed one by one and the check fails when one of them stops
// being binary, so an exemption cannot outlive its reason.
//
// Only tracked files are read: an untracked build output in the working tree is not repository
// content. The tool runs `git ls-files`, reads the listed files, never executes repository code,
// and never uses the network.
//
//   node dist/tools/check-binary-artifacts.js

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Directories the repository keeps hand-written source and test inputs in. */
export const SCANNED_DIRECTORIES: readonly string[] = ["src", "tests"];

/** Git reads this many bytes of a file to decide whether it is binary. */
export const SNIFF_BYTES = 8000;

/**
 * Malformed text inputs that must contain a literal NUL byte, because the parser under test has to
 * reject the malformed input rather than stop at the first NUL. Each path stays a text fixture: it
 * is reviewed and changed like any other test input, and no other file may use this exemption.
 */
export const MALFORMED_INPUT_FIXTURES: readonly string[] = [
  "tests/fixtures/java/malformed/gradle/gradle/wrapper/gradle-wrapper.properties",
  "tests/fixtures/java/malformed/pins/.java-version",
  "tests/fixtures/kubernetes/malformed/manifests/nul-byte.yaml",
];

export interface BinaryFinding {
  path: string;
  message: string;
}

export interface BinaryCheck {
  /** Tracked files read under the scanned directories. */
  scanned: number;
  /** Binary files to remove, and exemptions that no longer apply. */
  findings: BinaryFinding[];
}

/** Git's test: a NUL byte within the sniffed prefix means binary. */
export function hasNulByte(bytes: Uint8Array, limit = SNIFF_BYTES): boolean {
  const end = Math.min(bytes.byteLength, limit);
  for (let index = 0; index < end; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

/** Repository-relative paths git tracks under `directories`, sorted for a stable report. */
export function trackedFiles(root: string, directories: readonly string[] = SCANNED_DIRECTORIES): string[] {
  const listed = execFileSync("git", ["ls-files", "-z", "--", ...directories], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  return listed
    .toString("utf8")
    .split("\0")
    .filter((path) => path.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Reads every tracked file under `directories` and reports the binary ones. A listed exemption is
 * checked both ways, so deleting or rewriting the malformed input it protects fails the check.
 */
export async function checkBinaryArtifacts(
  root = process.cwd(),
  options: {
    directories?: readonly string[];
    exempt?: readonly string[];
  } = {},
): Promise<BinaryCheck> {
  const directories = options.directories ?? SCANNED_DIRECTORIES;
  const exempt = new Set(options.exempt ?? MALFORMED_INPUT_FIXTURES);
  const files = trackedFiles(root, directories);
  const tracked = new Set(files);
  const findings: BinaryFinding[] = [];
  const binary = new Set<string>();

  for (const path of files) {
    const bytes = await readFile(resolve(root, path));
    if (!hasNulByte(bytes)) continue;
    binary.add(path);
    if (!exempt.has(path)) {
      findings.push({ path, message: "binary artifact in the repository; commit a text form instead" });
    }
  }

  for (const path of exempt) {
    if (!tracked.has(path)) {
      findings.push({ path, message: "exemption is stale: the file is no longer tracked" });
    } else if (!binary.has(path)) {
      findings.push({ path, message: "exemption is stale: the file no longer contains a NUL byte" });
    }
  }

  findings.sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message));
  return { scanned: files.length, findings };
}

export function renderCheck(check: BinaryCheck): string {
  const lines = [`Scanned ${check.scanned} tracked files under ${SCANNED_DIRECTORIES.join(" and ")}.`];
  if (check.findings.length === 0) {
    lines.push(`No binary artifacts; ${MALFORMED_INPUT_FIXTURES.length} malformed-input fixtures stay exempt.`);
    return `${lines.join("\n")}\n`;
  }
  for (const finding of check.findings) lines.push(`::error::${finding.path}: ${finding.message}`);
  lines.push(`${check.findings.length} binary-artifact finding(s). See issue #2287.`);
  return `${lines.join("\n")}\n`;
}

export async function main(): Promise<number> {
  const check = await checkBinaryArtifacts();
  process.stdout.write(renderCheck(check));
  return check.findings.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
