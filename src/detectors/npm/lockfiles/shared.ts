import semver from "semver";

/** Package name -> every version a lockfile resolves for it. */
export type ResolvedVersions = Map<string, Set<string>>;
/** Package name -> the names it depends on, read from a lockfile. Names, not versions: the path is for people to follow. */
export type DependencyGraph = Map<string, Set<string>>;
export interface LockData {
  versions: ResolvedVersions;
  graph: DependencyGraph;
}

export function addResolved(target: ResolvedVersions, name: string, version: unknown): void {
  if (typeof version !== "string" || !semver.valid(version)) {
    return;
  }
  const versions = target.get(name) ?? new Set<string>();
  versions.add(version);
  target.set(name, versions);
}

export function addEdges(
  graph: DependencyGraph,
  from: string,
  ...sections: Array<Record<string, unknown> | undefined>
): void {
  const edges = graph.get(from) ?? new Set<string>();
  for (const section of sections) for (const name of Object.keys(section ?? {})) edges.add(name);
  graph.set(from, edges);
}

export function emptyLockData(): LockData {
  return { versions: new Map(), graph: new Map() };
}

export function mergeLockData(root: LockData, own: LockData): { resolved: ResolvedVersions; graph: DependencyGraph } {
  const resolved: ResolvedVersions = new Map(root.versions);
  for (const [name, versions] of own.versions)
    resolved.set(name, new Set([...(resolved.get(name) ?? []), ...versions]));
  const graph: DependencyGraph = new Map(root.graph);
  for (const [name, edges] of own.graph) graph.set(name, new Set([...(graph.get(name) ?? []), ...edges]));
  return { resolved, graph };
}
