import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { ConformanceError, runDetectorConformance } from "../src/conformance/index.js";
import { githubActionsDetector } from "../src/detectors/github-actions.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureDirectory(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-conformance-"));
  temporaryRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, contents);
  }

  return root;
}

test("runs the harness against a built-in detector", async () => {
  const root = await fixtureDirectory({
    ".github/workflows/ci.yml": "steps:\n  - uses: actions/checkout@v5\n",
  });

  await runDetectorConformance({
    detector: githubActionsDetector,
    fixtures: [{ name: "supported checkout", root, expectedFindings: [] }],
  });
});

test("names the violated guarantee when a detector fails conformance", async () => {
  const root = await fixtureDirectory({ "fixture.txt": "fixture\n" });
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "broken-sample",
    async scan() {
      return [
        {
          id: "unexpected",
          ruleId: "unexpected",
          title: "Unexpected",
          summary: "Unexpected finding",
          severity: "low",
          location: { path: "fixture.txt", line: 1 },
          sources: [{ title: "Official source", url: "https://example.com" }],
        },
      ];
    },
  };

  await assert.rejects(
    runDetectorConformance({
      detector,
      fixtures: [{ name: "clean repository", root, expectedFindings: [] }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConformanceError);
      assert.equal(error.guarantee, "expected findings");
      assert.match(error.message, /broken-sample/);
      assert.match(error.message, /clean repository/);
      return true;
    },
  );
});
