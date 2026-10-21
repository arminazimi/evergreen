import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

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

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

test("ci-images passes detector conformance on every fixture", async () => {
  const rules = validateRegistryV2(JSON.parse(await readFile("registry/ci-images.json", "utf8"))).rules;
  const ubuntu2004 = rules.find((rule) => rule.id === "ci-images.azure-pipelines.ubuntu-20.04")!;
  const windows2019 = rules.find((rule) => rule.id === "ci-images.azure-pipelines.windows-2019")!;
  await runDetectorConformance({
    detector,
    fixtures: [
      {
        name: "ci-images positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(ubuntu2004, "azure-pipelines.yml", 2, `azure-pipelines.yml uses vmImage ubuntu-20.04. ${ubuntu2004.summary}`),
          expected(windows2019, "azure-pipelines.yml", 7, `azure-pipelines.yml uses vmImage windows-2019. ${windows2019.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });
  await runDetectorConformance({
    detector,
    fixtures: [
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

test("GitLab and CircleCI references stay unclassified while retired Azure labels are findings", async () => {
  const rules = validateRegistryV2(JSON.parse(await readFile("registry/ci-images.json", "utf8"))).rules;
  const ubuntu2004 = rules.find((rule) => rule.id === "ci-images.azure-pipelines.ubuntu-20.04")!;
  const windows2019 = rules.find((rule) => rule.id === "ci-images.azure-pipelines.windows-2019")!;
  const analysis = await detector.analyze({ root: resolve(fixtures, "positive") });
  assert.deepEqual(analysis.findings.map((finding) => finding.ruleId), [ubuntu2004.id, windows2019.id]);
  assert.deepEqual(analysis.unclassified.map((item) => [item.location.path, item.location.line, item.reason]), [
    [".circleci/config.yml", 3, "orb-not-resolved"],
    [".gitlab-ci.yml", 1, "gitlab-not-judged"],
    [".gitlab-ci.yml", 4, "gitlab-not-judged"],
    [".gitlab-ci.yml", 5, "gitlab-not-judged"],
    [".gitlab-ci.yml", 8, "gitlab-not-judged"],
  ]);
});

test("every curated ci-images rule has migration guidance with real verification commands", async () => {
  const rules = validateRegistryV2(JSON.parse(await readFile("registry/ci-images.json", "utf8"))).rules;
  assert.equal(rules.length, 5);
  for (const rule of rules) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(
      rule.migration.verification.some((check) => check.command === "gitlab-ci-lint || circleci config validate"),
      rule.id,
    );
  }
});

test("a migration packet for an Azure hosted-image finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [detector]);
  const finding = result.findings.find((item) => item.id === "ci-images.azure-pipelines.ubuntu-20.04:azure-pipelines.yml:2");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("azure-pipelines.yml"));
  assert.ok(packet.steps.some((step) => step.id === "retarget-vm-image"));
  assert.ok(packet.steps.some((step) => step.id === "align-vm-image-surfaces"));
  assert.ok(packet.verification.some((check) => check.command === "gitlab-ci-lint || circleci config validate"));
});
