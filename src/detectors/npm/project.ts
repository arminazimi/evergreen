import { resolve } from "node:path";

import { relativePosix } from "../../paths.js";
import type { DetectorUnclassifiedReference } from "../../sdk.js";
import { collectLockData } from "./lockfiles/index.js";
import { emptyLockData, mergeLockData } from "./lockfiles/shared.js";
import type { DependencyGraph, LockData, ResolvedVersions } from "./lockfiles/shared.js";
import { parsePackageManifest } from "./manifest.js";
import type { PackageManifest } from "./manifest.js";
import { readOptional } from "./read-optional.js";

export interface NpmProject {
  directory: string;
  manifestPath: string;
  contents: string;
  manifest: PackageManifest;
  resolved: ResolvedVersions;
  graph: DependencyGraph;
}

export function binaryBunLockReference(path: string): DetectorUnclassifiedReference {
  return {
    component: "bun.lockb",
    reference: "bun.lockb",
    reason:
      "the lockfile is binary (bun.lockb), which Evergreen does not parse; run `bun install` with Bun 1.2+ to generate a text bun.lock file",
    location: { path, line: 1 },
  };
}

/**
 * The root project is "", each workspace is its relative directory. A workspace without its own lockfile resolves
 * against the root's, which is where npm, pnpm, and Yarn put the one shared lockfile.
 */
export async function loadNpmProject(
  root: string,
  directory: string,
  rootManifest: string | undefined,
  rootLock: LockData,
  unclassified: DetectorUnclassifiedReference[],
): Promise<NpmProject | undefined> {
  const manifestPath = resolve(root, directory, "package.json");
  const contents = directory === "" ? rootManifest : await readOptional(manifestPath);
  if (!contents) return undefined;
  let manifest: PackageManifest;
  try {
    manifest = parsePackageManifest(contents);
  } catch (error) {
    // A malformed root manifest has always been an error; a malformed workspace manifest is skipped so one bad package does not hide the rest.
    if (directory === "") throw error;
    return undefined;
  }
  let own: LockData = emptyLockData();
  if (directory !== "") {
    own = await collectLockData(resolve(root, directory));
    const lockbPath = resolve(root, directory, "bun.lockb");
    if ((await readOptional(lockbPath)) !== undefined) {
      unclassified.push(binaryBunLockReference(relativePosix(root, lockbPath)));
    }
  }
  const { resolved, graph } = mergeLockData(rootLock, own);
  return { directory, manifestPath, contents, manifest, resolved, graph };
}
