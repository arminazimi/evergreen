import type { InventoryImporter, InventoryItem } from "./types.js";

/**
 * Terraform state importer.
 *
 * Reads `terraform show -json` state output (`format_version` and `values.root_module`) and raw
 * `terraform.tfstate` version 4 files (`version` and `resources`). Every module and resource
 * instance is walked, but only the attributes below are read: Lambda runtimes, RDS, Aurora, and
 * ElastiCache engines and versions, EKS, GKE, and AKS control-plane versions, Cloud Functions
 * runtimes, and Linux Function App stacks. ARNs, ids, endpoints, environment values, and every
 * other field are never copied into an item. Nothing runs Terraform or calls a provider.
 */

const IMPORTER_ID = "terraform-state";

const AWS_LAMBDA_RUNTIME = "pkg:generic/aws-lambda-runtime/";
const GOOGLE_FUNCTIONS_RUNTIME = "pkg:generic/google-cloud-functions-runtime/";
const AZURE_APP_SERVICE = "pkg:generic/azure-app-service/";
const AMAZON_EKS = "pkg:generic/amazon-eks";
const GOOGLE_GKE = "pkg:generic/google-gke";
const AZURE_AKS = "pkg:generic/azure-aks";

const RUNTIME_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GCP_RUNTIME_ID = /^[a-z0-9][a-z0-9._-]*$/;
// A `+` starts each later suffix and is not in the body class, so the repetition is
// unambiguous; a suffix group that also accepts `-` backtracks exponentially on a run of
// `-` characters (`js/redos`).
const RELEASE_VERSION = /^\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+(?:\+[0-9A-Za-z.-]+)*)?$/;
const STACK_VERSION = /^\d+(?:\.\d+){0,2}$/;

interface EngineTarget {
  provider: string;
  upstream?: string;
}

/** The engines the AWS RDS importer maps, so a deployed engine reports the same PURLs. */
const ENGINES: Record<string, EngineTarget> = {
  postgres: { provider: "pkg:generic/aws-rds/postgres", upstream: "pkg:generic/postgresql" },
  mysql: { provider: "pkg:generic/aws-rds/mysql", upstream: "pkg:generic/mysql" },
  "aurora-postgresql": { provider: "pkg:generic/aws-aurora/postgresql", upstream: "pkg:generic/postgresql" },
  "aurora-mysql": { provider: "pkg:generic/aws-aurora/mysql" },
  aurora: { provider: "pkg:generic/aws-aurora/mysql" },
  redis: { provider: "pkg:generic/aws-elasticache/redis", upstream: "pkg:generic/redis" },
};

/** Every `application_stack` field with a managed version, and the Azure stack it belongs to. */
const AZURE_STACKS = [
  ["dotnet_version", "dotnet"],
  ["dotnet_isolated_version", "dotnet-isolated"],
  ["java_version", "java"],
  ["node_version", "node"],
  ["python_version", "python"],
  ["powershell_core_version", "powershell"],
] as const;

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value !== "";

/** One resource instance, with the pointer to the object its attributes sit in. */
interface StateInstance {
  type: string;
  name: string;
  resource: string;
  values: JsonObject;
  pointer: string;
}

/** The `[0]`, `["key"]`, or empty instance suffix an address ends with. */
function addressSuffix(address: string, type: string, name: string): string {
  const marker = `${type}.${name}`;
  const start = address.lastIndexOf(marker);
  return start === -1 ? "" : address.slice(start + marker.length);
}

function rawIndexSuffix(indexKey: unknown): string {
  if (typeof indexKey === "number") return `[${indexKey}]`;
  if (isText(indexKey)) return `[${JSON.stringify(indexKey)}]`;
  return "";
}

function moduleInstances(module: JsonObject, base: string, instances: StateInstance[]): void {
  const resources = module.resources;
  if (Array.isArray(resources)) {
    resources.forEach((entry, index) => {
      if (!isObject(entry)) return;
      const type = entry.type;
      const name = entry.name;
      const values = entry.values;
      if (!isText(type) || !isText(name) || !isObject(values)) return;
      if (entry.mode === "data") return;
      const address = isText(entry.address) ? entry.address : "";
      instances.push({
        type,
        name,
        values,
        resource: `${type}.${name}${addressSuffix(address, type, name)}`,
        pointer: `${base}/resources/${index}/values`,
      });
    });
  }
  const children = module.child_modules;
  if (Array.isArray(children)) {
    children.forEach((child, index) => {
      if (isObject(child)) moduleInstances(child, `${base}/child_modules/${index}`, instances);
    });
  }
}

interface ShowJsonState extends JsonObject {
  format_version: string;
  values: JsonObject & { root_module: JsonObject };
}

interface RawState extends JsonObject {
  version: number;
  resources: JsonObject[];
}

function showJsonInstances(document: ShowJsonState): StateInstance[] {
  const instances: StateInstance[] = [];
  moduleInstances(document.values.root_module, "/values/root_module", instances);
  return instances;
}

function rawStateInstances(document: RawState): StateInstance[] {
  const instances: StateInstance[] = [];
  document.resources.forEach((entry, resourceIndex) => {
    const type = entry.type;
    const name = entry.name;
    const entries = entry.instances;
    if (!isText(type) || !isText(name) || !Array.isArray(entries)) return;
    if (entry.mode === "data") return;
    entries.forEach((instance, instanceIndex) => {
      if (!isObject(instance) || instance.deposed !== undefined) return;
      const attributes = instance.attributes;
      if (!isObject(attributes)) return;
      instances.push({
        type,
        name,
        values: attributes,
        resource: `${type}.${name}${rawIndexSuffix(instance.index_key)}`,
        pointer: `/resources/${resourceIndex}/instances/${instanceIndex}/attributes`,
      });
    });
  });
  return instances;
}

