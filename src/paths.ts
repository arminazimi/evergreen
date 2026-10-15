import { relative, sep } from "node:path";

/** Rewrites a platform path with forward slashes. */
export function toPosixPath(path: string, separator: string = sep): string {
  return separator === "/" ? path : path.split(separator).join("/");
}

/**
 * The path of `target` relative to `root`, always written with forward slashes, so findings,
 * baselines, and reports are byte-identical on every operating system.
 */
export function relativePosix(root: string, target: string): string {
  return toPosixPath(relative(root, target));
}
