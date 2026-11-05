/**
 * Reads `kubectl version -o json` and `kubectl get nodes -o json`: the cluster's control-plane
 * version, and each node's kubelet version, operating-system image, and container runtime,
 * checked against the upstream Kubernetes release rules and the host OS rules.
 *
 * The version export is the object that carries `serverVersion.gitVersion`; the node export is a
 * Kubernetes `List` of `Node` objects. Provider suffixes (`-eks-…`, `-gke.….…`, `+k3s1`) are
 * stripped from `gitVersion` and `kubeletVersion` so the upstream release line is judged; managed
 * providers run their own calendars, which the EKS, GKE, and AKS rule sets cover. An `osImage`
 * maps to the distribution's PURL when it names one the registry knows, and
 * `containerRuntimeVersion` maps to the runtime's PURL; both report `no-data` until a rule set
 * covers them.
 *
 * A pointer resolves to the value the claim rests on. `resource` is `control-plane` or the node's
 * own name; a node named by its IP address is skipped, because an IP address must never reach the
 * output. Nothing is resolved, pulled, or executed.
 */

import type { InventoryImporter, InventoryItem } from "./types.js";

export const K8S_CLUSTER_IMPORTER_ID = "k8s-cluster";

const KUBERNETES = "pkg:generic/kubernetes";

/** A release number with any provider or build suffix: `v1.30.4-gke.1` and `v1.31.5+k3s1` are `1.30.4` and `1.31.5`. */
const RELEASE = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/;

/** A node named by its address; such a name must never reach the output. */
const ADDRESS = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:.]*$/i;

/** The distributions an `osImage` can name, as their PURL segments. One without rules still reports, as `no-data`. */
const OS_IMAGES: readonly (readonly [RegExp, string])[] = [
  [/^Red Hat Enterprise Linux/, "rhel"],
  [/^SUSE Linux Enterprise Server/, "sles"],
  [/^AlmaLinux/, "almalinux"],
  [/^Amazon Linux/, "amzn"],
  [/^Alpine Linux/, "alpine"],
  [/^Bottlerocket/, "bottlerocket"],
  [/^CentOS/, "centos"],
  [/^Container-Optimized OS/, "cos"],
  [/^Debian/, "debian"],
  [/^Flatcar/, "flatcar"],
  [/^Rocky Linux/, "rocky"],
  [/^Ubuntu/, "ubuntu"],
];

