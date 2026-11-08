import { bundledRules } from "@velella/ebb/bundled-rules";
import { builtInDetectors } from "./detectors/index.js";

/** Selectors that are duplicated, empty, or not an ecosystem or rule-id prefix, in the order they were given. */
export async function unknownSelectors(selectors: string[]): Promise<string[]> {
  const known = await selectorValues();
  return [...new Set(selectors)].filter((value) => !known.has(value) || value === "" || value.startsWith("-"));
}

/** Valid `--only`/`--exclude` values: ecosystem ids, rule ids, and their dotted prefixes. */
async function selectorValues(): Promise<Set<string>> {
  const values = new Set<string>(builtInDetectors.map((detector) => detector.id));
  for (const rule of await bundledRules()) {
    const parts = rule.id.split(".");
    for (let index = 1; index <= parts.length; index += 1) values.add(parts.slice(0, index).join("."));
  }
  return values;
}

/** Lists the ecosystems and rule-id families a selector may name, for the unknown-selector error. */
export async function selectorValuesSummary(): Promise<string> {
  const ecosystems = builtInDetectors.map((detector) => detector.id).sort();
  const prefixes = [...new Set((await bundledRules()).map((rule) => rule.id.split(".").slice(0, 2).join(".")))].sort(
    (left, right) => left.localeCompare(right),
  );
  return `Valid ecosystems: ${ecosystems.join(", ")}. Valid rule prefixes: ${[...ecosystems, ...prefixes]
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right))
    .join(", ")}.`;
}
