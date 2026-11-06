import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { DETECTOR_LIMITS } from "../../sdk.js";
import type { ConformanceCheck } from "../index.js";

export const CONFORMANCE_MAXIMUM_FILE_BYTES = DETECTOR_LIMITS.maximumFileBytes;
export const CONFORMANCE_MAXIMUM_DIRECTORY_DEPTH = DETECTOR_LIMITS.maximumDirectoryDepth;

const vendoredDirectories = new Set(DETECTOR_LIMITS.vendoredDirectories);

export const boundsCheck: ConformanceCheck = {
  guarantee: "bounded discovery",
  async run({ detector, fixture }) {
    const findings = await detector.scan({ root: fixture.root });

    for (const finding of findings) {
      const segments = finding.location.path.split(/[\\/]/).filter(Boolean);
      const directories = segments.slice(0, -1);
      const vendoredDirectory = directories.find((segment) => vendoredDirectories.has(segment));
      if (vendoredDirectory) {
        throw new Error(`finding "${finding.id}" came from vendored directory "${vendoredDirectory}"`);
      }
      if (directories.length > CONFORMANCE_MAXIMUM_DIRECTORY_DEPTH) {
        throw new Error(
          `finding "${finding.id}" exceeds the directory depth limit of ${CONFORMANCE_MAXIMUM_DIRECTORY_DEPTH}`,
        );
      }

      const root = resolve(fixture.root);
      const target = resolve(root, finding.location.path);
      const pathFromRoot = relative(root, target);
      if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
        throw new Error(`finding "${finding.id}" points outside the repository`);
      }

      const metadata = await stat(target);
      if (metadata.size > CONFORMANCE_MAXIMUM_FILE_BYTES) {
        throw new Error(`finding "${finding.id}" came from a file larger than ${CONFORMANCE_MAXIMUM_FILE_BYTES} bytes`);
      }
    }
  },
};
