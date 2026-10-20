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
import { AndroidDetector, androidDetector } from "../src/detectors/android/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/android");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-android-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/android.json", "utf8"))).rules;
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

/** A registry rule for one Android declaration, so a test can show how a Package URL is matched. */
function rule(overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule {
  return {
    id: "android.target-sdk.below-35",
    ecosystem: "android",
    purl: "pkg:generic/android/targetSdk",
    vers: "vers:intdot/<35",
    event: "end-of-support",
    title: "targetSdk below 35",
    summary: "A target API level rule.",
    severity: "high",
    replacement: "targetSdk 35",
    sources: [{ title: "Example target API page", url: "https://example.com/target-sdk" }],
    provenance: { observedAt: "2026-10-20", reviewedAt: "2026-10-20", reviewer: "test" },
    ...overrides,
  };
}

test("android passes detector conformance on every fixture", async () => {
  const billing5 = (await committedRules()).find((item) => item.id === "android.play-billing.version-5")!;
  const summary = (path: string) => `${path} declares com.android.billingclient:billing:5.2.1. ${billing5.summary}`;
  await runDetectorConformance({
    detector: androidDetector,
    fixtures: [
      {
        name: "android positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(billing5, "build.gradle", 19, summary("build.gradle")),
          expected(billing5, "build.gradle.kts", 19, summary("build.gradle.kts")),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: androidDetector,
    fixtures: [
      { name: "android negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "android zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: androidDetector,
    fixtures: [{ name: "android malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("matches a string-notation Play Billing dependency to its major, in Groovy and Kotlin", async () => {
  const rules = await committedRules();
  const billing5 = rules.find((item) => item.id === "android.play-billing.version-5")!;
  const groovy = await androidDetector.scan({
    root: await repository({ "app/build.gradle": "dependencies {\n    implementation 'com.android.billingclient:billing:5.2.1'\n}\n" }),
  });
  assert.deepEqual(groovy.map((finding) => [finding.ruleId, finding.location.path, finding.location.line, finding.severity]), [
    ["android.play-billing.version-5", "app/build.gradle", 2, "high"],
  ]);
  assert.equal(groovy[0]!.summary, `app/build.gradle declares com.android.billingclient:billing:5.2.1. ${billing5.summary}`);

  const kotlin = await androidDetector.scan({
    root: await repository({ "app/build.gradle.kts": 'dependencies {\n    implementation("com.android.billingclient:billing:8.1.0")\n}\n' }),
  });
  assert.deepEqual(kotlin.map((finding) => [finding.ruleId, finding.severity]), [["android.play-billing.version-8", "low"]]);
});

test("a Play Billing major outside the bundled rules is not a finding", async () => {
  const root = await repository({
    "build.gradle": "dependencies {\n    implementation 'com.android.billingclient:billing:10.0.0'\n    implementation 'com.example:other:5.2.1'\n}\n",
  });
  assert.deepEqual(await androidDetector.scan({ root }), []);
});

test("SDK, plugin, and catalog declarations alone yield no findings when no rule names them", async () => {
  const root = await repository({
    "app/build.gradle": "android {\n    compileSdk 34\n    defaultConfig {\n        minSdk 21\n        targetSdk 34\n        buildToolsVersion '34.0.0'\n    }\n}\n",
    "settings.gradle": "plugins {\n    id 'com.android.application' version '8.5.2' apply false\n    id 'org.jetbrains.kotlin.android' version '1.9.24' apply false\n}\n",
    "gradle/libs.versions.toml": '[versions]\nagp = "8.5.2"\nkotlin = "1.9.24"\n',
  });
  assert.deepEqual(await androidDetector.scan({ root }), []);
});

test("an injected rule matches targetSdk, the Android Gradle Plugin, and a catalog key by Package URL", async () => {
  const detector = new AndroidDetector(async () => [
    rule(),
    rule({ id: "android.agp.8", purl: "pkg:generic/android/agp", vers: "vers:maven/>=8.0.0|<9.0.0", title: "AGP 8", summary: "An AGP rule." }),
    rule({ id: "android.kotlin.catalog", purl: "pkg:generic/android/kotlin", vers: "vers:maven/>=1.9.0|<2.0.0", title: "Kotlin catalog", summary: "A catalog rule." }),
  ]);
  const root = await repository({
    "app/build.gradle": "android {\n    compileSdk 34\n    defaultConfig { targetSdk 34 }\n}\n",
    "settings.gradle.kts": 'plugins {\n    id("com.android.application") version "8.5.2" apply false\n    id("org.jetbrains.kotlin.android") version "1.9.24" apply false\n}\n',
    "gradle/libs.versions.toml": '[versions]\nagp = "8.5.2"\nkotlin = "1.9.24"\n',
  });
  assert.deepEqual((await detector.scan({ root })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [
    ["android.target-sdk.below-35", "app/build.gradle", 3],
    ["android.agp.8", "gradle/libs.versions.toml", 2],
    ["android.kotlin.catalog", "gradle/libs.versions.toml", 3],
    ["android.agp.8", "settings.gradle.kts", 2],
  ]);
});

test("a Kotlin Android plugin pin matches pkg:generic/android/kotlin-android and not the catalog kotlin purl", async () => {
  const detector = new AndroidDetector(async () => [
    rule({ id: "android.kotlin-android.1", purl: "pkg:generic/android/kotlin-android", vers: "vers:maven/>=1.0.0|<2.0.0", summary: "A plugin rule." }),
  ]);
  const root = await repository({
    "settings.gradle": "plugins {\n    id 'org.jetbrains.kotlin.android' version '1.9.24' apply false\n}\n",
    "gradle/libs.versions.toml": '[versions]\nkotlin = "1.9.24"\n',
  });
  assert.deepEqual((await detector.scan({ root })).map((finding) => [finding.ruleId, finding.location.path]), [
    ["android.kotlin-android.1", "settings.gradle"],
  ]);
});

test("a rule with a malformed VERS never matches and does not hide a later rule", async () => {
  const billing5 = (await committedRules()).find((item) => item.id === "android.play-billing.version-5")!;
  const detector = new AndroidDetector(async () => [{ ...billing5, id: "android.play-billing.malformed", vers: "not-a-vers" }, billing5]);
  const root = await repository({ "build.gradle": "dependencies { implementation 'com.android.billingclient:billing:5.2.1' }\n" });
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.ruleId), ["android.play-billing.version-5"]);
});

test("a rule whose Package URL cannot be read never matches and does not fail the scan", async () => {
  const detector = new AndroidDetector(async () => [rule({ purl: "not-a-purl" })]);
  const root = await repository({ "app/build.gradle": "android { defaultConfig { targetSdk 34 } }\n" });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("map notation and a commented dependency are not read", async () => {
  const root = await repository({
    "build.gradle": [
      "dependencies {",
      "    implementation group: 'com.android.billingclient', name: 'billing', version: '5.2.1'",
      "    // implementation 'com.android.billingclient:billing:5.2.1'",
      "}",
      "",
    ].join("\n"),
  });
  assert.deepEqual(await androidDetector.scan({ root }), []);
});

test("a rule with usage matchers records a Kotlin import of the library", async () => {
  const billing5 = (await committedRules()).find((item) => item.id === "android.play-billing.version-5")!;
  const detector = new AndroidDetector(async () => [
    {
      ...billing5,
      usage: [{ kind: "import", language: "kotlin", module: "com.android.billingclient.api" }],
    },
  ]);
  const root = await repository({
    "app/build.gradle": "dependencies {\n    implementation 'com.android.billingclient:billing:5.2.1'\n}\n",
    "app/src/Billing.kt": "import com.android.billingclient.api.BillingClient\n",
  });
  const findings = await detector.scan({ root });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.usages?.length, 1);
  assert.equal(findings[0]!.usages?.[0]?.location.path, "app/src/Billing.kt");
});

test("a repository without Android files scans to nothing", async () => {
  assert.deepEqual(await androidDetector.scan({ root: await repository({ "README.md": "x\n" }) }), []);
});

test("the engine attributes an Android finding to the detector", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [androidDetector]);
  assert.deepEqual(
    result.findings.map((finding) => [finding.detector, finding.ruleId, finding.location.path, finding.location.line]),
    [
      ["android", "android.play-billing.version-5", "build.gradle", 19],
      ["android", "android.play-billing.version-5", "build.gradle.kts", 19],
    ],
  );
});

test("the detector is registered and Android is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "android"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "android"), {
    id: "android",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["android"],
  });
});
