import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ScaffoldNames } from "./names.js";

const DETECTOR_ID = /\bid(?:\s*:\s*|\s*=\s*)["']([a-z][a-z0-9-]*)["']/g;

async function listFiles(directory: string, suffix: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(directory, entry.name), suffix) : entry.name.endsWith(suffix) ? [join(directory, entry.name)] : [])),
  );
  return nested.flat();
}

/** The detector ids declared in `src/detectors/` (`id: "npm"` in an adapter, `readonly id = "npm"` in a class), with the file. */
export async function existingDetectorIds(root: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const file of await listFiles(join(root, "src", "detectors"), ".ts")) {
    const contents = await readFile(file, "utf8");
    for (const match of contents.matchAll(DETECTOR_ID)) {
      const relative = file.slice(root.length + 1).replaceAll("\\", "/");
      if (!ids.has(match[1]!)) ids.set(match[1]!, relative);
    }
  }
  return ids;
}

/**
 * The names the registries already use, each with the file that uses it: the file's own name, its `ecosystem`, and the
 * first segment of its rule ids (`npm.package.request.deprecated` uses `npm`). Rule ids are global, so a new
 * ecosystem must not reuse any of them.
 */
export async function existingRegistryNamespaces(root: string): Promise<Map<string, string>> {
  const namespaces = new Map<string, string>();
  const claim = (name: string, file: string) => {
    if (!namespaces.has(name)) namespaces.set(name, file);
  };
  for (const absolute of await listFiles(join(root, "registry"), ".json")) {
    const file = absolute.slice(root.length + 1).replaceAll("\\", "/");
    const base = file.replace(/^registry\//, "").replace(/\.json$/, "");
    if (base === "sources.lock" || base.endsWith("-shas")) continue;
    claim(base, file);
    let registry: unknown;
    try {
      registry = JSON.parse(await readFile(absolute, "utf8"));
    } catch {
      continue;
    }
    if (typeof registry !== "object" || registry === null) continue;
    const { ecosystem, rules } = registry as { ecosystem?: unknown; rules?: unknown };
    if (typeof ecosystem === "string") claim(ecosystem, file);
    for (const rule of Array.isArray(rules) ? rules : []) {
      const id = typeof rule === "object" && rule !== null ? (rule as { id?: unknown }).id : undefined;
      if (typeof id === "string" && id.includes(".")) claim(id.split(".")[0]!, file);
    }
  }
  return namespaces;
}

/** Everything that would make the new detector clash with one that exists, as messages that say what and where. */
export async function findCollisions(root: string, names: ScaffoldNames): Promise<string[]> {
  const problems: string[] = [];
  const detectors = await existingDetectorIds(root);
  const namespaces = await existingRegistryNamespaces(root);
  const detectorFile = detectors.get(names.id);
  if (detectorFile) problems.push(`the detector id "${names.id}" is already used by ${detectorFile}`);
  const idUse = namespaces.get(names.id);
  if (idUse) problems.push(`"${names.id}" is already a registry name or rule namespace, used by ${idUse}`);
  if (names.ecosystem !== names.id) {
    const ecosystemUse = namespaces.get(names.ecosystem);
    if (ecosystemUse) problems.push(`the ecosystem "${names.ecosystem}" is already used by ${ecosystemUse}; rule ids and registries must stay unique`);
  }
  return problems;
}
