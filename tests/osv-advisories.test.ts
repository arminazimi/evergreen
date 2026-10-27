import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { scanRepository } from "../src/engine.js";
import { advisoryIdsByRuleId } from "../src/osv-advisories.js";
import { DETECTOR_API_VERSION, defineDetector } from "../src/sdk.js";
import type { Detector } from "../src/sdk.js";

test("bundled OSV data maps lifecycle rule ids to unfixed advisory ids", async () => {
  const map = await advisoryIdsByRuleId();
  assert.deepEqual(map.get("npm.package.request.deprecated"), ["GHSA-p8p7-x288-28g6"]);
  assert.ok((map.get("python.package.pycrypto.obsolete") ?? []).includes("GHSA-6528-wvf6-f6qg"));
});

test("a scan finding lists advisoryIds when the OSV registry has them for its rule", async () => {
  const detector: Detector = defineDetector({
    apiVersion: DETECTOR_API_VERSION,
    id: "fixture",
    async scan() {
      return [
        {
          id: "npm.package.request.deprecated:package.json:1",
          ruleId: "npm.package.request.deprecated",
          title: "request is deprecated",
          summary: "fixture",
          severity: "high",
          location: { path: "package.json", line: 1 },
          sources: [{ title: "npm", url: "https://www.npmjs.com/package/request" }],
        },
        {
          id: "npm.package.left-pad.deprecated:package.json:2",
          ruleId: "npm.package.left-pad.deprecated",
          title: "left-pad is deprecated",
          summary: "fixture without advisories",
          severity: "medium",
          location: { path: "package.json", line: 2 },
          sources: [{ title: "npm", url: "https://www.npmjs.com/package/left-pad" }],
        },
      ];
    },
  });

  const directory = await mkdtemp(join(tmpdir(), "evergreen-osv-"));
  try {
    await writeFile(join(directory, "package.json"), "{}\n");
    const result = await scanRepository(directory, [detector]);
    const request = result.findings.find((finding) => finding.ruleId === "npm.package.request.deprecated");
    const leftPad = result.findings.find((finding) => finding.ruleId === "npm.package.left-pad.deprecated");
    assert.deepEqual(request?.advisoryIds, ["GHSA-p8p7-x288-28g6"]);
    assert.equal(leftPad?.advisoryIds, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
