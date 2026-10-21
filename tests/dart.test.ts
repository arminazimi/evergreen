import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { DartDetector, dartDetector } from "../src/detectors/dart/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/dart");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-dart-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/dart.json", "utf8"))).rules;
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

function rule(overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule {
  return {
    id: "dart.package.example-widgets.discontinued",
    ecosystem: "dart",
    purl: "pkg:pub/example_widgets",
    vers: "vers:semver/*",
    event: "deprecated",
    title: "example_widgets is discontinued",
    summary: "The publisher discontinued the package on pub.dev.",
    severity: "medium",
    replacement: "example_widgets_plus",
    sources: [{ title: "pub.dev package page", url: "https://pub.dev/packages/example_widgets" }],
    provenance: { observedAt: "2026-10-21", reviewedAt: "2026-10-21", reviewer: "test" },
    ...overrides,
  };
}

const POSITIVE = {
  "pubspec.yaml": "name: app\nenvironment:\n  sdk: 3.8.1\n  flutter: 3.29.0\ndependencies:\n  http: ^1.0.0\n",
};

test("dart passes detector conformance on every fixture", async () => {
  const dart38 = (await committedRules()).find((item) => item.id === "dart.sdk.end-of-support-3.8")!;
  const positiveRoot = await repository(POSITIVE);
  await runDetectorConformance({
    detector: dartDetector,
    fixtures: [
      {
        name: "dart positive",
        root: positiveRoot,
        expectedFindings: [expected(dart38, "pubspec.yaml", 3, `pubspec.yaml declares Dart SDK 3.8.1. ${dart38.summary}`)],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: dartDetector,
    fixtures: [
      { name: "dart negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "dart zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: dartDetector,
    fixtures: [{ name: "dart malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("the old-SDK positive fixture matches no committed rule because a range admits newer SDKs", async () => {
  assert.deepEqual(await dartDetector.scan({ root: resolve(fixtures, "positive") }), []);
});

test("is registered as a built-in detector", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "dart"));
});

test("reports an exact Dart SDK pin and ignores a constraint that admits newer SDKs", async () => {
  const findings = await dartDetector.scan({ root: await repository({ "pubspec.yaml": "environment:\n  sdk: \">=3.8.0 <4.0.0\"\n" }) });
  assert.deepEqual(findings, []);
  const pinned = await dartDetector.scan({ root: await repository(POSITIVE) });
  assert.deepEqual(pinned.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["dart.sdk.end-of-support-3.8", "pubspec.yaml", 3]]);
});

test("reports a Flutter version pinned in .fvmrc and .fvm/fvm_config.json", async () => {
  const detector = new DartDetector(async () => [rule({ id: "dart.flutter.old", purl: "pkg:generic/flutter", vers: "vers:semver/<3.30.0", event: "end-of-support" })]);
  const findings = await detector.scan({
    root: await repository({
      ".fvmrc": '{\n  "flutter": "3.29.0"\n}\n',
      "app/.fvm/fvm_config.json": '{\n  "flutterSdkVersion": "3.29.1"\n}\n',
      "other/fvm_config.json": '{\n  "flutterSdkVersion": "3.29.1"\n}\n',
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line]), [
    [".fvmrc", 2],
    ["app/.fvm/fvm_config.json", 2],
  ]);
  assert.match(findings[0]!.summary, /^\.fvmrc pins Flutter 3\.29\.0\./);
});

test("matches a discontinued package in pubspec.yaml and pubspec.lock", async () => {
  const detector = new DartDetector(async () => [rule()]);
  const root = await repository({
    "pubspec.yaml": "name: app\ndependencies:\n  example_widgets: ^2.1.0\n  http: ^1.0.0\n",
    "pubspec.lock": 'packages:\n  example_widgets:\n    dependency: "direct main"\n    description:\n      name: example_widgets\n      url: "https://pub.dev"\n    source: hosted\n    version: "2.1.4"\nsdks:\n  dart: ">=3.13.0 <4.0.0"\n',
  });
  const findings = await detector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line]), [
    ["pubspec.lock", 8],
    ["pubspec.yaml", 3],
  ]);
  assert.match(findings[0]!.summary, /^pubspec\.lock resolves example_widgets 2\.1\.4\./);
  assert.match(findings[1]!.summary, /^pubspec\.yaml depends on example_widgets \^2\.1\.0\./);
});

test("a package rule limited to a version range matches only a resolved version inside it", async () => {
  const detector = new DartDetector(async () => [rule({ vers: "vers:semver/<2.0.0" })]);
  const root = await repository({
    "pubspec.yaml": "dependencies:\n  example_widgets: ^1.0.0\n",
    "pubspec.lock": 'packages:\n  example_widgets:\n    dependency: "direct main"\n    description:\n      name: example_widgets\n      url: "https://pub.dev"\n    source: hosted\n    version: "1.4.0"\n',
  });
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.location.path), ["pubspec.lock"]);
});

test("a malformed VERS rule never matches and does not hide a later rule", async () => {
  const detector = new DartDetector(async () => [rule({ id: "dart.package.bad", vers: "not-vers" }), rule()]);
  const findings = await detector.scan({ root: await repository({ "pubspec.yaml": "dependencies:\n  example_widgets: 1.0.0\n" }) });
  assert.deepEqual(findings.map((finding) => finding.ruleId), ["dart.package.example-widgets.discontinued"]);
});

test("scanRepository attributes findings to the dart detector", async () => {
  const result = await scanRepository(await repository(POSITIVE), builtInDetectors);
  assert.ok(result.findings.some((finding) => finding.detector === "dart" && finding.ruleId === "dart.sdk.end-of-support-3.8"));
});

test("ignores generated and vendored directories and returns nothing without Dart files", async () => {
  assert.deepEqual(await dartDetector.scan({ root: await repository({ "README.md": "hello\n" }) }), []);
  assert.deepEqual(await dartDetector.scan({ root: await repository({ ".dart_tool/pubspec.yaml": POSITIVE["pubspec.yaml"], "node_modules/x/pubspec.yaml": POSITIVE["pubspec.yaml"] }) }), []);
});

test("every curated Dart rule has migration guidance with real verification commands", async () => {
  for (const item of await committedRules()) {
    assert.ok(item.migration && item.migration.constraints.length >= 1 && item.migration.steps.length >= 1, item.id);
    assert.ok(item.migration.verification.some((check) => check.command === "dart analyze && flutter test"), item.id);
    assert.ok(item.migration.verification.some((check) => check.command === "dart analyze && dart test"), item.id);
  }
});

test("a migration packet for a Dart SDK finding names the file, steps, and verification", async () => {
  const result = await scanRepository(await repository(POSITIVE), [dartDetector]);
  const finding = result.findings.find((item) => item.id === "dart.sdk.end-of-support-3.8:pubspec.yaml:3");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("pubspec.yaml"));
  assert.deepEqual(packet.steps.map((step) => step.id).filter((id) => !["review-evidence", "verify-migration"].includes(id)), ["raise-sdk-pin", "raise-sdk-constraint", "align-ci-toolchain"]);
  assert.ok(packet.verification.some((check) => check.command === "dart analyze && flutter test"));
});
