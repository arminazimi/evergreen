import { addEdges, addResolved } from "./shared.js";
import type { LockData } from "./shared.js";

function packageNameFromYarnSelector(selector: string): string | undefined {
  const clean = selector.trim().replace(/^"|"$/g, "");
  const separator = clean.startsWith("@") ? clean.indexOf("@", clean.indexOf("/") + 1) : clean.indexOf("@");
  return separator > 0 ? clean.slice(0, separator) : undefined;
}

/** Reads the classic Yarn v1 text format, without a YAML parser. */
export function parseYarnLock(contents: string, { versions: target, graph }: LockData): void {
  let names: string[] = [];
  let inDependencies = false;
  for (const line of contents.split(/\r?\n/)) {
    if (line && !/^\s/.test(line) && line.endsWith(":")) {
      names = line
        .slice(0, -1)
        .split(",")
        .map(packageNameFromYarnSelector)
        .filter((name): name is string => Boolean(name));
      inDependencies = false;
      continue;
    }
    if (/^ {2}\S/.test(line)) inDependencies = /^ {2}(?:dependencies|optionalDependencies):\s*$/.test(line);
    const dependency = inDependencies ? /^ {4}"?([^"\s:]+)"?/.exec(line)?.[1] : undefined;
    if (dependency) for (const name of names) addEdges(graph, name, { [dependency]: true });
    const match = /^\s+version\s+["']?([^"'\s]+)["']?/.exec(line);
    if (match?.[1]) {
      for (const name of names) addResolved(target, name, match[1]);
    }
  }
}
