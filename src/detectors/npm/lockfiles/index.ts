import { resolve } from "node:path";

import { readOptional } from "../read-optional.js";
import { parseBunLock } from "./bun-lock.js";
import { parsePackageLock } from "./package-lock.js";
import { parsePnpmLock } from "./pnpm-lock.js";
import { emptyLockData } from "./shared.js";
import type { LockData } from "./shared.js";
import { parseYarnLock } from "./yarn-lock.js";

/** Reads every supported lockfile directly inside `root` and merges what each one resolves. */
export async function collectLockData(root: string): Promise<LockData> {
  const resolved: LockData = emptyLockData();
  const lockfiles = await Promise.all([
    readOptional(resolve(root, "package-lock.json")),
    readOptional(resolve(root, "npm-shrinkwrap.json")),
    readOptional(resolve(root, "pnpm-lock.yaml")),
    readOptional(resolve(root, "yarn.lock")),
    readOptional(resolve(root, "bun.lock")),
  ]);

  if (lockfiles[0]) parsePackageLock(lockfiles[0], resolved);
  if (lockfiles[1]) parsePackageLock(lockfiles[1], resolved);
  if (lockfiles[2]) parsePnpmLock(lockfiles[2], resolved);
  if (lockfiles[3]) parseYarnLock(lockfiles[3], resolved);
  if (lockfiles[4]) parseBunLock(lockfiles[4], resolved);
  return resolved;
}
