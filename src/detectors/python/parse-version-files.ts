import { resolve } from "node:path";

import type { Declaration } from "./types.js";
import { readOptional } from "./shared.js";

export async function collectVersionFiles(root: string): Promise<Declaration[]> {
  const declarations: Declaration[] = [];
  for (const name of [".python-version", "runtime.txt"] as const) {
    const path = resolve(root, name);
    const contents = await readOptional(path);
    for (const [index, rawLine] of (contents ?? "").split(/\r?\n/).entries()) {
      const value = rawLine.replace(/#.*$/, "").trim();
      if (/^(?:python-)?\d+\.\d+(?:\.\d+)?$/i.test(value)) {
        declarations.push({ path, line: index + 1, value, kind: "pinned runtime" });
      }
    }
  }
  const toolVersionsPath = resolve(root, ".tool-versions");
  const toolVersions = await readOptional(toolVersionsPath);
  if (toolVersions) {
    for (const [index, line] of toolVersions.split(/\r?\n/).entries()) {
      const match = /^python\s+(.+)$/i.exec(line.trim());
      if (match?.[1]) {
        declarations.push({
          path: toolVersionsPath,
          line: index + 1,
          value: match[1],
          kind: "pinned runtime",
        });
      }
    }
  }
  return declarations;
}
