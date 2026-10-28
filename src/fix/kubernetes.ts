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

function rewriteTarget(finding: Finding): ApiEdit | undefined {
  const match = DECLARATION.exec(finding.summary);
  if (!match) return undefined;
  const from = match[1]!;
  const parts = splitApiVersion(from);
  const to = parts && API_VERSIONS[`${parts.group}/${match[2]}`]?.[from];
  return to ? { from, to } : undefined;
}

interface ApiEdit {
  from: string;
  to: string;
}

interface Targets {
  lines: Map<number, ApiEdit>;
  findings: Finding[];
}

/** Rewrites the `apiVersion` of a removed API whose schema is unchanged; every other finding is left alone. */
export const kubernetesApiVersionFixer: Fixer = {
  id: "kubernetes",
  async plan(result, refuse) {
    const targets = new Map<string, Targets>();
    for (const finding of result.findings) {
      if (finding.detector !== "kubernetes") continue;
      if (finding.location.line === undefined) {
        refuse?.(finding, "The finding names no line to rewrite.");
        continue;
      }
      const edit = rewriteTarget(finding);
      if (!edit) {
        refuse?.(finding, refusedReason(finding));
        continue;
      }
      const entry: Targets = targets.get(finding.location.path) ?? { lines: new Map(), findings: [] };
      entry.lines.set(finding.location.line, edit);
      entry.findings.push(finding);
      targets.set(finding.location.path, entry);
    }

    const patches: FilePatch[] = [];
    for (const [path, { lines, findings }] of [...targets].sort(([a], [b]) => a.localeCompare(b))) {
      const decline = (reason: string) => {
        for (const finding of findings) refuse?.(finding, reason);
      };
      const absolute = resolve(result.root, path);
      const inside = relative(resolve(result.root), absolute);
      if (inside.startsWith("..") || isAbsolute(inside)) {
        decline("The path resolves outside the repository.");
        continue;
      }
      const before = await readFile(absolute, "utf8").catch(() => undefined);
      if (before === undefined) {
        decline("The manifest could not be read.");
        continue;
      }
      if (!before.endsWith("\n")) {
        decline("The manifest does not end with a newline.");
        continue;
      }
      const original = before.split("\n");
      const text = original.map((line, index) => {
        const edit = lines.get(index + 1);
        if (!edit) return line;
        const match = API_VERSION_LINE.exec(line);
        // The summary named the declaration; the line must still carry that exact value.
        return match && match[2] === edit.from ? `${match[1]}${edit.to}${match[3]}` : line;
      }).join("\n");
      if (text !== before) patches.push({ path, diff: renderDiff(path, before.slice(0, -1), text.slice(0, -1)) });
      const updated = text.split("\n");
      for (const finding of findings) {
        const index = finding.location.line! - 1;
        if (updated[index] !== original[index]) continue;
        const reason = lineRefusal(original[index] ?? "", lines.get(index + 1)!);
        if (reason !== undefined) refuse?.(finding, reason);
      }
    }
    return patches;
  },
};

/** Why the finding names no safe rewrite, decided from the finding itself. */
function refusedReason(finding: Finding): string {
  const match = DECLARATION.exec(finding.summary);
  if (!match) return "The finding does not name the declaration's API version.";
  const parts = splitApiVersion(match[1]!);
  if (!parts) return "The finding's API version could not be parsed.";
  return "The replacement needs a spec change, not only an `apiVersion` rewrite.";
}

/** Why the line was left as it is, or undefined when the line no longer carries the old value. */
function lineRefusal(line: string, edit: ApiEdit): string | undefined {
  const match = API_VERSION_LINE.exec(line);
  if (!match) return "The line is not an `apiVersion` declaration.";
  if (match[2] !== edit.from) return "The line no longer carries the API version the finding names.";
  return undefined;
}
