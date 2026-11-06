import type { DependencyGraph } from "./lockfiles/shared.js";

/**
 * The shortest chain of package names from a directly declared dependency to `target`, both ends included, or
 * undefined when the lockfile graph does not reach it. Neighbours are visited in name order so the same lockfile
 * always yields the same path.
 */
export function shortestDependencyPath(
  graph: DependencyGraph,
  direct: Iterable<string>,
  target: string,
): string[] | undefined {
  const parent = new Map<string, string | undefined>();
  let frontier = [...direct].sort();
  for (const name of frontier) parent.set(name, undefined);
  while (frontier.length > 0 && !parent.has(target)) {
    const next: string[] = [];
    for (const name of frontier) {
      for (const dependency of [...(graph.get(name) ?? [])].sort()) {
        if (parent.has(dependency)) continue;
        parent.set(dependency, name);
        next.push(dependency);
      }
    }
    frontier = next;
  }
  if (!parent.has(target)) return undefined;
  const path: string[] = [];
  for (let name: string | undefined = target; name !== undefined; name = parent.get(name)) path.unshift(name);
  return path;
}
