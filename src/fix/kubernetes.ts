import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { splitApiVersion } from "../detectors/kubernetes/api-version.js";
import type { Finding } from "../domain.js";
import type { FilePatch, Fixer } from "./index.js";

/**
 * The removed `apiVersion` values the Kubernetes deprecation guide moves with no schema change,
 * by group/kind: the new API holds the same object, so rewriting the line is the whole migration.
 * A removed API the guide gives notable changes for (a renamed, added, or reinterpreted field,
 * for example Ingress, PodDisruptionBudget, or the workloads moving to `apps/v1`) is absent here
 * and left alone; the scan keeps reporting it. Source:
 * https://kubernetes.io/docs/reference/using-api/deprecation-guide/
 */
const API_VERSIONS: Record<string, Record<string, string>> = {
  "apiregistration.k8s.io/APIService": { "apiregistration.k8s.io/v1beta1": "apiregistration.k8s.io/v1" },
  "authentication.k8s.io/TokenReview": { "authentication.k8s.io/v1beta1": "authentication.k8s.io/v1" },
  "batch/CronJob": { "batch/v1beta1": "batch/v1" },
  "coordination.k8s.io/Lease": { "coordination.k8s.io/v1beta1": "coordination.k8s.io/v1" },
  "extensions/NetworkPolicy": { "extensions/v1beta1": "networking.k8s.io/v1" },
  "flowcontrol.apiserver.k8s.io/FlowSchema": {
    "flowcontrol.apiserver.k8s.io/v1beta1": "flowcontrol.apiserver.k8s.io/v1",
    "flowcontrol.apiserver.k8s.io/v1beta2": "flowcontrol.apiserver.k8s.io/v1",
    "flowcontrol.apiserver.k8s.io/v1beta3": "flowcontrol.apiserver.k8s.io/v1",
  },
  "networking.k8s.io/IngressClass": { "networking.k8s.io/v1beta1": "networking.k8s.io/v1" },
  "node.k8s.io/RuntimeClass": { "node.k8s.io/v1beta1": "node.k8s.io/v1" },
  "rbac.authorization.k8s.io/ClusterRole": { "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" },
  "rbac.authorization.k8s.io/ClusterRoleBinding": { "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" },
  "rbac.authorization.k8s.io/Role": { "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" },
  "rbac.authorization.k8s.io/RoleBinding": { "rbac.authorization.k8s.io/v1beta1": "rbac.authorization.k8s.io/v1" },
  "scheduling.k8s.io/PriorityClass": { "scheduling.k8s.io/v1beta1": "scheduling.k8s.io/v1" },
  "storage.k8s.io/CSIDriver": { "storage.k8s.io/v1beta1": "storage.k8s.io/v1" },
  "storage.k8s.io/CSINode": { "storage.k8s.io/v1beta1": "storage.k8s.io/v1" },
  "storage.k8s.io/CSIStorageCapacity": { "storage.k8s.io/v1beta1": "storage.k8s.io/v1" },
  "storage.k8s.io/StorageClass": { "storage.k8s.io/v1beta1": "storage.k8s.io/v1" },
  "storage.k8s.io/VolumeAttachment": { "storage.k8s.io/v1beta1": "storage.k8s.io/v1" },
};

const API_VERSION_LINE = /^(\s*(?:-\s*)?apiVersion\s*:\s*["']?)([^\s#"']+)(.*)$/;
const DECLARATION = /^.* declares (\S+) (\S+)\. /;

function rewriteTarget(finding: Finding): { from: string; to: string } | undefined {
  const match = DECLARATION.exec(finding.summary);
  if (!match) return undefined;
  const from = match[1]!;
  const parts = splitApiVersion(from);
  const to = parts && API_VERSIONS[`${parts.group}/${match[2]}`]?.[from];
  return to ? { from, to } : undefined;
}

/** Rewrites the `apiVersion` of a removed API whose schema is unchanged; every other finding is left alone. */
export const kubernetesApiVersionFixer: Fixer = {
  id: "kubernetes",
  async plan(result) {
    const edits = new Map<string, Map<number, { from: string; to: string }>>();
    for (const finding of result.findings) {
      if (finding.detector !== "kubernetes" || finding.location.line === undefined) continue;
      const edit = rewriteTarget(finding);
      if (!edit) continue;
      const lines = edits.get(finding.location.path) ?? new Map();
      lines.set(finding.location.line, edit);
      edits.set(finding.location.path, lines);
    }

    const patches: FilePatch[] = [];
    for (const [path, lines] of [...edits].sort(([a], [b]) => a.localeCompare(b))) {
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) continue;
      const before = await readFile(absolute, "utf8");
      const text = before.split("\n").map((line, index) => {
        const edit = lines.get(index + 1);
        if (!edit) return line;
        const match = API_VERSION_LINE.exec(line);
        // The summary named the declaration; the line must still carry that exact value.
        return match && match[2] === edit.from ? `${match[1]}${edit.to}${match[3]}` : line;
      }).join("\n");
      // renderDiff treats the text after the last newline as a line; dropping the newline keeps git apply from seeing a phantom one.
      if (text !== before && before.endsWith("\n")) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
    }
    return patches;
  },
};
