import { basename } from "node:path";

import type { InventoryImporter, InventoryItem } from "./types.js";

export const OS_RELEASE_IMPORTER_ID = "os-release";

export interface OsReleaseValue {
  value: string;
  /** One-based line in the file the value was read from. */
  line: number;
}

export interface OsReleaseBlock {
  /** The name in a `### host: <name>` header; absent for a single host file. */
  host?: string;
  /** The keys of the block, by name, in the order they first appear. */
  values: Map<string, OsReleaseValue>;
}

const HOST_HEADER = /^### host:\s*(.*\S)\s*$/;
const FIELD = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/;
const RELEASE = /^\d+(?:\.\d+)*$/;

function unquote(value: string): string {
  const quote = value[0];
  return value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote) ? value.slice(1, -1) : value;
}

function readValues(lines: readonly string[], firstLine: number): Map<string, OsReleaseValue> {
  const values = new Map<string, OsReleaseValue>();
  lines.forEach((text, index) => {
    const match = FIELD.exec(text);
    if (!match?.[1] || match[2] === undefined || values.has(match[1])) return;
    values.set(match[1], { value: unquote(match[2]), line: firstLine + index });
  });
  return values;
}

/** The blocks of an `os-release` document: one for a single host, or one per `### host: <name>` header. */
export function parseOsReleaseDocument(text: string): OsReleaseBlock[] {
  const lines = text.split(/\r?\n/);
  const headers = lines.flatMap((line, index) => {
    const match = HOST_HEADER.exec(line);
    return match?.[1] === undefined ? [] : [{ host: match[1].trim(), index }];
  });
  if (headers.length === 0) {
    const values = readValues(lines, 1);
    return values.size === 0 ? [] : [{ values }];
  }
  return headers.map((header, position) => {
    const end = headers[position + 1]?.index ?? lines.length;
    return { host: header.host, values: readValues(lines.slice(header.index + 1, end), header.index + 2) };
  });
}

/** `ID`, lowercased, when it can name a PURL segment; otherwise the block is not this importer's shape. */
function distributionOf(block: OsReleaseBlock): string | undefined {
  const id = block.values.get("ID")?.value.trim().toLowerCase();
  return id !== undefined && SAFE_ID.test(id) ? id : undefined;
}

function configuredRelease(block: OsReleaseBlock): OsReleaseValue | undefined {
  const release = block.values.get("VERSION_ID");
  return release === undefined || release.value.trim() === "" ? undefined : release;
}

/** A numeric release line, which is the only shape the lifecycle rules can compare. */
function releaseOf(block: OsReleaseBlock): OsReleaseValue | undefined {
  const release = configuredRelease(block);
  return release === undefined || !RELEASE.test(release.value.trim()) ? undefined : release;
}

/**
 * Reads host operating systems from `/etc/os-release` files, alone or in a bundle where each host's
 * block starts with `### host: <name>`. The pointer is the line of `VERSION_ID`; the resource is the
 * host name, or the file name for a single host.
 */
export const osReleaseImporter: InventoryImporter = {
  id: OS_RELEASE_IMPORTER_ID,
  registries: ["container"],

  detect(document) {
    if (typeof document !== "string") return false;
    return parseOsReleaseDocument(document).some(
      (block) => distributionOf(block) !== undefined && configuredRelease(block) !== undefined,
    );
  },

  items(document, file) {
    if (typeof document !== "string") return [];
    const items: InventoryItem[] = [];
    for (const block of parseOsReleaseDocument(document)) {
      const id = distributionOf(block);
      const release = releaseOf(block);
      if (id === undefined || release === undefined) continue;
      items.push({
        importer: OS_RELEASE_IMPORTER_ID,
        file,
        pointer: `line:${release.line}`,
        resource: block.host ?? basename(file),
        purl: `pkg:generic/${id}`,
        version: release.value.trim(),
      });
    }
    return items;
  },
};
