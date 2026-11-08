import { getActiveData, loadDataFile } from "./data-source.js";
import { validateRegistryV2 } from "./registry.js";
import type { RegistryV2Rule } from "./registry.js";

/** The bundled registries a dependency is looked up in. */
const BUNDLED_REGISTRIES = ["github-actions", "nodejs", "npm", "python"] as const;

let loaded: { source: Promise<unknown>; rules: Promise<RegistryV2Rule[]> } | undefined;

/** The lifecycle rules in use (downloaded data when it verifies, else those bundled with this release), validated. */
export async function bundledRules(): Promise<RegistryV2Rule[]> {
  const source = getActiveData();
  if (loaded?.source !== source) {
    loaded = {
      source,
      rules: (async () => {
        const rules: RegistryV2Rule[] = [];
        for (const name of BUNDLED_REGISTRIES) {
          rules.push(...validateRegistryV2(await loadDataFile(`registry/${name}.json`)).rules);
        }
        return rules;
      })(),
    };
  }
  return loaded.rules;
}