function item(file: string, pointer: string, resource: string, purl: string, version?: string): InventoryItem {
  return { importer: IMPORTER_ID, file, pointer, resource, purl, ...(version === undefined ? {} : { version }) };
}

function lambdaItems(instance: StateInstance, file: string): InventoryItem[] {
  if (instance.values.package_type === "Image") return [];
  const runtime = instance.values.runtime;
  if (!isText(runtime) || !RUNTIME_ID.test(runtime)) return [];
  return [item(file, `${instance.pointer}/runtime`, instance.resource, `${AWS_LAMBDA_RUNTIME}${runtime}`, runtime)];
}

function engineItems(instance: StateInstance, file: string): InventoryItem[] {
  const engine = instance.values.engine;
  const version = instance.values.engine_version;
  if (!isText(engine) || !isText(version)) return [];
  const target = ENGINES[engine.toLowerCase()];
  if (!target) return [];
  const pointer = `${instance.pointer}/engine_version`;
  const items = [item(file, pointer, instance.resource, target.provider, version)];
  if (target.upstream) items.push(item(file, pointer, instance.resource, target.upstream, version));
  return items;
}

function releaseItems(instance: StateInstance, file: string, field: string, purl: string): InventoryItem[] {
  const version = instance.values[field];
  if (!isText(version) || !RELEASE_VERSION.test(version)) return [];
  return [item(file, `${instance.pointer}/${field}`, instance.resource, purl, version)];
}

function functionItems(instance: StateInstance, file: string): InventoryItem[] {
  const runtime = instance.values.runtime;
  if (!isText(runtime) || !GCP_RUNTIME_ID.test(runtime)) return [];
  return [item(file, `${instance.pointer}/runtime`, instance.resource, `${GOOGLE_FUNCTIONS_RUNTIME}${runtime}`)];
}

function functionV2Items(instance: StateInstance, file: string): InventoryItem[] {
  const buildConfig = instance.values.build_config;
  if (!Array.isArray(buildConfig) || !isObject(buildConfig[0])) return [];
  const runtime = buildConfig[0].runtime;
  if (!isText(runtime) || !GCP_RUNTIME_ID.test(runtime)) return [];
  return [
    item(
      file,
      `${instance.pointer}/build_config/0/runtime`,
      instance.resource,
      `${GOOGLE_FUNCTIONS_RUNTIME}${runtime}`,
    ),
  ];
}

function azureStackItems(instance: StateInstance, file: string): InventoryItem[] {
  const siteConfig = instance.values.site_config;
  if (!Array.isArray(siteConfig) || !isObject(siteConfig[0])) return [];
  const applicationStack = siteConfig[0].application_stack;
  if (!Array.isArray(applicationStack) || !isObject(applicationStack[0])) return [];
  const stack = applicationStack[0];
  const items: InventoryItem[] = [];
  for (const [field, name] of AZURE_STACKS) {
    const value = stack[field];
    if (!isText(value)) continue;
    const version = value.startsWith("~") ? value.slice(1) : value;
    if (!STACK_VERSION.test(version)) continue;
    items.push(
      item(
        file,
        `${instance.pointer}/site_config/0/application_stack/0/${field}`,
        instance.resource,
        `${AZURE_APP_SERVICE}${name}`,
        version,
      ),
    );
  }
  return items;
}

function instanceItems(instance: StateInstance, file: string): InventoryItem[] {
  switch (instance.type) {
    case "aws_lambda_function":
      return lambdaItems(instance, file);
    case "aws_db_instance":
    case "aws_rds_cluster":
    case "aws_elasticache_cluster":
    case "aws_elasticache_replication_group":
      return engineItems(instance, file);
    case "aws_eks_cluster":
      return releaseItems(instance, file, "version", AMAZON_EKS);
    case "google_container_cluster":
      return releaseItems(instance, file, "master_version", GOOGLE_GKE);
    case "google_cloudfunctions_function":
      return functionItems(instance, file);
    case "google_cloudfunctions2_function":
      return functionV2Items(instance, file);
    case "azurerm_kubernetes_cluster":
      return releaseItems(instance, file, "kubernetes_version", AZURE_AKS);
    case "azurerm_linux_function_app":
      return azureStackItems(instance, file);
    default:
      return [];
  }
}

function isShowJson(document: unknown): document is ShowJsonState {
  if (!isObject(document) || !isText(document.format_version)) return false;
  const values = document.values;
  if (!isObject(values)) return false;
  return isObject(values.root_module);
}

function isRawState(document: unknown): document is RawState {
  if (!isObject(document) || document.version !== 4) return false;
  const resources = document.resources;
  return Array.isArray(resources) && resources.every(isObject);
}

export const terraformStateImporter: InventoryImporter = {
  id: IMPORTER_ID,
  registries: ["database", "kubernetes", "serverless"],
  detect(document) {
    return isShowJson(document) || isRawState(document);
  },
  items(document, file) {
    if (isShowJson(document)) return showJsonInstances(document).flatMap((instance) => instanceItems(instance, file));
    if (isRawState(document)) return rawStateInstances(document).flatMap((instance) => instanceItems(instance, file));
    return [];
  },
};
