import { parseImageReference } from "../detectors/container/parse-image.js";
import type { ImageReference } from "../detectors/container/parse-image.js";
import { formatPurl } from "@velella/ebb/purl";
import type { InventoryImporter, InventoryItem } from "./types.js";

/**
 * Reads containers and images from `docker inspect $(docker ps -aq)` and
 * `docker compose ps --format json`. Only the fields below are read; `Env`,
 * `Mounts`, `NetworkSettings`, and every other field are ignored.
 */

const BASE_NAME_LABEL = "org.opencontainers.image.base.name";
const VERSION_LABEL = "org.opencontainers.image.version";

/** A bare image id says nothing about the image's release line, and is never resolved. */
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/;
/** Tags and OCI version labels that name a release line can be checked; other tags are left unversioned. */
const VERSION_VALUE = /^v?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

interface Entry {
  value: UnknownRecord;
  /** RFC 6901 pointer to this entry: `/0` for an array, empty for a single document. */
  base: string;
}

/**
 * The entries of an inspect or Compose export: a JSON array, a single JSON object, or one JSON object per line.
 * Returns undefined for anything else, including damaged line-delimited output.
 */
function documentEntries(document: unknown): Entry[] | undefined {
  if (isRecord(document)) return [{ value: document, base: "" }];
  if (Array.isArray(document)) {
    if (document.length === 0 || !document.every(isRecord)) return undefined;
    return document.map((value, index) => ({ value, base: `/${index}` }));
  }
  if (typeof document === "string") {
    const lines = document
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) return undefined;
    const parsed: unknown[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line) as unknown);
      } catch {
        return undefined;
      }
    }
    if (!parsed.every(isRecord)) return undefined;
    return parsed.map((value, index) => ({ value, base: `/${index}` }));
  }
  return undefined;
}

function isInspectEntry(value: UnknownRecord): boolean {
  return (
    typeof value.Id === "string" &&
    isRecord(value.Config) &&
    typeof value.Config.Image === "string" &&
    isRecord(value.State)
  );
}

function isComposeEntry(value: UnknownRecord): boolean {
  return (
    typeof value.Service === "string" &&
    value.Service.length > 0 &&
    typeof value.Image === "string" &&
    value.Image.length > 0
  );
}

function detect(document: unknown): boolean {
  try {
    const entries = documentEntries(document);
    if (!entries) return false;
    return (
      entries.every((entry) => isInspectEntry(entry.value)) || entries.every((entry) => isComposeEntry(entry.value))
    );
  } catch {
    return false;
  }
}

/** A canonical version-less container PURL. Non-Docker-Hub registries become part of the namespace, so no Docker Hub rule applies to them. */
function imagePurl(image: ImageReference): string {
  const path = image.registry === "docker.io" ? image.repository : `${image.registry}/${image.repository}`;
  const slash = path.lastIndexOf("/");
  const namespace = slash === -1 ? undefined : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  return formatPurl({ type: "docker", ...(namespace === undefined ? {} : { namespace }), name });
}

interface ParsedImage {
  purl: string;
  version?: string;
  idOnly: boolean;
}

/** Parses one image reference into the PURL to check and the version a tag names, if it names one. */
function parseImage(value: string): ParsedImage | undefined {
  if (IMAGE_ID.test(value)) return { purl: "pkg:docker/image-id", version: value, idOnly: true };
  const image = parseImageReference(value);
  if (!image) return undefined;
  const version = image.tag !== undefined && VERSION_VALUE.test(image.tag) ? image.tag : undefined;
  return { purl: imagePurl(image), ...(version === undefined ? {} : { version }), idOnly: false };
}

function toItem(file: string, pointer: string, resource: string, image: ParsedImage): InventoryItem {
  return {
    importer: "docker",
    file,
    pointer,
    resource,
    purl: image.purl,
    ...(image.version === undefined ? {} : { version: image.version }),
  };
}

/** The container name without the leading `/`. */
function containerName(value: UnknownRecord): string | undefined {
  if (typeof value.Name !== "string") return undefined;
  const name = value.Name.replace(/^\/+/, "");
  return name.length > 0 ? name : undefined;
}

function inspectItems(entry: Entry, file: string): InventoryItem[] {
  const config = entry.value.Config;
  if (!isRecord(config)) return [];
  const resource = containerName(entry.value);
  if (resource === undefined) return [];

  const items: InventoryItem[] = [];
  const image = typeof config.Image === "string" ? parseImage(config.Image) : undefined;
  if (image) items.push(toItem(file, `${entry.base}/Config/Image`, resource, image));

  if (!isRecord(config.Labels)) return items;
  const baseName = config.Labels[BASE_NAME_LABEL];
  if (typeof baseName === "string") {
    const base = parseImage(baseName);
    if (base) items.push(toItem(file, `${entry.base}/Config/Labels/${BASE_NAME_LABEL}`, resource, base));
  }

  const labelVersion = config.Labels[VERSION_LABEL];
  if (typeof labelVersion === "string" && image !== undefined && !image.idOnly && VERSION_VALUE.test(labelVersion)) {
    items.push({
      importer: "docker",
      file,
      pointer: `${entry.base}/Config/Labels/${VERSION_LABEL}`,
      resource,
      purl: image.purl,
      version: labelVersion,
    });
  }
  return items;
}

function composeItems(entry: Entry, file: string): InventoryItem[] {
  if (typeof entry.value.Service !== "string" || typeof entry.value.Image !== "string") return [];
  const image = parseImage(entry.value.Image);
  return image === undefined ? [] : [toItem(file, `${entry.base}/Image`, entry.value.Service, image)];
}

function items(document: unknown, file: string): InventoryItem[] {
  const entries = documentEntries(document);
  if (!entries) return [];
  if (entries.every((entry) => isComposeEntry(entry.value)))
    return entries.flatMap((entry) => composeItems(entry, file));
  if (entries.every((entry) => isInspectEntry(entry.value)))
    return entries.flatMap((entry) => inspectItems(entry, file));
  return [];
}

export const dockerInventoryImporter: InventoryImporter = {
  id: "docker",
  registries: ["container"],
  detect,
  items,
};
