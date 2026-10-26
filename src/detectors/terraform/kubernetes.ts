import { attributeValues, directBlocks, MAXIMUM_DECLARATIONS, prepareHcl } from "./hcl.js";

/**
 * Pure, bounded parser for managed Kubernetes control-plane versions in `*.tf` files.
 *
 * Reads, inside a top-level `resource` block of a supported type, the literal
 * `kubernetes_version` (AKS) or `min_master_version` (GKE). Inside a top-level `module`
 * block it reads the same version attributes only when the module's `source` names a
 * known managed Kubernetes module, and judges them for that module's vendor:
 *
 * - `terraform-aws-modules/eks/aws` takes `cluster_version` and, from v21, `kubernetes_version`.
 * - `Azure/aks/azurerm` takes `kubernetes_version`.
 * - `terraform-google-modules/kubernetes-engine/google` takes `kubernetes_version` and `min_master_version`.
 *
 * A source may carry a `//submodule` path and a `?ref=` suffix, and the default
 * `registry.terraform.io/` host is accepted. A module whose source is missing, is not one
 * literal, or is not one of those addresses is not guessed: its version attributes are
 * returned without a product so the detector can report them as unclassified. The AWS
 * provider calls the cluster version `version`, which is not read here.
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

interface ManagedKubernetesModule {
  product: ManagedKubernetesProduct;
  /** The top-level input names this module takes, not attributes on its resources. */
  attributes: readonly string[];
}

/** Registry module addresses, without a host, submodule path, or ref, and the inputs each one takes. */
const MODULE_SOURCES: Readonly<Record<string, ManagedKubernetesModule>> = {
  "terraform-aws-modules/eks/aws": {
    product: "amazon-eks",
    attributes: ["cluster_version", "kubernetes_version"],
  },
  "azure/aks/azurerm": {
    product: "azure-kubernetes-service",
    attributes: ["kubernetes_version"],
  },
  "terraform-google-modules/kubernetes-engine/google": {
    product: "google-kubernetes-engine",
    attributes: ["kubernetes_version", "min_master_version"],
  },
};

/** The three attribute names a module may use for a control-plane version. */
const VERSION_ATTRIBUTES = new Set(["cluster_version", "kubernetes_version", "min_master_version"]);

/**
 * The registry address of a module source: no default registry host, no `//submodule`
 * path, and no `?ref=` or other query, lowercased so the case of the address does not
 * matter. A git, HTTP, or local path returns its own prefix and matches no known module.
 */
function moduleAddress(source: string): string {
  const withoutQuery = source.split("?")[0]!;
  const withoutSubmodule = withoutQuery.split("//")[0]!;
  return withoutSubmodule.replace(/^registry\.terraform\.io\//i, "").toLowerCase();
}

export interface ManagedKubernetesDeclaration {
  /** The managed product, or undefined when a module source is not a known managed Kubernetes module. */
  product?: ManagedKubernetesProduct;
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

    const attributes = attributeValues(hcl, block.bodyStart, block.bodyEnd);

    if (blockType === "module") {
      const source = attributes.find((attribute) => attribute.name === "source");
      const address = source?.literal ? moduleAddress(source.value) : undefined;
      const module = address !== undefined && Object.hasOwn(MODULE_SOURCES, address) ? MODULE_SOURCES[address] : undefined;
      for (const attribute of attributes) {
        if (module ? !module.attributes.includes(attribute.name) : !VERSION_ATTRIBUTES.has(attribute.name)) continue;
        declarations.push({
          ...(module === undefined ? {} : { product: module.product }),
          block: blockType,
          name,
          attribute: attribute.name,
          value: attribute.value,
          literal: attribute.literal,
          line: attribute.line,
        });
        if (declarations.length >= MAXIMUM_DECLARATIONS) return declarations;
      }
      continue;
    }

    const resourceAttributes = Object.hasOwn(RESOURCE_ATTRIBUTES, blockType) ? RESOURCE_ATTRIBUTES[blockType] : undefined;
    if (!resourceAttributes) continue;
    for (const attribute of attributes) {
      const product = Object.hasOwn(resourceAttributes, attribute.name) ? resourceAttributes[attribute.name] : undefined;
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
