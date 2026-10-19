import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

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
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-ci-images-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

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

const rule = (id: string, family: string, version: string): RegistryV2Rule => ({
  id,
  ecosystem: "ci-images",
  purl: `pkg:generic/azure-pipelines/${family}-image`,
  vers: `vers:intdot/${version}`,
  event: "removed",
  title: `${family} ${version} hosted image is retired`,
  summary: `The ${family} ${version} hosted image was retired.`,
  severity: "high",
  replacement: "latest",
  sources: [{ title: "Microsoft-hosted image deprecation schedule", url: "https://learn.microsoft.com/azure/devops/pipelines/agents/hosted-deprecation-schedule" }],
  provenance: { observedAt: "2026-10-18", reviewedAt: "2026-10-18", reviewer: "test" },
});

test("an Azure vmImage matches a rule for its image family and version", async () => {
  const findings = await new CiImagesDetector(async () => [ubuntuRule]).scan({ root: resolve(fixtures, "positive") });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [
    ["ci-images.azure-pipelines.ubuntu-20.04", "azure-pipelines.yml", 2],
  ]);
});

test("Azure vmImage matching is case-insensitive and rejects suffixes", async () => {
  const root = await repository({
    "azure-pipelines.yml": `jobs:\n  - job: A\n    pool:\n      vmImage: Ubuntu-22.04\n  - job: B\n    pool:\n      vmImage: MACOS-14\n  - job: C\n    pool:\n      vmImage: ubuntu-22.04-arm64\n`,
  });
  const findings = await new CiImagesDetector(async () => [
    rule("ci-images.azure-pipelines.ubuntu-22.04", "ubuntu", "22.04"),
    rule("ci-images.azure-pipelines.macos-14", "macos", "14"),
  ]).scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [
    ["ci-images.azure-pipelines.ubuntu-22.04", 4],
    ["ci-images.azure-pipelines.macos-14", 7],
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
