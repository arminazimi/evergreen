import { readFile } from "node:fs/promises";

import { checkAgainst } from "../check-dependency.js";
import { loadDataFile } from "../data-source.js";
import { validateRegistryV2, type RegistryV2Rule } from "../registry.js";
import { k8sWorkloadsImporter } from "./k8s-workloads.js";
import type { InventoryImporter, InventoryReport, InventoryResult } from "./types.js";

export type { InventoryImporter, InventoryItem, InventoryReport, InventoryResult } from "./types.js";

/** Every built-in importer. Each task in the inventory epic appends its own entry. */
export const inventoryImporters: InventoryImporter[] = [k8sWorkloadsImporter];

/** Parses an export as JSON, or keeps it as text when it is not JSON (for example `/etc/os-release`). */
export function parseExport(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function rulesFor(registries: readonly string[]): Promise<RegistryV2Rule[]> {
  const rules: RegistryV2Rule[] = [];
  for (const name of [...new Set(registries)].sort()) {
    rules.push(...validateRegistryV2(await loadDataFile(`registry/${name}.json`)).rules);
  }
  return rules;
}

/** Reads each export, lets the first importer that recognizes it list items, and checks every item. Deterministic. */
export async function runInventory(files: readonly string[], importers: readonly InventoryImporter[] = inventoryImporters, only?: string): Promise<InventoryReport> {
  const results: InventoryResult[] = [];
  const unrecognized: string[] = [];
  for (const file of files) {
    const document = parseExport(await readFile(file, "utf8"));
    const importer = importers.find((candidate) => (only === undefined || candidate.id === only) && candidate.detect(document, file));
    if (!importer) {
      unrecognized.push(file);
      continue;
    }
    const rules = await rulesFor(importer.registries);
    for (const item of importer.items(document, file)) {
      results.push({ item, check: checkAgainst(rules, { purl: item.purl, ...(item.version === undefined ? {} : { version: item.version }) }) });
    }
  }
  results.sort((a, b) => a.item.file.localeCompare(b.item.file) || a.item.pointer.localeCompare(b.item.pointer));
  return { schemaVersion: "evergreen.inventory.v1", results, unrecognized };
}
