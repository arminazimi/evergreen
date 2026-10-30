/**
 * Load an `evergreen.portal.v1` catalog from a URL or a local file path.
 * Used by the sample app and mirrored by the backend plugin's TypeScript loader.
 */

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { parsePortalCatalog } from "./portal.mjs";

/**
 * @param {string} source Absolute file path, `file:` URL, or `http(s):` URL of the portal export.
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<import('./portal.mjs').PortalCatalog>}
 */
export async function loadPortalCatalog(source, options = {}) {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("portal export source must be a non-empty string");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch is not available; pass fetchImpl or use a local file path");
    }
    const response = await fetchImpl(trimmed);
    if (!response.ok) {
      throw new Error(`failed to fetch portal export from ${trimmed}: HTTP ${response.status}`);
    }
    return parsePortalCatalog(await response.json());
  }

  const fileUrl = trimmed.startsWith("file:") ? trimmed : pathToFileURL(trimmed).href;
  const path = new URL(fileUrl);
  const text = await readFile(path, "utf8");
  return parsePortalCatalog(JSON.parse(text));
}
