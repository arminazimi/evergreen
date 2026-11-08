import { versionScheme } from "@velella/ebb/vers/index";
import type { InventoryImporter, InventoryItem } from "./types.js";

/**
 * Google Cloud inventory importer.
 *
 * Reads the JSON exports of `gcloud functions list`, `gcloud app versions list`,
 * `gcloud container clusters list`, and `gcloud run services list`. It maps each resource to a
 * version-less PURL the lifecycle registry is written against, and records the JSON Pointer to
 * the field the version came from. Exports are parsed only: no command is run, nothing is
 * fetched, and a shape the importer does not know is skipped rather than guessed.
 */

const IMPORTER_ID = "gcp";
const FUNCTIONS_RUNTIME = "pkg:generic/google-cloud-functions-runtime/";
const APPENGINE_RUNTIME = "pkg:generic/google-appengine-runtime/";
const GKE = "pkg:generic/google-gke";
const DOCKER_HUB = "pkg:docker/library/";

const FUNCTIONS_NAME = /^projects\/[^/]+\/locations\/[^/]+\/functions\/[^/]+$/;
const APPENGINE_NAME = /^apps\/[^/]+\/services\/[^/]+\/versions\/[^/]+$/;
const RUNTIME_ID = /^[a-z0-9][a-z0-9._-]*$/;
const IMAGE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const IMAGE_TAG = /^\d[0-9A-Za-z._-]*$/;

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

/** A resource's own short name: the last path segment, never a project id or number. */
function shortName(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function buildConfigRuntime(entry: JsonObject): string | undefined {
  return isObject(entry.buildConfig) ? string(entry.buildConfig.runtime) : undefined;
}

function containersOf(entry: JsonObject): JsonObject[] | undefined {
  const { metadata, spec } = entry;
  if (!isObject(metadata) || string(metadata.name) === undefined || !isObject(spec)) return undefined;
  if (!isObject(spec.template) || !isObject(spec.template.spec)) return undefined;
  const containers = spec.template.spec.containers;
  return Array.isArray(containers) ? containers.filter(isObject) : undefined;
}

function isFunctions(document: unknown): boolean {
  const entries = resourceList(document);
  return (
    entries !== undefined &&
    entries.some((entry) => {
      const name = string(entry.name);
      return (
        name !== undefined &&
        FUNCTIONS_NAME.test(name) &&
        (string(entry.runtime) !== undefined || buildConfigRuntime(entry) !== undefined)
      );
    })
  );
}

function isAppEngine(document: unknown): boolean {
  const entries = resourceList(document);
  return (
    entries !== undefined &&
    entries.some((entry) => {
      const name = string(entry.name);
      return name !== undefined && APPENGINE_NAME.test(name) && string(entry.runtime) !== undefined;
    })
  );
}

function isGke(document: unknown): boolean {
  const entries = resourceList(document);
  return (
    entries !== undefined &&
    entries.some(
      (entry) => string(entry.currentMasterVersion) !== undefined || string(entry.currentNodeVersion) !== undefined,
    )
  );
}

function isCloudRun(document: unknown): boolean {
  const entries = resourceList(document);
  return (
    entries !== undefined &&
    entries.some((entry) => {
      const kind = string(entry.kind);
      return (
        (kind === "Service" || string(entry.apiVersion) === "serving.knative.dev/v1") &&
        containersOf(entry) !== undefined
      );
    })
  );
}

function functionsItems(document: unknown, file: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const [index, entry] of (resourceList(document) ?? []).entries()) {
    const name = string(entry.name);
    const runtime = string(entry.runtime) ?? buildConfigRuntime(entry);
    if (name === undefined || runtime === undefined || !RUNTIME_ID.test(runtime)) continue;
    items.push({
      importer: IMPORTER_ID,
      file,
      pointer: string(entry.runtime) === undefined ? `/${index}/buildConfig/runtime` : `/${index}/runtime`,
      resource: shortName(name),
      purl: `${FUNCTIONS_RUNTIME}${runtime}`,
    });
  }
  return items;
}

function appEngineItems(document: unknown, file: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const [index, entry] of (resourceList(document) ?? []).entries()) {
    const name = string(entry.name);
    const runtime = string(entry.runtime);
    if (name === undefined || runtime === undefined || !RUNTIME_ID.test(runtime)) continue;
    items.push({
      importer: IMPORTER_ID,
      file,
      pointer: `/${index}/runtime`,
      resource: shortName(name),
      purl: `${APPENGINE_RUNTIME}${runtime}`,
    });
  }
  return items;
}

/** True when the bundled rules can compare this version with their semver ranges. */
function isComparableVersion(version: string): boolean {
  try {
    versionScheme("semver").compare(version, version);
    return true;
  } catch {
    return false;
  }
}

function gkeItems(document: unknown, file: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const [index, entry] of (resourceList(document) ?? []).entries()) {
    const name = string(entry.name);
    if (name === undefined) continue;
    const resource = shortName(name);
    const versions = new Set<string>();
    for (const field of ["currentMasterVersion", "currentNodeVersion"] as const) {
      const version = string(entry[field]);
      if (version === undefined || versions.has(version) || !isComparableVersion(version)) continue;
      versions.add(version);
      items.push({ importer: IMPORTER_ID, file, pointer: `/${index}/${field}`, resource, purl: GKE, version });
    }
  }
  return items;
}

/**
 * A public Docker Hub base image referenced by name, as `{ name, version }`.
 * An image with a registry host or a namespace, a digest-only reference, or a tag that is not a version is not one.
 */
function publicBaseImage(reference: string): { name: string; version: string } | undefined {
  const digest = reference.indexOf("@");
  let path = digest === -1 ? reference : reference.slice(0, digest);
  if (path.includes("/")) {
    if (!path.startsWith("library/") || path.indexOf("/", "library/".length) !== -1) return undefined;
    path = path.slice("library/".length);
  }
  const colon = path.lastIndexOf(":");
  if (colon === -1) return undefined;
  const name = path.slice(0, colon);
  const version = path.slice(colon + 1);
  if (!IMAGE_NAME.test(name) || !IMAGE_TAG.test(version) || !isComparableVersion(version)) return undefined;
  return { name, version };
}

function cloudRunItems(document: unknown, file: string): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const [index, entry] of (resourceList(document) ?? []).entries()) {
    const containers = containersOf(entry);
    if (containers === undefined) continue;
    const metadata = entry.metadata as JsonObject;
    const resource = string(metadata.name);
    if (resource === undefined) continue;
    for (const [containerIndex, container] of containers.entries()) {
      const image = string(container.image);
      if (image === undefined) continue;
      const parsed = publicBaseImage(image);
      if (parsed === undefined) continue;
      items.push({
        importer: IMPORTER_ID,
        file,
        pointer: `/${index}/spec/template/spec/containers/${containerIndex}/image`,
        resource,
        purl: `${DOCKER_HUB}${parsed.name}`,
        version: parsed.version,
      });
    }
  }
  return items;
}

export const gcpImporter: InventoryImporter = {
  id: IMPORTER_ID,
  registries: ["container", "kubernetes", "serverless"],
  detect(document) {
    return isGke(document) || isFunctions(document) || isAppEngine(document) || isCloudRun(document);
  },
  items(document, file) {
    if (isGke(document)) return gkeItems(document, file);
    if (isFunctions(document)) return functionsItems(document, file);
    if (isAppEngine(document)) return appEngineItems(document, file);
    if (isCloudRun(document)) return cloudRunItems(document, file);
    return [];
  },
};