/** The runtimes a `containerRuntimeVersion` names, as their PURL segments. */
const RUNTIMES = new Map([
  ["containerd", "containerd"],
  ["docker", "docker"],
  ["cri-o", "cri-o"],
  ["cri-dockerd", "cri-dockerd"],
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The upstream release a `gitVersion` or `kubeletVersion` names, or undefined when it names none. */
function releaseVersion(value: string): string | undefined {
  const match = RELEASE.exec(value.trim());
  return match ? `${match[1]}.${match[2]}.${match[3] ?? "0"}` : undefined;
}

/** The version an `osImage` names: an SP suffix for SLES, else the first release-shaped token. */
function osImageVersion(image: string): string | undefined {
  const sp = /SUSE Linux Enterprise Server (\d+)(?: SP(\d+))?/.exec(image);
  if (sp) return `${sp[1]}.${sp[2] ?? "0"}`;
  return /\d+(?:\.\d+)*/.exec(image)?.[0];
}

/** The version a runtime string names, or undefined when it is not a release number (`1.6.x`). */
function runtimeVersion(runtime: string): string | undefined {
  return /^\d+(?:\.\d+)*$/.test(runtime) ? runtime : undefined;
}

/** The version export's `serverVersion`, or undefined when the document is any other shape. */
function versionExport(document: unknown): Record<string, unknown> | undefined {
  if (!isRecord(document)) return undefined;
  const server = document.serverVersion;
  if (!isRecord(server)) return undefined;
  const gitVersion = server.gitVersion;
  return typeof gitVersion === "string" && gitVersion.trim() !== "" ? server : undefined;
}

/** The list's `Node` entries, or undefined when the document is not a node export. */
function nodeList(document: unknown): Record<string, unknown>[] | undefined {
  if (!isRecord(document) || document.kind !== "List" || !Array.isArray(document.items) || document.items.length === 0)
    return undefined;
  const nodes: Record<string, unknown>[] = [];
  for (const entry of document.items) {
    if (
      !isRecord(entry) ||
      entry.kind !== "Node" ||
      !isRecord(entry.metadata) ||
      !isRecord(entry.status) ||
      !isRecord(entry.status.nodeInfo)
    ) {
      return undefined;
    }
    nodes.push(entry);
  }
  return nodes;
}

function pointer(segments: readonly (string | number)[]): string {
  return segments.map((segment) => `/${String(segment).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

function controlPlaneItems(document: unknown, file: string): InventoryItem[] {
  const server = versionExport(document);
  if (!server) return [];
  const version = releaseVersion(String(server.gitVersion));
  if (!version) return [];
  return [
    {
      importer: K8S_CLUSTER_IMPORTER_ID,
      file,
      pointer: pointer(["serverVersion", "gitVersion"]),
      resource: "control-plane",
      purl: KUBERNETES,
      version,
    },
  ];
}

function nodeItems(document: unknown, file: string): InventoryItem[] {
  const nodes = nodeList(document);
  if (!nodes) return [];
  const items: InventoryItem[] = [];
  nodes.forEach((node, index) => {
    const metadata = node.metadata;
    const status = node.status;
    const nodeInfo = isRecord(status) ? status.nodeInfo : undefined;
    if (!isRecord(metadata) || !isRecord(nodeInfo)) return;
    const name = metadata.name;
    if (typeof name !== "string" || name.length === 0 || ADDRESS.test(name)) return;
    items.push(...nodeInfoItems(nodeInfo, name, index, file));
  });
  return items;
}

/** The item a node's `nodeInfo` supports for one field, or undefined when the field names nothing to judge. */
type NodeInfoItem = (
  nodeInfo: Record<string, unknown>,
  name: string,
  index: number,
  file: string,
) => InventoryItem | undefined;

function nodeInfoItems(nodeInfo: Record<string, unknown>, name: string, index: number, file: string): InventoryItem[] {
  return [kubeletItem, osImageItem, runtimeItem]
    .map((read) => read(nodeInfo, name, index, file))
    .filter((item): item is InventoryItem => item !== undefined);
}

/** The node's own item, pointing at the `nodeInfo` field the claim rests on. */
function nodeItem(
  index: number,
  field: "kubeletVersion" | "osImage" | "containerRuntimeVersion",
  name: string,
  file: string,
  purl: string,
  version: string | undefined,
): InventoryItem {
  return {
    importer: K8S_CLUSTER_IMPORTER_ID,
    file,
    pointer: pointer(["items", index, "status", "nodeInfo", field]),
    resource: name,
    purl,
    ...(version === undefined ? {} : { version }),
  };
}

/** The node's kubelet, as the upstream release its `kubeletVersion` names. */
const kubeletItem: NodeInfoItem = (nodeInfo, name, index, file) => {
  const kubelet = nodeInfo.kubeletVersion;
  const version = typeof kubelet === "string" ? releaseVersion(kubelet) : undefined;
  if (version === undefined) return undefined;
  return nodeItem(index, "kubeletVersion", name, file, KUBERNETES, version);
};

/** The node's operating system, as the distribution its `osImage` names and the version that image carries. */
const osImageItem: NodeInfoItem = (nodeInfo, name, index, file) => {
  const image = nodeInfo.osImage;
  if (typeof image !== "string" || image.trim() === "") return undefined;
  const distribution = OS_IMAGES.find(([pattern]) => pattern.test(image));
  if (distribution === undefined) return undefined;
  return nodeItem(index, "osImage", name, file, `pkg:generic/${distribution[1]}`, osImageVersion(image));
};

/** The node's container runtime, as the runtime its `containerRuntimeVersion` scheme names. */
const runtimeItem: NodeInfoItem = (nodeInfo, name, index, file) => {
  const runtime = nodeInfo.containerRuntimeVersion;
  if (typeof runtime !== "string") return undefined;
  const separator = runtime.indexOf("://");
  if (separator === -1) return undefined;
  const scheme = RUNTIMES.get(runtime.slice(0, separator));
  if (scheme === undefined) return undefined;
  return nodeItem(
    index,
    "containerRuntimeVersion",
    name,
    file,
    `pkg:generic/${scheme}`,
    runtimeVersion(runtime.slice(separator + 3)),
  );
};

export const k8sClusterImporter: InventoryImporter = {
  id: K8S_CLUSTER_IMPORTER_ID,
  registries: ["kubernetes", "container"],
  detect(document) {
    return versionExport(document) !== undefined || nodeList(document) !== undefined;
  },
  items(document, file) {
    return [...controlPlaneItems(document, file), ...nodeItems(document, file)];
  },
};
