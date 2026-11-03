import { relative, sep } from "node:path";

/** Rewrites a platform path with forward slashes. */
export function toPosixPath(path: string, separator: string = sep): string {
  return separator === "/" ? path : path.split(separator).join("/");
}

/**
 * The repository-relative path of a directory entry below `prefix`, written with forward slashes.
 * Discovery walks carry the prefix down the tree with this instead of calling `relative()` on every
 * entry: `relative()` re-resolves both paths, which on a large repository costs more than the
 * directory read.
 */
export function childPosixPath(prefix: string, name: string): string {
  return prefix === "" ? name : `${prefix}/${name}`;
}

/**
 * The path of `target` relative to `root`, always written with forward slashes, so findings,
 * baselines, and reports are byte-identical on every operating system.
 */
export function relativePosix(root: string, target: string): string {
  return toPosixPath(relative(root, target));
}
