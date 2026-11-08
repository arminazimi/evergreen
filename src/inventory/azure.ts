import { versionScheme } from "@velella/ebb/vers/index";
import type { InventoryImporter, InventoryItem } from "./types.js";

/**
 * Azure inventory importer.
 *
 * Reads the JSON exports of `az webapp list`, `az functionapp list`, and `az aks list`. It maps each
 * managed language stack, Functions runtime version, and cluster to a PURL the lifecycle registry is
 * written against, and records the JSON Pointer to the field the version came from. Exports are parsed
 * only: no command is run, nothing is fetched, and a shape the importer does not know is skipped
 * rather than guessed.
 */

const IMPORTER_ID = "azure";
const APP_SERVICE = "pkg:generic/azure-app-service/";
const FUNCTIONS_RUNTIME = "pkg:generic/azure-functions";
const AKS = "pkg:generic/azure-aks";

/** The Functions runtime version, read only when the export writes it into `siteConfig` itself. */
const EXTENSION_VERSION = "FUNCTIONS_EXTENSION_VERSION";

/** The `linuxFxVersion` and `windowsFxVersion` prefixes that name a managed App Service stack. */
const STACKS: Record<string, string> = {
  DOTNETCORE: "dotnet",
  "DOTNET-ISOLATED": "dotnet-isolated",
  JAVA: "java",
  NODE: "node",
  PHP: "php",
  PYTHON: "python",
};

/** The version a stack reference carries: `18` from `18-lts`, `11` from `11-java11`, `3.8`, `8.0`. */
const STACK_VERSION = /^(\d+(?:\.\d+)*)(?:-[0-9A-Za-z.]+)?$/;

/** `FUNCTIONS_EXTENSION_VERSION` is a major pinned with a tilde (`~4`) or an exact build (`4.0.11542`). */
const RUNTIME_VERSION = /^~?(\d{1,2}(?:\.\d+){0,2})$/;

/** The two fields an app declares its managed stack in, in the order the export writes them. */
const STACK_FIELDS = ["linuxFxVersion", "windowsFxVersion"] as const;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** The document as a list of resource objects, or undefined when it is any other shape. */
function resourceList(document: unknown): JsonObject[] | undefined {
  return Array.isArray(document) && document.length > 0 && document.every(isObject) ? document : undefined;
}

/** The `siteConfig` object a `SiteResource` entry carries, if any. */
function siteConfigOf(entry: JsonObject): JsonObject | undefined {
  return isObject(entry.siteConfig) ? entry.siteConfig : undefined;
}

/** True when the version scheme the bundled rules compare with can read this version. */
function isComparableVersion(version: string): boolean {
  try {
    versionScheme("semver").compare(version, version);
    return true;
  } catch {
    return false;
  }
}

/** The field and value of an app's stack reference, or undefined when the export carries none. */
function stackReference(config: JsonObject): { field: string; value: string } | undefined {
  for (const field of STACK_FIELDS) {
    const value = string(config[field]);
    if (value !== undefined) return { field, value };
  }
  return undefined;
}

/**
 * `{ field, stack, version }` for the managed App Service stack an app declares, or undefined.
 * A custom container and a stack prefix this importer has no rules for are skipped. Azure writes some
 * references with a third part after the version (`PYTHON|3.11|3.0`); only the version is read. A longer
 * reference names a server as well (`JAVA|8|TOMCAT|9.0`) and is skipped rather than guessed.
 */
function declaredStack(config: JsonObject): { field: string; stack: string; version: string } | undefined {
  const reference = stackReference(config);
  if (reference === undefined) return undefined;
  const parts = reference.value.split("|");
  if (parts.length < 2 || parts.length > 3) return undefined;
  const stack = STACKS[(parts[0] ?? "").toUpperCase()];
  if (stack === undefined) return undefined;
  const match = STACK_VERSION.exec(parts[1] ?? "");
  const version = match === null ? undefined : match[1];
  if (version === undefined || !isComparableVersion(version)) return undefined;
  return { field: reference.field, stack, version };
}

