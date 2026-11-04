import { cp, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { restoreFixtureNames } from "../src/fixture-names.js";

/**
 * Copies a fixture tree into a temporary directory and restores the real names scanners must not see in the
 * repository (decision 0027). The caller adds `root` to the list its `after` hook removes.
 */
export async function copyFixtureTree(source: string, roots: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fixture-"));
  roots.push(root);
  await cp(source, root, { recursive: true });
  await restoreFixtureNames(root);
  return root;
}
