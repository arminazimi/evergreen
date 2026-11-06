import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { DirectDependency, ResolvedVersions } from "./types.js";
import { addDependency, addExactPin, parseRequirement } from "./shared.js";

export async function requirementFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /^requirements(?:[-_.][A-Za-z0-9_.-]+)?\.txt$/i.test(entry.name))
      .map((entry) => resolve(root, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export function collectRequirementsFile(
  path: string,
  contents: string,
  target: Map<string, DirectDependency>,
  resolved: ResolvedVersions,
): void {
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    const requirement = parseRequirement(line);
    if (!requirement) continue;
    addDependency(target, path, contents, requirement.name, requirement.constraint, index + 1);
    addExactPin(resolved, requirement.name, requirement.constraint);
  }
}
