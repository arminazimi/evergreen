import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { ScalaDetector, scalaDetector } from "../src/detectors/scala/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/scala");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-scala-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/scala.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    migration: rule.migration!,
    sources: rule.sources,
  };
}

test("scala passes detector conformance on every fixture", async () => {
  const rules = await committedRules();
  const eol211 = rules.find((rule) => rule.id === "scala.runtime.eol-2.11")!;
  const eolSbt = rules.find((rule) => rule.id === "scala.sbt.eol-0.13")!;

  await runDetectorConformance({
    detector: scalaDetector,
    fixtures: [
      {
        name: "scala positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(eol211, ".scala-version", 1, `.scala-version pins Scala 2.11.12. ${eol211.summary}`),
          expected(eol211, "build.sbt", 7, `build.sbt declares Scala 2.11.12. ${eol211.summary}`),
          expected(eolSbt, "project/build.properties", 1, `project/build.properties pins sbt 0.13.18. ${eolSbt.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });

  await runDetectorConformance({
    detector: scalaDetector,
    fixtures: [
      { name: "scala negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "scala zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });

  await runDetectorConformance({
    detector: scalaDetector,
    fixtures: [{ name: "scala malformed input", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("a build.sbt scalaVersion constraint is not a version pin, and an exact pin is", async () => {
  const root = await repository({
    "build.sbt": 'scalaVersion := "2.11"\n',
  });
  assert.deepEqual(await scalaDetector.scan({ root }), []);

  const pinned = await repository({
    "build.sbt": 'scalaVersion := "2.11.12"\n',
  });
  assert.deepEqual(
    (await scalaDetector.scan({ root: pinned })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [["scala.runtime.eol-2.11", "build.sbt", 1]],
  );
});

test("Scala 3.0–3.2 pins match the end-of-support rule", async () => {
  const root = await repository({
    ".scala-version": "3.1.3\n",
  });
  assert.deepEqual(
    (await scalaDetector.scan({ root })).map((finding) => finding.ruleId),
    ["scala.runtime.eos-3.0-3.2"],
  );
});

test("build.properties outside project/ is not read", async () => {
  const root = await repository({
    "build.properties": "sbt.version=0.13.18\n",
  });
  assert.deepEqual(await scalaDetector.scan({ root }), []);
});

test("a migration packet for a Scala finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [scalaDetector]);
  const finding = result.findings.find((item) => item.id === "scala.runtime.eol-2.11:.scala-version:1");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes(".scala-version"));
  assert.ok(packet.steps.some((step) => step.id === "update-scala-declaration"));
  assert.ok(packet.verification.some((check) => check.command === "scala -version"));
});

test("the detector is registered and Scala is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "scala"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "scala"), {
    id: "scala",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["scala"],
  });
});

test("injected rules still match only by Package URL", async () => {
  const detector = new ScalaDetector(async () => [
    {
      id: "scala.runtime.example",
      ecosystem: "scala",
      purl: "pkg:generic/scala",
      vers: "vers:semver/>=2.10.0|<2.11.0",
      event: "end-of-life",
      title: "Scala 2.10 example",
      summary: "Example.",
      severity: "high",
      sources: [{ title: "Example", url: "https://example.com/scala" }],
      provenance: { observedAt: "2026-10-27", reviewedAt: "2026-10-27", reviewer: "test" },
    },
  ]);
  const root = await repository({
    ".scala-version": "2.10.7\n",
    "project/build.properties": "sbt.version=0.13.18\n",
  });
  assert.deepEqual(
    (await detector.scan({ root })).map((finding) => finding.ruleId),
    ["scala.runtime.example"],
  );
});
