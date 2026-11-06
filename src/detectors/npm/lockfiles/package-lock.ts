import { addEdges, addResolved } from "./shared.js";
import type { LockData } from "./shared.js";

function packageNameFromNodeModulesPath(path: string): string | undefined {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return index === -1 ? undefined : path.slice(index + marker.length);
}

/** Reads `package-lock.json` and `npm-shrinkwrap.json`, which share one format. */
export function parsePackageLock(contents: string, { versions: target, graph }: LockData): void {
  let lock: {
    packages?: Record<
      string,
      {
        name?: string;
        version?: string;
        dependencies?: Record<string, unknown>;
        optionalDependencies?: Record<string, unknown>;
      }
    >;
    dependencies?: Record<string, unknown>;
  };
  try {
    lock = JSON.parse(contents) as typeof lock;
  } catch {
    // A lockfile that does not parse resolves nothing; it never fails the scan.
    return;
  }
  if (!lock || typeof lock !== "object") return;

  for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
    const name = metadata.name ?? packageNameFromNodeModulesPath(path);
    if (!name) continue;
    addResolved(target, name, metadata.version);
    addEdges(graph, name, metadata.dependencies, metadata.optionalDependencies);
  }

  const visit = (dependencies: Record<string, unknown> | undefined): void => {
    for (const [name, rawMetadata] of Object.entries(dependencies ?? {})) {
      if (!rawMetadata || typeof rawMetadata !== "object") continue;
      const metadata = rawMetadata as {
        version?: string;
        requires?: Record<string, unknown>;
        dependencies?: Record<string, unknown>;
      };
      addResolved(target, name, metadata.version);
      addEdges(graph, name, metadata.requires);
      visit(metadata.dependencies);
    }
  };
  visit(lock.dependencies);
}
