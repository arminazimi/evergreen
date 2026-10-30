/**
 * Reads `kubectl get <kinds> -A -o json` output: the images running in Pods and workload
 * controllers, and each object's live `apiVersion`, checked against the container and
 * Kubernetes lifecycle rules.
 *
 * The export is a Kubernetes `List`. For every item, `apiVersion` and `kind` map to
 * `pkg:generic/kubernetes/<group>/<Kind>` with the same API-version translation as the
 * Kubernetes detector. For the workload kinds, every `containers[].image` and
 * `initContainers[].image` in the pod template is parsed; a Docker Hub image maps to
 * `pkg:docker/<repository>`, where the container rules live. Images from other registries
 * are skipped rather than guessed: no rule covers them yet, and a private registry host can
 * carry an account id, which must never reach the output.
 *
 * A pointer resolves to the value the claim rests on: the `apiVersion` string for an API
 * item, the image reference for an image item. Nothing is resolved, pulled, or executed.
 */

import { parseImageReference } from "../detectors/container/parse-image.js";
import { isKind, ruleVersion, splitApiVersion } from "../detectors/kubernetes/api-version.js";
import type { InventoryImporter, InventoryItem } from "./types.js";

export const K8S_WORKLOADS_IMPORTER_ID = "k8s-workloads";

const PURL_PREFIX = "pkg:generic/kubernetes/";
const DOCKER_HUB = "docker.io";
const CLUSTER_SCOPE = "cluster";
const CONTAINER_FIELDS = ["containers", "initContainers"] as const;

/** Where each workload kind keeps its pod spec, as a path from the list item. */
const POD_SPEC_PATHS = new Map<string, readonly string[]>([
  ["Pod", ["spec"]],
  ["Deployment", ["spec", "template", "spec"]],
  ["StatefulSet", ["spec", "template", "spec"]],
  ["DaemonSet", ["spec", "template", "spec"]],
  ["ReplicaSet", ["spec", "template", "spec"]],
  ["Job", ["spec", "template", "spec"]],
  ["CronJob", ["spec", "jobTemplate", "spec", "template", "spec"]],
]);

/** A plain release number in a tag; anything else does not name a release line. */
const PLAIN_TAG = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The list items, or undefined when the document is not a workload export. */
function listItems(document: unknown): Record<string, unknown>[] | undefined {
  if (!isRecord(document) || document.kind !== "List" || !Array.isArray(document.items) || document.items.length === 0) return undefined;
  const items: Record<string, unknown>[] = [];
  for (const entry of document.items) {
    if (!isRecord(entry) || typeof entry.apiVersion !== "string" || typeof entry.kind !== "string" || !isRecord(entry.metadata)) return undefined;
    // Node lists belong to the cluster importer, which judges the kubelet's version.
    if (entry.kind === "Node") return undefined;
    items.push(entry);
  }
  return items;
}

function pointer(segments: readonly (string | number)[]): string {
  return segments.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/** `<namespace>/<kind>/<name>`; cluster-scoped objects have no namespace. */
function resourceOf(metadata: Record<string, unknown>, kind: string): string | undefined {
  const name = metadata.name;
  if (typeof name !== "string" || name.length === 0) return undefined;
  const namespace = typeof metadata.namespace === "string" && metadata.namespace.length > 0 ? metadata.namespace : CLUSTER_SCOPE;
  return `${namespace}/${kind}/${name}`;
}

function apiVersionItem(item: Record<string, unknown>, file: string, index: number, resource: string): InventoryItem | undefined {
  const kind = item.kind;
  const apiVersion = item.apiVersion;
  if (typeof kind !== "string" || typeof apiVersion !== "string" || !isKind(kind)) return undefined;
  const split = splitApiVersion(apiVersion);
  // The core group has no removed kinds in the Kubernetes migration guide.
  if (!split || split.group === "") return undefined;
  const version = ruleVersion(split.version);
  if (!version) return undefined;
  return {
    importer: K8S_WORKLOADS_IMPORTER_ID,
    file,
    pointer: pointer(["items", index, "apiVersion"]),
    resource,
    purl: `${PURL_PREFIX}${split.group}/${kind}`,
    version,
  };
}

/** The tag's release line, padded to three parts, or undefined for a floating or non-release tag. */
function imageVersion(tag: string | undefined): string | undefined {
  if (tag === undefined) return undefined;
  const match = PLAIN_TAG.exec(tag);
  if (!match) return undefined;
  return `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}`;
}

function dockerPurl(repository: string): string {
  return `pkg:docker/${repository}`;
}

/** The pod spec a workload keeps, following the same shape kubectl prints. */
function podSpec(item: Record<string, unknown>, path: readonly string[]): Record<string, unknown> | undefined {
  let value: unknown = item;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = value[key];
  }
  return isRecord(value) ? value : undefined;
}

interface ImageReference {
  value: string;
  pointer: string;
}

function imageReferences(spec: Record<string, unknown>, base: readonly (string | number)[]): ImageReference[] {
  const references: ImageReference[] = [];
  for (const field of CONTAINER_FIELDS) {
    const containers = spec[field];
    if (!Array.isArray(containers)) continue;
    containers.forEach((container, index) => {
      if (!isRecord(container) || typeof container.image !== "string" || container.image.length === 0) return;
      references.push({ value: container.image, pointer: pointer([...base, field, index, "image"]) });
    });
  }
  return references;
}

export const k8sWorkloadsImporter: InventoryImporter = {
  id: K8S_WORKLOADS_IMPORTER_ID,
  registries: ["container", "kubernetes"],
  detect(document) {
    return listItems(document) !== undefined;
  },
  items(document, file) {
    const list = listItems(document);
    if (!list) return [];
    const items: InventoryItem[] = [];
    list.forEach((item, index) => {
      const kind = item.kind;
      const metadata = item.metadata;
      if (typeof kind !== "string" || !isRecord(metadata)) return;
      const resource = resourceOf(metadata, kind);
      if (!resource) return;

      const api = apiVersionItem(item, file, index, resource);
      if (api) items.push(api);

      const path = POD_SPEC_PATHS.get(kind);
      if (!path) return;
      const spec = podSpec(item, path);
      if (!spec) return;
      const seen = new Set<string>();
      for (const reference of imageReferences(spec, ["items", index, ...path])) {
        if (seen.has(reference.value)) continue;
        const image = parseImageReference(reference.value);
        if (!image || image.registry !== DOCKER_HUB) continue;
        seen.add(reference.value);
        const version = imageVersion(image.tag);
        items.push({
          importer: K8S_WORKLOADS_IMPORTER_ID,
          file,
          pointer: reference.pointer,
          resource,
          purl: dockerPurl(image.repository),
          ...(version === undefined ? {} : { version }),
        });
      }
    });
    return items;
  },
};
