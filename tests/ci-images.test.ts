import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { azureImageIdentity, ciImagesDetector, imageComponent } from "../src/detectors/ci-images/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/ci-images");
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

async function expected(ruleId: string, path: string, line: number, value: string): Promise<DetectorFinding> {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/ci-images.json", "utf8")));
  const rule = registry.rules.find((item) => item.id === ruleId)!;
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    title: rule.title,
    summary: `${path} uses ${value}. ${rule.summary}`,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

test("ci-images passes detector conformance on every fixture", async () => {
  await runDetectorConformance({
    detector: ciImagesDetector,
    fixtures: [
      { name: "ci-images zero findings", root: resolve(fixtures, "zero"), expectedFindings: [] },
      { name: "ci-images positive declarations", root: resolve(fixtures, "positive"), expectedFindings: [] },
      { name: "ci-images negative declarations", root: resolve(fixtures, "negative"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck, evidenceCheck],
  });

  await runDetectorConformance({
    detector: ciImagesDetector,
    fixtures: [{ name: "ci-images malformed input", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("the detector is registered with the built-in detectors", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "ci-images"));
});

test("Azure hosted image labels match the reviewed rules at their exact lines", async () => {
  const contents = [
    "pool:",
    "  vmImage: macos-14",
    "stages:",
    "  - stage: Test",
    "    pool:",
    "      vmImage: ubuntu-22.04",
    "    jobs:",
    "      - job: Build",
    "        pool:",
    "          vmImage: windows-2019",
    "",
  ].join("\n");
  const root = await repository({ "azure-pipelines.yml": contents });
  assert.deepEqual(await ciImagesDetector.scan({ root }), [
    await expected("ci-images.azure-pipelines.macos-14", "azure-pipelines.yml", 2, "macos-14"),
    await expected("ci-images.azure-pipelines.ubuntu-22.04", "azure-pipelines.yml", 6, "ubuntu-22.04"),
  ]);
});

test("labels match without regard to case, and a size suffix is a different image", async () => {
  const mixedCase = await repository({ "azure-pipelines.yml": "pool:\n  vmImage: MACOS-14\n" });
  assert.equal((await ciImagesDetector.scan({ root: mixedCase })).length, 1);

  const suffixed = await repository({ "azure-pipelines.yml": "pool:\n  vmImage: macos-14-arm64\n" });
  assert.deepEqual(await ciImagesDetector.scan({ root: suffixed }), []);

  const unlisted = await repository({ "azure-pipelines.yml": "pool:\n  vmImage: ubuntu-latest\n" });
  assert.deepEqual(await ciImagesDetector.scan({ root: unlisted }), []);
});

test("Azure labels normalize to the registry mapping in decision 0014", () => {
  assert.deepEqual(azureImageIdentity("ubuntu-22.04"), {
    purl: "pkg:generic/azure-pipelines/ubuntu-image",
    version: "22.04",
  });
  assert.deepEqual(azureImageIdentity("macos-14"), { purl: "pkg:generic/azure-pipelines/macos-image", version: "14" });
  assert.deepEqual(azureImageIdentity("windows-2019"), {
    purl: "pkg:generic/azure-pipelines/windows-image",
    version: "2019",
  });
  for (const label of ["ubuntu-latest", "macos-14-arm64", "ubuntu", "", "$(vmImage)", "custom-image:1"]) {
    assert.equal(azureImageIdentity(label), undefined, label);
  }
  assert.equal(imageComponent("cimg/node:14.21"), "cimg/node");
  assert.equal(imageComponent("node:16.20.2"), "node");
  assert.equal(imageComponent("ubuntu-2004:202201-01"), "ubuntu-2004");
  assert.equal(imageComponent("circleci/node@5.1.0"), "circleci/node");
  assert.equal(imageComponent("$(vmImage)"), "$(vmImage)");
});

test("GitLab references, orbs, dynamic values, and floating aliases are unclassified, never findings", async () => {
  const positive = await ciImagesDetector.analyze({ root: resolve(fixtures, "positive") });
  assert.deepEqual(positive.findings, []);
  assert.deepEqual(
    positive.unclassified.map((reference) => [reference.location.path, reference.location.line, reference.reference, reference.reason]),
    [
      [".circleci/config.yml", 3, "circleci/node@5.1.0", "the orb's contents are not resolved, so its version is not an image lifecycle claim"],
      [".gitlab-ci.yml", 1, "node:16.20.2", "GitLab CI image references are not judged against lifecycle rules in this version"],
      [".gitlab-ci.yml", 4, "postgres:12.17", "GitLab CI image references are not judged against lifecycle rules in this version"],
      [".gitlab-ci.yml", 5, "redis:6.2.14", "GitLab CI image references are not judged against lifecycle rules in this version"],
      [".gitlab-ci.yml", 8, "python:3.9.18", "GitLab CI image references are not judged against lifecycle rules in this version"],
    ],
  );
  assert.equal(positive.unclassified[0]!.component, "circleci/node");
  assert.equal(positive.unclassified[1]!.component, "node");

  const negative = await ciImagesDetector.analyze({ root: resolve(fixtures, "negative") });
  assert.deepEqual(negative.findings, []);
  const dynamic = negative.unclassified.filter((reference) => reference.reason.startsWith("the value is a CI variable"));
  const floating = negative.unclassified.filter((reference) => reference.reason.startsWith("the value is a floating alias"));
  assert.equal(dynamic.length, 10);
  assert.equal(floating.length, 5);
  assert.ok(
    negative.unclassified.some((reference) => reference.location.path === "azure-pipelines.yml" && reference.location.line === 12),
  );
  assert.ok(
    negative.unclassified.some((reference) => reference.location.path === ".gitlab-ci.yml" && reference.location.line === 4),
  );

  const zero = await ciImagesDetector.analyze({ root: resolve(fixtures, "zero") });
  assert.deepEqual(zero.findings, []);
  assert.deepEqual(
    zero.unclassified.map((reference) => reference.location.line),
    [2, 5, 1, 3, 5],
  );
});

test("a literal image with no reviewed rule is not described as retired", async () => {
  const root = await repository({
    ".circleci/config.yml": "version: 2.1\njobs:\n  build:\n    docker:\n      - image: cimg/node:14.21\n",
  });
  const analysis = await ciImagesDetector.analyze({ root });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified, []);
});

test("configurations are only read at the repository root", async () => {
  const root = await repository({ "apps/api/azure-pipelines.yml": "pool:\n  vmImage: macos-14\n" });
  assert.deepEqual(await ciImagesDetector.scan({ root }), []);
});