/** The Functions runtime version an export writes into `siteConfig`, or undefined. App settings are never read. */
function runtimeVersion(config: JsonObject): string | undefined {
  const value = string(config[EXTENSION_VERSION]);
  if (value === undefined) return undefined;
  const parsed = RUNTIME_VERSION.exec(value);
  return parsed === null ? undefined : parsed[1];
}

function isFunctionApp(kind: string): boolean {
  return kind.split(",").includes("functionapp");
}

function isAppServiceSite(document: unknown): boolean {
  const entries = resourceList(document);
  return (
    entries !== undefined &&
    entries.some((entry) => {
      const config = siteConfigOf(entry);
      return (
        config !== undefined &&
        string(entry.kind) !== undefined &&
        (stackReference(config) !== undefined || runtimeVersion(config) !== undefined)
      );
    })
  );
}

/** The version fields an AKS cluster declares: its control plane and each of its agent pools. */
function aksVersions(entry: JsonObject): { pointerSuffix: string; version: string | undefined }[] {
  const controlPlane = [{ pointerSuffix: "kubernetesVersion", version: string(entry.kubernetesVersion) }];
  const pools = Array.isArray(entry.agentPoolProfiles) ? entry.agentPoolProfiles.filter(isObject) : [];
  return [
    ...controlPlane,
    ...pools.map((pool, index) => ({
      pointerSuffix: `agentPoolProfiles/${index}/orchestratorVersion`,
      version: string(pool.orchestratorVersion),
    })),
  ];
}

function isAks(document: unknown): boolean {
  const entries = resourceList(document);
  return (
    entries !== undefined &&
    entries.some(
      (entry) => string(entry.name) !== undefined && aksVersions(entry).some((field) => field.version !== undefined),
    )
  );
}

function siteItems(document: unknown, file: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const [index, entry] of (resourceList(document) ?? []).entries()) {
    const resource = string(entry.name);
    const kind = string(entry.kind);
    const config = siteConfigOf(entry);
    if (resource === undefined || kind === undefined || config === undefined) continue;
    const stack = declaredStack(config);
    if (stack !== undefined) {
      items.push({
        importer: IMPORTER_ID,
        file,
        pointer: `/${index}/siteConfig/${stack.field}`,
        resource,
        purl: `${APP_SERVICE}${stack.stack}`,
        version: stack.version,
      });
    }
    const version = isFunctionApp(kind) ? runtimeVersion(config) : undefined;
    if (version !== undefined && isComparableVersion(version)) {
      items.push({
        importer: IMPORTER_ID,
        file,
        pointer: `/${index}/siteConfig/${EXTENSION_VERSION}`,
        resource,
        purl: FUNCTIONS_RUNTIME,
        version,
      });
    }
  }
  return items;
}

function aksItems(document: unknown, file: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const [index, entry] of (resourceList(document) ?? []).entries()) {
    const resource = string(entry.name);
    if (resource === undefined) continue;
    const seen = new Set<string>();
    for (const field of aksVersions(entry)) {
      const version = field.version;
      if (version === undefined || seen.has(version) || !isComparableVersion(version)) continue;
      seen.add(version);
      items.push({
        importer: IMPORTER_ID,
        file,
        pointer: `/${index}/${field.pointerSuffix}`,
        resource,
        purl: AKS,
        version,
      });
    }
  }
  return items;
}

export const azureImporter: InventoryImporter = {
  id: IMPORTER_ID,
  registries: ["serverless", "kubernetes"],
  detect(document) {
    return isAppServiceSite(document) || isAks(document);
  },
  items(document, file) {
    if (isAks(document)) return aksItems(document, file);
    if (isAppServiceSite(document)) return siteItems(document, file);
    return [];
  },
};
