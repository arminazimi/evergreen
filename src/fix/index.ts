import type { Finding, ScanResult } from "../domain.js";
import { renameCodemodsFixer } from "./codemods/index.js";
import { nodeBufferFixer } from "./codemods/node-buffer.js";
import { dockerfileBaseImageFixer } from "./dockerfile.js";
import { githubActionsUsesFixer } from "./github-actions.js";
import { goModFixer } from "./go-mod.js";
import { javaFixer } from "./java.js";
import { kubernetesApiVersionFixer } from "./kubernetes.js";
import { runtimePinsFixer } from "./runtime-pins.js";
import { pythonFixer } from "./python.js";

/** The change one fixer proposes for one file, as a unified diff that `git apply` accepts. */
export interface FilePatch {
  path: string;
  diff: string;
}

/** One finding a fixer recognized as its own and left unchanged, with the reason it could not repair it. */
export interface FixRefusal {
  fixer: string;
  findingId: string;
  ruleId: string;
  path: string;
  line?: number;
  reason: string;
}

/** Receives each finding a fixer declines, so `fix --json` can report the refusal instead of dropping it silently. */
export type Refuse = (finding: Finding, reason: string) => void;

/**
 * A deterministic repair. It reads the findings of a scan and the files they point at, and returns patches. It never
 * writes a file, never runs a command, and never uses the network; a finding it cannot repair exactly is left alone and
 * reported through `refuse`.
 */
export interface Fixer {
  id: string;
  plan(result: ScanResult, refuse?: Refuse): Promise<FilePatch[]>;
}

/** A patch together with the fixer that produced it. */
export interface FixerPatch extends FilePatch {
  fixer: string;
}

/** What `fix` would do: the patches it would apply, and every finding a fixer declined to repair. */
export interface FixPlan {
  patches: FixerPatch[];
  refusals: FixRefusal[];
}

export { dockerfileBaseImageFixer, githubActionsUsesFixer, goModFixer, javaFixer, kubernetesApiVersionFixer, nodeBufferFixer, renameCodemodsFixer, runtimePinsFixer, pythonFixer };

/** Every fixer Evergreen ships, in the order their patches are printed. */
export const fixers: Fixer[] = [githubActionsUsesFixer, runtimePinsFixer, pythonFixer, goModFixer, javaFixer, kubernetesApiVersionFixer, dockerfileBaseImageFixer, renameCodemodsFixer, nodeBufferFixer];

/**
 * Plans every fixer over a scan and returns the patches with the fixer that produced them, ordered by file, along with
 * the findings each fixer declined and why. Both lists are deterministic.
 */
export async function planFixReport(result: ScanResult, available: Fixer[] = fixers): Promise<FixPlan> {
  const patches: FixerPatch[] = [];
  const refusals: FixRefusal[] = [];
  for (const fixer of available) {
    const refuse: Refuse = (finding, reason) => {
      refusals.push({
        fixer: fixer.id,
        findingId: finding.id,
        ruleId: finding.ruleId,
        path: finding.location.path,
        ...(finding.location.line === undefined ? {} : { line: finding.location.line }),
        reason,
      });
    };
    for (const patch of await fixer.plan(result, refuse)) patches.push({ ...patch, fixer: fixer.id });
  }
  patches.sort((a, b) => a.path.localeCompare(b.path));
  refusals.sort((a, b) =>
    a.path.localeCompare(b.path) || (a.line ?? 0) - (b.line ?? 0) || a.findingId.localeCompare(b.findingId) || a.fixer.localeCompare(b.fixer) || a.reason.localeCompare(b.reason));
  return { patches, refusals };
}

/** Plans every fixer over a scan and returns the patches ordered by file, then fixer. */
export async function planFixes(result: ScanResult, available: Fixer[] = fixers): Promise<FilePatch[]> {
  return (await planFixReport(result, available)).patches.map(({ path, diff }) => ({ path, diff }));
}

/** The text `fix` prints: the patches back to back, so the output pipes into `git apply`. */
export function renderPatches(patches: FilePatch[]): string {
  return patches.map((patch) => `${patch.diff}\n`).join("");
}
