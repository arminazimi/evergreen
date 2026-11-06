import type { FilePatch, FixPlan, Fixer, FixerPatch, FixRefusal, Refuse } from "./types.js";
import { workflowCommandsFixer } from "./codemods/workflow-commands.js";
import type { ScanResult } from "../domain.js";
import { dockerfileLegacyFixer } from "./codemods/dockerfile-legacy.js";
import { renameCodemodsFixer } from "./codemods/index.js";
import { kubernetesIngressV1Fixer } from "./codemods/k8s-ingress-v1.js";
import { nodeRenamesFixer } from "./codemods/node-renames.js";
import { pythonImpFixer } from "./codemods/python-imp.js";
import { pythonRenamesFixer } from "./codemods/python-renames.js";
import { terraformLegacyFixer } from "./codemods/terraform-legacy.js";
import { nodeBufferFixer } from "./codemods/node-buffer.js";
import { nodeUtilIsFixer } from "./codemods/node-util-is.js";
import { pythonUtcnowFixer } from "./codemods/python-utcnow.js";
import { dockerfileBaseImageFixer } from "./dockerfile.js";
import { githubActionsUsesFixer } from "./github-actions.js";
import { goModFixer } from "./go-mod.js";
import { javaFixer } from "./java.js";
import { kubernetesApiVersionFixer } from "./kubernetes.js";
import { runtimePinsFixer } from "./runtime-pins.js";
import { pythonFixer } from "./python.js";

export type { FilePatch, FixPlan, FixRefusal, Fixer, FixerPatch } from "./types.js";
export { renderPatches } from "./render-patches.js";

export {
  workflowCommandsFixer,
  dockerfileBaseImageFixer,
  githubActionsUsesFixer,
  goModFixer,
  javaFixer,
  kubernetesApiVersionFixer,
  kubernetesIngressV1Fixer,
  nodeBufferFixer,
  nodeUtilIsFixer,
  renameCodemodsFixer,
  runtimePinsFixer,
  pythonFixer,
  terraformLegacyFixer,
  pythonImpFixer,
  pythonRenamesFixer,
  pythonUtcnowFixer,
  nodeRenamesFixer,
  dockerfileLegacyFixer,
};

/** Every fixer Evergreen ships, in the order their patches are printed. */
export const fixers: Fixer[] = [
  workflowCommandsFixer,
  githubActionsUsesFixer,
  runtimePinsFixer,
  pythonFixer,
  goModFixer,
  javaFixer,
  kubernetesApiVersionFixer,
  kubernetesIngressV1Fixer,
  dockerfileBaseImageFixer,
  renameCodemodsFixer,
  nodeBufferFixer,
  terraformLegacyFixer,
  pythonImpFixer,
  pythonRenamesFixer,
  pythonUtcnowFixer,
  nodeRenamesFixer,
  dockerfileLegacyFixer,
  nodeUtilIsFixer,
];

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
  refusals.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      a.findingId.localeCompare(b.findingId) ||
      a.fixer.localeCompare(b.fixer) ||
      a.reason.localeCompare(b.reason),
  );
  return { patches, refusals };
}

/** Plans every fixer over a scan and returns the patches ordered by file, then fixer. */
export async function planFixes(result: ScanResult, available: Fixer[] = fixers): Promise<FilePatch[]> {
  return (await planFixReport(result, available)).patches.map(({ path, diff }) => ({ path, diff }));
}
