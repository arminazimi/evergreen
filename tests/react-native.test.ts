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
import { npmDetector } from "../src/detectors/npm.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";
import { versContains } from "../src/vers.js";

const fixtures = resolve("tests/fixtures/react-native");
const RULE_ID = "npm.package.react-native.0.77-to-0.84.end-of-support";
const SUPPORT_POLICY = "https://github.com/reactwg/react-native-releases/blob/main/docs/support.md";
const RELEASE_SCHEDULE = "https://reactnative.dev/releases/overview";
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-react-native-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function reactNativeRule(): Promise<RegistryV2Rule> {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/npm.json", "utf8")));
  const rules = registry.rules.filter((rule) => rule.purl === "pkg:npm/react-native");
  assert.deepEqual(rules.map((rule) => rule.id), [RULE_ID]);
  return rules[0]!;
}

function expectedFinding(rule: RegistryV2Rule): DetectorFinding {
  return {
    id: `${RULE_ID}:package.json:6`,
    ruleId: RULE_ID,
    title: rule.title,
    summary: `react-native is declared in dependencies as 0.84.0; resolved: 0.84.0. ${rule.summary}`,
    severity: "high",
    confidence: "inferred-from-lock",
    location: { path: "package.json", line: 6 },
    replacement: rule.replacement!,
    migration: rule.migration!,
    sources: rule.sources,
    usages: [
      {
        kind: "import",
        language: "typescript",
        symbol: "react-native",
        location: { path: "src/App.tsx", line: 1, column: 29 },
        excerpt: 'import { Text, View } from "react-native";',
      },
    ],
    impact: { usageCount: 1, affectedFiles: 1, level: "low" },
  };
}

test("React Native passes detector conformance on every fixture", async () => {
  const rule = await reactNativeRule();
  await runDetectorConformance({
    detector: npmDetector,
    fixtures: [{ name: "React Native positive", root: resolve(fixtures, "positive"), expectedFindings: [expectedFinding(rule)] }],
    checks: [determinismCheck, evidenceCheck],
  });
  await runDetectorConformance({
    detector: npmDetector,
    fixtures: [
      { name: "React Native negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "React Native zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: npmDetector,
    fixtures: [{ name: "React Native malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("covers every unsupported series listed by the release schedule", async () => {
  const rule = await reactNativeRule();
  assert.equal(rule.event, "end-of-support");
  assert.equal(rule.severity, "high");
  assert.equal(rule.vers, "vers:npm/>=0.77.0-0|<0.85.0-0");
  for (let minor = 77; minor <= 84; minor += 1) {
    assert.equal(versContains(rule.vers, `0.${minor}.0`), true, `0.${minor}.x is covered`);
    assert.equal(versContains(rule.vers, `0.${minor}.99`), true, `0.${minor}.x patches are covered`);
  }
});

test("supported and future series have no lifecycle rule", async () => {
  const rule = await reactNativeRule();
  for (const version of ["0.85.0", "0.86.0", "0.87.1", "0.88.0-rc.0"]) {
    assert.equal(versContains(rule.vers, version), false, version);
  }
});

test("the rule is authoritative and carries official upgrade guidance", async () => {
  const rule = await reactNativeRule();
  assert.ok(rule.sources.some((source) => source.url === SUPPORT_POLICY));
  assert.ok(rule.sources.some((source) => source.url === RELEASE_SCHEDULE));
  assert.ok(rule.sources.some((source) => source.url === "https://reactnative.dev/docs/upgrading"));
  assert.ok(rule.sources.every((source) => /^https:\/\/\S+$/.test(source.url)));
  assert.deepEqual(rule["x-npm"], { package: "react-native" });
  assert.ok(rule.migration && rule.migration.constraints.length >= 1);
  assert.ok(rule.migration!.steps.some((step) => step.id === "apply-template-changes"));
  assert.ok(rule.migration!.verification.some((check) => check.command === "npm ls react-native react"));
});

test("reports unsupported ranges and ignores supported, floating, and lookalike declarations", async () => {
  const cases: Array<[Record<string, string>, string[]]> = [
    [{ "package.json": JSON.stringify({ dependencies: { "react-native": "^0.77.0" } }) }, [RULE_ID]],
    [{ "package.json": JSON.stringify({ dependencies: { "react-native": "^0.84.0" } }) }, [RULE_ID]],
    [{ "package.json": JSON.stringify({ dependencies: { "react-native": "^0.85.0" } }) }, []],
    [{ "package.json": JSON.stringify({ dependencies: { "react-native": "^0.87.0" } }) }, []],
    [{ "package.json": JSON.stringify({ dependencies: { "react-native": "latest" } }) }, []],
    [{ "package.json": JSON.stringify({ dependencies: { "react-native-web": "0.21.0" } }) }, []],
  ];
  for (const [files, expected] of cases) {
    const findings = await npmDetector.scan({ root: await repository(files) });
    assert.deepEqual(findings.map((finding) => finding.ruleId), expected);
  }
});

test("the lockfile version decides whether a broad range is unsupported", async () => {
  const resolvedTo = async (version: string) =>
    (await npmDetector.scan({
      root: await repository({
        "package.json": JSON.stringify({ dependencies: { "react-native": ">=0.84.0 <0.88.0" } }),
        "package-lock.json": JSON.stringify({
          lockfileVersion: 3,
          packages: { "node_modules/react-native": { version } },
        }),
      }),
    })).map((finding) => finding.ruleId);

  assert.deepEqual(await resolvedTo("0.84.0"), [RULE_ID]);
  assert.deepEqual(await resolvedTo("0.87.1"), []);
});

test("the migration packet names the manifest, source usage, steps, and checks", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [npmDetector]);
  const finding = result.findings.find((item) => item.ruleId === RULE_ID);
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("package.json"));
  assert.ok(packet.affectedFiles.includes("src/App.tsx"));
  assert.ok(packet.steps.some((step) => step.id === "update-react-native-dependencies"));
  assert.ok(packet.steps.some((step) => step.id === "apply-template-changes"));
  assert.ok(packet.verification.some((check) => check.command === "npm test --if-present"));
});
