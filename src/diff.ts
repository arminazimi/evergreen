import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findingFingerprint } from "./baseline.js";
import type { Detector } from "./sdk.js";
import type { Finding } from "./domain.js";
import { scanRepository } from "./engine.js";

const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

export class DiffError extends Error {}

/** What a change did to the findings: the ones it added, the ones it removed, and how many it left alone. */
export interface DiffResult {
  schemaVersion: "evergreen.diff.v1";
  base: string;
  head: string;
  introduced: Finding[];
  fixed: Finding[];
  unchanged: number;
}

/** Splits `<base>..<head>`. Three dots and empty sides are refused: the comparison is always between two named refs. */
export function parseRange(range: string): { base: string; head: string } {
  const parts = range.split("..");
  const [base, head] = parts;
  if (parts.length !== 2 || !base || !head || head.startsWith(".") || base.endsWith(".")) {
    throw new DiffError(`"${range}" is not a range. Use <base>..<head>, for example main..HEAD.`);
  }
  return { base, head };
}

function git(root: string, args: string[], input?: Buffer): Buffer {
  try {
    return execFileSync("git", args, { cwd: root, input, maxBuffer: MAX_ARCHIVE_BYTES, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new DiffError(stderr || `git ${args[0]} failed.`);
  }
}

/** Writes a ref's tree into `directory` from git objects alone: no checkout, no network, the working tree untouched. */
function exportRef(root: string, ref: string, directory: string): void {
  if (ref.startsWith("-")) throw new DiffError(`"${ref}" is not a valid ref.`);
  const archive = git(root, ["archive", "--format=tar", ref, "--"]);
  const extracted = spawnSync("tar", ["-x", "-C", directory], { input: archive, stdio: ["pipe", "ignore", "pipe"], windowsHide: true });
  if (extracted.status !== 0) throw new DiffError(`Cannot unpack ${ref}: ${extracted.stderr?.toString().trim() || "tar failed"}.`);
}

async function scanRef(root: string, ref: string, detectors: readonly Detector[]): Promise<Finding[]> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-diff-"));
  try {
    exportRef(root, ref, directory);
    return (await scanRepository(directory, detectors)).findings;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function byFingerprint(findings: readonly Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    const key = findingFingerprint(finding);
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return groups;
}

/** Compares findings by fingerprint, so a finding that only moved to another line is not "new". */
export function compareFindings(base: readonly Finding[], head: readonly Finding[]): { introduced: Finding[]; fixed: Finding[]; unchanged: number } {
  const before = byFingerprint(base);
  const after = byFingerprint(head);
  const introduced: Finding[] = [];
  const fixed: Finding[] = [];
  let unchanged = 0;
  for (const [key, findings] of after) {
    const kept = Math.min(findings.length, before.get(key)?.length ?? 0);
    unchanged += kept;
    introduced.push(...findings.slice(kept));
  }
  for (const [key, findings] of before) fixed.push(...findings.slice(Math.min(findings.length, after.get(key)?.length ?? 0)));
  const order = (left: Finding, right: Finding): number => left.id.localeCompare(right.id);
  return { introduced: introduced.sort(order), fixed: fixed.sort(order), unchanged };
}

/** Scans `base` and `head` of the repository at `root` from git objects and reports what changed between them. */
export async function diffRefs(root: string, range: string, detectors: readonly Detector[]): Promise<DiffResult> {
  const { base, head } = parseRange(range);
  git(root, ["rev-parse", "--is-inside-work-tree"]);
  const [baseFindings, headFindings] = [await scanRef(root, base, detectors), await scanRef(root, head, detectors)];
  return { schemaVersion: "evergreen.diff.v1", base, head, ...compareFindings(baseFindings, headFindings) };
}

export function renderDiffText(result: DiffResult): string {
  const lines = [`Evergreen diff ${result.base}..${result.head}`, `Introduced: ${result.introduced.length}  Fixed: ${result.fixed.length}  Unchanged: ${result.unchanged}`];
  const section = (title: string, findings: Finding[]): void => {
    if (findings.length === 0) return;
    lines.push("", `${title}:`);
    for (const finding of findings) lines.push(`  [${finding.severity}] ${finding.summary} (${finding.location.path}${finding.location.line === undefined ? "" : `:${finding.location.line}`})`);
  };
  section("Introduced", result.introduced);
  section("Fixed", result.fixed);
  return lines.join("\n");
}
