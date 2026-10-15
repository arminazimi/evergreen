import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
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

test("catches a detector with non-deterministic ordered output", async () => {
  const root = await fixtureDirectory({ "fixture.txt": "fixture\n" });
  let scanCount = 0;
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "non-deterministic-sample",
    async scan() {
      scanCount += 1;
      if (scanCount < 3) return [];
      return [
        {
          id: "appeared-later",
          ruleId: "appeared-later",
          title: "Appeared later",
          summary: "This finding is not stable across scans.",
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
      fixtures: [{ name: "same input", root, expectedFindings: [] }],
      checks: [determinismCheck],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConformanceError);
      assert.equal(error.guarantee, "deterministic findings");
      return true;
    },
  );
});

test("catches a detector that reports a location that does not exist", async () => {
  const root = await fixtureDirectory({ "present.txt": "one line\n" });
  const missingLocationFinding = {
    id: "missing-location",
    ruleId: "missing-location",
    title: "Missing location",
    summary: "The reported file does not exist.",
    severity: "low" as const,
    location: { path: "missing.txt", line: 1 },
    sources: [{ title: "Official source", url: "https://example.com" }],
  };
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "invalid-location-sample",
    async scan() {
      return [missingLocationFinding];
    },
  };

  await assert.rejects(
    runDetectorConformance({
      detector,
      fixtures: [{ name: "missing file", root, expectedFindings: [missingLocationFinding] }],
      checks: [locationsCheck],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConformanceError);
      assert.equal(error.guarantee, "existing repository-relative locations");
      assert.match(error.message, /missing\.txt/);
      return true;
    },
  );
});

test("catches a detector that reports a finding without authoritative evidence", async () => {
  const root = await fixtureDirectory({ "fixture.txt": "fixture\n" });
  const unsupportedFinding = {
    id: "unsupported-claim",
    ruleId: "unsupported-claim",
    title: "Unsupported claim",
    summary: "This lifecycle claim has no evidence.",
    severity: "low" as const,
    location: { path: "fixture.txt", line: 1 },
    sources: [],
  };
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "missing-evidence-sample",
    async scan() {
      return [unsupportedFinding];
    },
  };

  await assert.rejects(
    runDetectorConformance({
      detector,
      fixtures: [{ name: "unsupported claim", root, expectedFindings: [unsupportedFinding] }],
      checks: [evidenceCheck],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConformanceError);
      assert.equal(error.guarantee, "authoritative evidence");
      assert.match(error.message, /unsupported-claim/);
      return true;
    },
  );
});

test("catches a detector that reports a finding for a zero-finding fixture", async () => {
  const root = await fixtureDirectory({ "supported.txt": "supported\n" });
  let scanCount = 0;
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "false-positive-sample",
    async scan() {
      scanCount += 1;
      if (scanCount === 1) return [];
      return [
        {
          id: "false-positive",
          ruleId: "false-positive",
          title: "False positive",
          summary: "A supported fixture must stay clean.",
          severity: "low",
          location: { path: "supported.txt", line: 1 },
          sources: [{ title: "Official source", url: "https://example.com" }],
        },
      ];
    },
  };

  await assert.rejects(
    runDetectorConformance({
      detector,
      fixtures: [{ name: "supported input", root, expectedFindings: [] }],
      checks: [zeroFindingsCheck],
    }),
    (error: unknown) => {
      assert.ok(error instanceof ConformanceError);
      assert.equal(error.guarantee, "zero-finding fixture");
      return true;
    },
  );
});
