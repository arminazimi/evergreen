import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { SwiftDetector, swiftDetector } from "../src/detectors/swift/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/swift");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-swift-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/swift.json", "utf8"))).rules;
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

/** A registry rule for one package, so a test can show how a SwiftPM declaration is matched. */
function packageRule(overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule {
  return {
    id: "swift.package.example-library.deprecated",
    ecosystem: "swift",
    purl: "pkg:swift/example-library",
    vers: "vers:semver/<2.0.0",
    event: "deprecated",
    title: "example-library 1.x is deprecated",
    summary: "The maintainer archived the package.",
    severity: "medium",
    replacement: "example-library 2",
    sources: [{ title: "Example archive notice", url: "https://example.com/example-library" }],
    provenance: { observedAt: "2026-10-20", reviewedAt: "2026-10-20", reviewer: "test" },
    ...overrides,
  };
}

test("swift passes detector conformance on every fixture", async () => {
  const appStore15Through25 = (await committedRules()).find((rule) => rule.id === "swift.xcode.app-store-15-through-25")!;
  await runDetectorConformance({
    detector: swiftDetector,
    fixtures: [
      {
        name: "swift positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(appStore15Through25, ".xcode-version", 1, `.xcode-version pins Xcode 15.4. ${appStore15Through25.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: swiftDetector,
    fixtures: [
      { name: "swift negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "swift zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: swiftDetector,
    fixtures: [{ name: "swift malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("reports the Xcode release a project pins in .xcode-version", async () => {
  const rule = (await committedRules()).find((item) => item.id === "swift.xcode.app-store-below-15")!;
  const findings = await swiftDetector.scan({ root: await repository({ ".xcode-version": "14.3\n" }) });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["swift.xcode.app-store-below-15", ".xcode-version", 1]]);
  assert.equal(findings[0]!.id, `${rule.id}:.xcode-version:1`);
  assert.match(findings[0]!.summary, /^\.xcode-version pins Xcode 14\.3\./);
});

test("matches an exact Package.swift dependency and a Package.resolved pin by SwiftPM identity", async () => {
  const detector = new SwiftDetector(async () => [packageRule()]);
  const manifest = await repository({
    "Package.swift": [
      "import PackageDescription",
      "",
      "let package = Package(",
      '    name: "Fixture",',
      "    dependencies: [",
      '        .package(url: "https://github.com/acme/Example-Library.git", exact: "1.4.0"),',
      "    ]",
      ")",
      "",
    ].join("\n"),
  });
  assert.deepEqual((await detector.scan({ root: manifest })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["swift.package.example-library.deprecated", "Package.swift", 6]]);

  const resolved = await repository({
    "Package.resolved": [
      "{",
      '  "pins" : [',
      "    {",
      '      "identity" : "example-library",',
      '      "kind" : "remoteSourceControl",',
      '      "location" : "https://github.com/acme/Example-Library",',
      '      "state" : {',
      '        "revision" : "0000000000000000000000000000000000000000",',
      '        "version" : "1.4.0"',
      "      }",
      "    }",
      "  ],",
      '  "version" : 2',
      "}",
      "",
    ].join("\n"),
  });
  assert.deepEqual((await detector.scan({ root: resolved })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["swift.package.example-library.deprecated", "Package.resolved", 9]]);
});

test("a from: requirement matches only a rule that covers every version", async () => {
  const manifest = {
    "Package.swift": [
      "import PackageDescription",
      "",
      "let package = Package(",
      '    name: "Fixture",',
      "    dependencies: [",
      '        .package(url: "https://github.com/acme/example-library", from: "1.4.0"),',
      "    ]",
      ")",
      "",
    ].join("\n"),
  };
  const root = await repository(manifest);
  assert.deepEqual(await new SwiftDetector(async () => [packageRule()]).scan({ root }), []);
  const findings = await new SwiftDetector(async () => [packageRule({ vers: "vers:semver/*" })]).scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["swift.package.example-library.deprecated", "Package.swift", 6]]);
  assert.match(findings[0]!.summary, /requires example-library from 1\.4\.0\./);
});

test("a declaration whose URL has no package identity never matches", async () => {
  const detector = new SwiftDetector(async () => [packageRule()]);
  for (const url of ["local/Fixture", "file:///tmp/example-library"]) {
    const root = await repository({
      "Package.swift": [
        "import PackageDescription",
        "",
        "let package = Package(",
        '    name: "Fixture",',
        "    dependencies: [",
        `        .package(url: "${url}", exact: "1.4.0"),`,
        "    ]",
        ")",
        "",
      ].join("\n"),
    });
    assert.deepEqual(await detector.scan({ root }), [], url);
  }
});

test("a rule whose Package URL cannot be read never matches and does not fail the scan", async () => {
  const detector = new SwiftDetector(async () => [packageRule({ purl: "example-library" })]);
  const root = await repository({ "Package.resolved": '{"pins":[{"identity":"example-library","state":{"version":"1.4.0"}}],"version":2}\n' });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("a rule with a malformed VERS never matches and does not hide a later rule", async () => {
  const base = (await committedRules()).find((rule) => rule.id === "swift.xcode.app-store-15-through-25")!;
  const detector = new SwiftDetector(async () => [{ ...base, id: "swift.xcode.malformed", vers: "not-a-vers" }, base]);
  const root = await repository({ ".xcode-version": "15.4\n" });
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.ruleId), ["swift.xcode.app-store-15-through-25"]);
});

test("a repository without Swift files scans to nothing", async () => {
  assert.deepEqual(await swiftDetector.scan({ root: await repository({ "README.md": "x\n" }) }), []);
});

test("the engine attributes a Swift finding to the detector", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [swiftDetector]);
  assert.deepEqual(result.findings.map((finding) => [finding.detector, finding.ruleId, finding.location.path, finding.location.line]), [["swift", "swift.xcode.app-store-15-through-25", ".xcode-version", 1]]);
});

test("every curated Swift rule has migration guidance with real verification commands", async () => {
  for (const rule of await committedRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.some((check) => check.command === "swift build && swift test"), rule.id);
    assert.ok(rule.migration.verification.some((check) => check.command === "xcodebuild -version"), rule.id);
  }
});

test("a migration packet for a Swift finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [swiftDetector]);
  const finding = result.findings.find((item) => item.id === "swift.xcode.app-store-15-through-25:.xcode-version:1");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes(".xcode-version"));
  assert.ok(packet.steps.some((step) => step.id === "raise-xcode-pin"));
  assert.ok(packet.steps.some((step) => step.id === "align-xcode-surfaces"));
  assert.ok(packet.verification.some((check) => check.command === "xcodebuild -version"));
  assert.ok(packet.verification.some((check) => check.command === "swift build && swift test"));
});

test("the detector is registered and Swift is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "swift"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "swift"), {
    id: "swift",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["swift"],
  });
});
