import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { ScanResult } from "./domain.js";
import type { Detector } from "./sdk.js";
import { builtInDetectors } from "./detectors/index.js";
import { scanRepository } from "./engine.js";

/** In-memory demo fixture files. Shipped in code so scanners do not flag Evergreen itself. */
export const DEMO_FILES: Readonly<Record<string, string>> = Object.freeze({
  "package.json": `${JSON.stringify(
    {
      name: "evergreen-demo",
      private: true,
      engines: {
        node: ">=18",
      },
      dependencies: {
        request: "2.88.2",
      },
    },
    null,
    2,
  )}\n`,
  ".github/workflows/ci.yml": `name: Demo CI

on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node --test
`,
  "src/client.js": `import request from "request";

export function fetchStatus(url, callback) {
  request.get(url, callback);
}
`,
});

/**
 * Scans an in-memory fixture by staging its files in a temporary directory,
 * running the configured detectors, and presenting the findings under a stable "demo" root.
 */
export async function scanDemo(
  detectors: readonly Detector[] = builtInDetectors,
): Promise<ScanResult> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-demo-"));
  try {
    for (const [relativePath, content] of Object.entries(DEMO_FILES)) {
      const target = join(directory, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    const result = await scanRepository(directory, detectors);
    return {
      ...result,
      root: "demo",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
