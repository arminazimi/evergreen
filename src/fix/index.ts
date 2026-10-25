import type { ScanResult } from "../domain.js";
import { githubActionsUsesFixer } from "./github-actions.js";
import { runtimePinsFixer } from "./runtime-pins.js";

/** The change one fixer proposes for one file, as a unified diff that `git apply` accepts. */
export interface FilePatch {
  path: string;
  diff: string;
}

/**
 * A deterministic repair. It reads the findings of a scan and the files they point at, and returns patches. It never
 * writes a file, never runs a command, and never uses the network; a finding it cannot repair exactly is left alone.
 */
export interface Fixer {
  id: string;
  plan(result: ScanResult): Promise<FilePatch[]>;
}

export { githubActionsUsesFixer, runtimePinsFixer };

/** Every fixer Evergreen ships, in the order their patches are printed. */
export const fixers: Fixer[] = [githubActionsUsesFixer, runtimePinsFixer];

/** Plans every fixer over a scan and returns the patches ordered by file, then fixer. */
export async function planFixes(result: ScanResult, available: Fixer[] = fixers): Promise<FilePatch[]> {
  const patches: FilePatch[] = [];
  for (const fixer of available) patches.push(...(await fixer.plan(result)));
  return patches.sort((a, b) => a.path.localeCompare(b.path));
}

/** The text `fix` prints: the patches back to back, so the output pipes into `git apply`. */
export function renderPatches(patches: FilePatch[]): string {
  return patches.map((patch) => `${patch.diff}\n`).join("");
}
