import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { ConformanceCheck } from "../index.js";

function isInsideRepository(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot !== "" &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

export const locationsCheck: ConformanceCheck = {
  guarantee: "existing repository-relative locations",
  async run({ detector, fixture }) {
    const findings = await detector.scan({ root: fixture.root });

    for (const finding of findings) {
      const { path, line } = finding.location;
      if (path.length === 0 || isAbsolute(path)) {
        throw new Error(`finding "${finding.id}" has a non-relative path: ${JSON.stringify(path)}`);
      }
      if (!Number.isInteger(line) || line === undefined || line < 1) {
        throw new Error(`finding "${finding.id}" does not have a 1-based line`);
      }

      const target = resolve(fixture.root, path);
      if (!isInsideRepository(resolve(fixture.root), target)) {
        throw new Error(`finding "${finding.id}" points outside the repository: ${path}`);
      }

      let contents: string;
      try {
        const metadata = await stat(target);
        if (!metadata.isFile()) throw new Error("location is not a file");
        contents = await readFile(target, "utf8");
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`finding "${finding.id}" points to a missing file: ${path} (${detail})`);
      }

      const lineCount = contents.split(/\r?\n/).length;
      if (line > lineCount) {
        throw new Error(
          `finding "${finding.id}" points to line ${line}, but ${path} has ${lineCount} lines`,
        );
      }
    }
  },
};
