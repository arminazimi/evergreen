import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parsePortalCatalog, type PortalCatalog } from "../../common/portal";

/**
 * Load an `evergreen.portal.v1` catalog from a URL or a local file path
 * (CI artifact on disk, object-store URL, or Pages URL).
 */
export async function loadPortalCatalog(
  source: string,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<PortalCatalog> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("evergreen.portalExportSource must be a non-empty string");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch is not available to load a remote portal export");
    }
    const response = await fetchImpl(trimmed);
    if (!response.ok) {
      throw new Error(`failed to fetch portal export from ${trimmed}: HTTP ${response.status}`);
    }
    return parsePortalCatalog(await response.json());
  }

  const fileUrl = trimmed.startsWith("file:") ? trimmed : pathToFileURL(trimmed).href;
  const text = await readFile(new URL(fileUrl), "utf8");
  return parsePortalCatalog(JSON.parse(text));
}
