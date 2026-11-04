import type { InventoryImporter, InventoryItem } from "./types.js";

/**
 * AWS EKS inventory importer.
 *
 * Reads the JSON output of `aws eks describe-cluster` and `aws eks describe-nodegroup`: one document each, or an
 * array of documents for a script that collects several outputs into one file. A cluster's `version` and a node
 * group's `version` name the EKS release line, which the EKS release-calendar rules judge; a node group's `amiType`
 * names the Amazon Linux release its nodes run, which is judged by the same `pkg:generic/amzn` rules as a host's
 * `/etc/os-release`. Exports are parsed only: no command is run, nothing is fetched, and an `arn`, `nodegroupArn`,
 * `roleArn`, `nodeRole`, `endpoint`, `resourcesVpcConfig`, or `subnets` value is never read or emitted.
 */

const IMPORTER_ID = "aws-eks";

/** The EKS release line, as the reviewed rules in `registry/kubernetes.json` and `registry/terraform.json` write it. */
const EKS = "pkg:generic/amazon-eks";

/** The Amazon Linux release line an EKS-optimized AMI is built on, shared with the os-release and node importers. */
const AMAZON_LINUX = "pkg:generic/amzn";

/** A release line as EKS writes it: `1.31` or `1.31.5`. A reference, a label, or an AMI build string is not one. */
const RELEASE = /^\d+\.\d+(?:\.\d+)?$/;

/**
 * The EKS-optimized Amazon Linux `amiType` values AWS publishes, each mapped to the Amazon Linux release line it
 * is built on. A Bottlerocket, Windows, or `CUSTOM` type is absent on purpose: no reviewed rule judges it, so the
 * node group is skipped rather than guessed.
 */
const AMI_TYPES = new Map<string, string>([
  ["AL2_x86_64", "2"],
  ["AL2_x86_64_GPU", "2"],
  ["AL2_ARM_64", "2"],
  ["AL2023_x86_64_STANDARD", "2023"],
  ["AL2023_ARM_64_STANDARD", "2023"],
  ["AL2023_x86_64_NEURON", "2023"],
  ["AL2023_x86_64_NVIDIA", "2023"],
  ["AL2023_ARM_64_NVIDIA", "2023"],
]);

type JsonObject = Record<string, unknown>;

/** One version this importer read, with the exact place in the export it came from. */
interface Claim {
  pointer: string;
  resource: string;
  purl: string;
  version: string;
}

/** One `{ "cluster": … }` or `{ "nodegroup": … }` document, with the pointer prefix its values sit under. */
interface Wrapper {
  entry: JsonObject;
  prefix: string;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/** The object under `cluster` or `nodegroup`, or undefined when the entry carries neither or names a non-object. */
function wrapped(entry: JsonObject, key: string): JsonObject | undefined {
  const value = entry[key];
  return isObject(value) ? value : undefined;
}

/** The value as a release line, or undefined when it is empty, not text, or not a plain Kubernetes version. */
function releaseLine(value: unknown): string | undefined {
  return isText(value) && RELEASE.test(value) ? value : undefined;
}

/** True when the entry is one of the two documents this importer reads. */
function isWrapper(entry: JsonObject): boolean {
  return wrapped(entry, "cluster") !== undefined || wrapped(entry, "nodegroup") !== undefined;
}

/** The wrappers of the document: one object, or a non-empty array in which every element is one. */
function wrappers(document: unknown): Wrapper[] {
  if (isObject(document)) return isWrapper(document) ? [{ entry: document, prefix: "" }] : [];
  if (!Array.isArray(document)) return [];
  const entries: JsonObject[] = [];
  for (const entry of document) {
    if (!isObject(entry) || !isWrapper(entry)) return [];
    entries.push(entry);
  }
  if (entries.length === 0) return [];
  return entries.map((entry, index) => ({ entry, prefix: `/${index}` }));
}

/** The cluster version, at `<prefix>/cluster/version`, named by the cluster's own name. */
function clusterClaims(cluster: JsonObject | undefined, prefix: string): Claim[] {
  if (cluster === undefined) return [];
  const resource = isText(cluster.name) ? cluster.name : undefined;
  const version = releaseLine(cluster.version);
  if (resource === undefined || version === undefined) return [];
  return [{ pointer: `${prefix}/cluster/version`, resource, purl: EKS, version }];
}

/**
 * The node group version and, when its `amiType` names an Amazon Linux EKS-optimized AMI, its Amazon Linux
 * release. `resource` is `<cluster>/<nodegroup>`; a node group whose export omits `clusterName` is named by its
 * own name alone. `releaseVersion` is an AMI build string, not a lifecycle version, so it is never read.
 */
function nodegroupClaims(nodegroup: JsonObject | undefined, prefix: string): Claim[] {
  if (nodegroup === undefined) return [];
  const name = isText(nodegroup.nodegroupName) ? nodegroup.nodegroupName : undefined;
  if (name === undefined) return [];
  const clusterName = isText(nodegroup.clusterName) ? nodegroup.clusterName : undefined;
  const resource = clusterName === undefined ? name : `${clusterName}/${name}`;
  const claims: Claim[] = [];
  const version = releaseLine(nodegroup.version);
  if (version !== undefined) claims.push({ pointer: `${prefix}/nodegroup/version`, resource, purl: EKS, version });
  const amiType = isText(nodegroup.amiType) ? AMI_TYPES.get(nodegroup.amiType) : undefined;
  if (amiType !== undefined)
    claims.push({ pointer: `${prefix}/nodegroup/amiType`, resource, purl: AMAZON_LINUX, version: amiType });
  return claims;
}

/** Every version the document names, in file order; a shape this importer does not know produces none. */
function claims(document: unknown): Claim[] {
  return wrappers(document).flatMap(({ entry, prefix }) => [
    ...clusterClaims(wrapped(entry, "cluster"), prefix),
    ...nodegroupClaims(wrapped(entry, "nodegroup"), prefix),
  ]);
}

export const eksImporter: InventoryImporter = {
  id: IMPORTER_ID,
  registries: ["container", "kubernetes"],

  detect(document: unknown): boolean {
    return claims(document).length > 0;
  },

  items(document: unknown, file: string): InventoryItem[] {
    return claims(document).map((claim) => ({ importer: IMPORTER_ID, file, ...claim }));
  },
};
