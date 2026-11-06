import type { Finding, ScanResult } from "../domain.js";

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
