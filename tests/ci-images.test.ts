import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { CiImagesDetector } from "../src/detectors/ci-images/index.js";
import type { RegistryV2Rule } from "../src/registry.js";

const fixtures = resolve("tests/fixtures/ci-images");
const detector = new CiImagesDetector();

test("ci-images passes detector conformance on every fixture", async () => {
  await runDetectorConformance({
    detector,
    fixtures: [
      { name: "ci-images positive", root: resolve(fixtures, "positive"), expectedFindings: [] },
      { name: "ci-images negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "ci-images zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector,
    fixtures: [{ name: "ci-images malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

const ubuntuRule: RegistryV2Rule = {
  id: "ci-images.azure-pipelines.ubuntu-20.04",
  ecosystem: "ci-images",
  purl: "pkg:generic/azure-pipelines/ubuntu-image",
  vers: "vers:intdot/20.04",
  event: "removed",
  title: "Ubuntu 20.04 hosted image is retired",
  summary: "The Ubuntu 20.04 hosted image was retired.",
  severity: "high",
  replacement: "ubuntu-latest",
  sources: [{ title: "Microsoft-hosted image deprecation schedule", url: "https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule" }],
  provenance: { observedAt: "2026-10-18", reviewedAt: "2026-10-18", reviewer: "test" },
};

test("an Azure vmImage matches a rule for its image family and version", async () => {
  const findings = await new CiImagesDetector(async () => [ubuntuRule]).scan({ root: resolve(fixtures, "positive") });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [
    ["ci-images.azure-pipelines.ubuntu-20.04", "azure-pipelines.yml", 2],
  ]);
});

test("GitLab and CircleCI references are unclassified, never findings", async () => {
  const analysis = await detector.analyze({ root: resolve(fixtures, "positive") });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified.map((item) => [item.location.path, item.location.line, item.reason]), [
    [".circleci/config.yml", 3, "orb-not-resolved"],
    [".gitlab-ci.yml", 1, "gitlab-not-judged"],
    [".gitlab-ci.yml", 4, "gitlab-not-judged"],
    [".gitlab-ci.yml", 5, "gitlab-not-judged"],
    [".gitlab-ci.yml", 8, "gitlab-not-judged"],
  ]);
});
