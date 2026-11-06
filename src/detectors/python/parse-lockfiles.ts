import { resolve } from "node:path";

import type { ResolvedVersions, UnknownRecord } from "./types.js";
import { addResolved, asRecord, parseTomlDocument, readOptional } from "./shared.js";

function collectTomlLock(contents: string, target: ResolvedVersions): void {
  const document = parseTomlDocument(contents);
  const packages = document?.package ?? document?.packages;
  if (!Array.isArray(packages)) return;
  for (const value of packages) {
    const metadata = asRecord(value);
    if (typeof metadata?.name === "string") {
      addResolved(target, metadata.name, metadata.version);
    }
  }
}

function collectPipfileLock(contents: string, target: ResolvedVersions): void {
  let document: UnknownRecord | undefined;
  try {
    document = asRecord(JSON.parse(contents) as unknown);
  } catch {
    return;
  }
  for (const sectionName of ["default", "develop"] as const) {
    for (const [name, value] of Object.entries(asRecord(document?.[sectionName]) ?? {})) {
      const metadata = asRecord(value);
      addResolved(target, name, metadata?.version);
    }
  }
}

export async function collectLockfiles(root: string, target: ResolvedVersions): Promise<void> {
  const files = await Promise.all(
    ["uv.lock", "poetry.lock", "pdm.lock", "Pipfile.lock"].map(async (name) => ({
      name,
      contents: await readOptional(resolve(root, name)),
    })),
  );
  for (const file of files) {
    if (!file.contents) continue;
    if (file.name === "Pipfile.lock") collectPipfileLock(file.contents, target);
    else collectTomlLock(file.contents, target);
  }
}
