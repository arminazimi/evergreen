import { attributeValues, directBlocks, MAXIMUM_DECLARATIONS, prepareHcl } from "./hcl.js";

/**
 * Pure, bounded parser for managed Kubernetes control-plane versions in `*.tf` files.
 *
 * Reads, inside a top-level `resource` block of a supported type, the literal
 * `kubernetes_version` (AKS) or `min_master_version` (GKE), and inside a top-level
 * `module` block the `cluster_version` (EKS), `kubernetes_version` (AKS), or
 * `min_master_version` (GKE) input. The three attribute names are specific to those
 * managed offerings: the AWS provider calls the cluster version `version`, which is
 * not read here.
 *
 * A value that is a reference (`var.x`, `local.x`, `module.x.y`), an interpolation,
 * a call, or any other expression is returned with `literal` false so the detector
 * can report it as unclassified instead of guessing. Comments, strings that mention
 * an attribute, attributes of other resources and modules, and nested blocks are not
 * declarations. An unterminated string, comment, or heredoc makes the whole file
 * return nothing. The parser never evaluates HCL and never runs Terraform.
 */

export { MAXIMUM_INPUT_BYTES } from "./hcl.js";

/** The managed Kubernetes products the rules are written for. */
export type ManagedKubernetesProduct =
  | "amazon-eks"
  | "google-kubernetes-engine"
  | "azure-kubernetes-service";

/** The attribute each managed resource type uses for its control-plane version. */
const RESOURCE_ATTRIBUTES: Readonly<
  Record<string, Readonly<Record<string, ManagedKubernetesProduct>>>
> = {
  google_container_cluster: { min_master_version: "google-kubernetes-engine" },
  azurerm_kubernetes_cluster: { kubernetes_version: "azure-kubernetes-service" },
};

/**
 * The attribute each module input names. A module block is how the EKS community
 * module takes its cluster version, and the attribute names stay vendor-specific
 * inside a module, so each one maps to the same product there.
 */
const MODULE_ATTRIBUTES: Readonly<Record<string, ManagedKubernetesProduct>> = {
  cluster_version: "amazon-eks",
  min_master_version: "google-kubernetes-engine",
  kubernetes_version: "azure-kubernetes-service",
};

export interface ManagedKubernetesDeclaration {
  product: ManagedKubernetesProduct;
  /** The resource type, or `module` for a module block. */
  block: string;
  /** The resource or module name label. */
  name: string;
  /** The attribute name as written. */
  attribute: string;
  /** The literal version, or the expression when it is not a plain literal. */
  value: string;
  /** False when the value is not one plain string literal, so it cannot be judged. */
  literal: boolean;
  /** The 1-based line of the value. */
  line: number;
}

/** Parse managed Kubernetes control-plane versions from a `*.tf` file. */
export function parseManagedKubernetes(contents: string): ManagedKubernetesDeclaration[] {
  const hcl = prepareHcl(contents);
  if (!hcl) return [];

  const declarations: ManagedKubernetesDeclaration[] = [];
  for (const block of directBlocks(hcl, 0, hcl.masked.length)) {
    let blockType: string;
    let name: string;
    if (block.name === "resource") {
      const labels = /^\s*"([^"\n]+)"\s*"([^"\n]+)"\s*$/.exec(block.header);
      if (!labels) continue;
      blockType = labels[1]!;
      name = labels[2]!;
    } else if (block.name === "module") {
      const labels = /^\s*"([^"\n]+)"\s*$/.exec(block.header);
      if (!labels) continue;
      blockType = "module";
      name = labels[1]!;
    } else {
      continue;
    }

    const attributes =
      blockType === "module" ? MODULE_ATTRIBUTES : RESOURCE_ATTRIBUTES[blockType];
    if (!attributes) continue;

    for (const attribute of attributeValues(hcl, block.bodyStart, block.bodyEnd)) {
      const product = attributes[attribute.name];
      if (!product) continue;
      declarations.push({
        product,
        block: blockType,
        name,
        attribute: attribute.name,
        value: attribute.value,
        literal: attribute.literal,
        line: attribute.line,
      });
      if (declarations.length >= MAXIMUM_DECLARATIONS) return declarations;
    }
  }
  return declarations;
}
