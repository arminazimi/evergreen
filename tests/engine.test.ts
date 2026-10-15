import assert from "node:assert/strict";
import { test } from "node:test";

import { scanRepository } from "../src/engine.js";
import { renderJson, renderText } from "../src/reporters.js";
import { DETECTOR_API_VERSION } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";

test("scan result is deterministic apart from its timestamp", async () => {
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    async scan() {
      return [
        {
          id: "fixture:two",
          ruleId: "two",
          title: "Second",
          summary: "Second finding",
          severity: "low",
          location: { path: "b.txt" },
          sources: [{ title: "Official source", url: "https://example.com/two" }],
        },
        {
          id: "fixture:one",
          ruleId: "one",
          title: "First",
          summary: "First finding",
          severity: "high",
          location: { path: "a.txt", line: 4 },
          sources: [{ title: "Official source", url: "https://example.com/one" }],
          usages: [
            {
              kind: "call",
              language: "typescript",
              symbol: "example.run",
              location: { path: "src/example.ts", line: 3, column: 1 },
              excerpt: "example.run();",
            },
          ],
          impact: { usageCount: 1, affectedFiles: 1, level: "low" },
        },
      ];
    },
  };

  const result = await scanRepository(".", [detector]);

  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    ["fixture:one", "fixture:two"],
  );
  assert.match(renderText(result), /HIGH First/);
  assert.match(renderText(result), /Impact: low \(1 usages across 1 files\)/);
  assert.match(renderText(result), /src\/example\.ts:3/);
  assert.equal(JSON.parse(renderJson(result)).schemaVersion, "evergreen.scan.v1");
});

test("scan without detectors explains the current state", async () => {
  const result = await scanRepository(".");

  assert.equal(result.findings.length, 0);
  assert.equal(result.diagnostics.length, 1);
});

test("reports optional detector classifications in JSON and text", async () => {
  const detector: Detector = {
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    async scan() {
      return [];
    },
    async analyze() {
      return {
        findings: [],
        unclassified: [{
          component: "owner/action",
          reference: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          reason: "unknown-sha",
          location: { path: ".github/workflows/ci.yml", line: 4 },
        }],
      };
    },
  };

  const result = await scanRepository(".", [detector]);
  const json = JSON.parse(renderJson(result)) as { unclassified: { count: number; references: unknown[] } };

  assert.equal(json.unclassified.count, 1);
  assert.equal(json.unclassified.references.length, 1);
  assert.match(renderText(result), /Unclassified: 1 pinned reference \(use JSON output for details\)/);
});
