import type { ScaffoldNames } from "../names.js";

/** `registry/<id>.json`: an empty `evergreen.registry.v2` registry. */
export function registryTemplate(names: ScaffoldNames): string {
  return `${JSON.stringify({ schemaVersion: "evergreen.registry.v2", ecosystem: names.ecosystem, rules: [] }, null, 2)}\n`;
}
