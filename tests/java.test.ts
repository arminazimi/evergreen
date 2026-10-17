import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { javaDetector } from "../src/detectors/java/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/java");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-java-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function expected(ruleId: string, path: string, line: number, subject: string, severity?: DetectorFinding["severity"]): Promise<DetectorFinding> {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/java.json", "utf8")));
  const rule = registry.rules.find((item) => item.id === ruleId)!;
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    title: rule.title,
    summary: `${path} declares ${subject}. ${rule.summary}`,
    severity: severity ?? rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    migration: rule.migration!,
    sources: rule.sources,
  };
}

const R12_16 = "java.jdk.end-of-support-12-16";
const R18_20 = "java.jdk.end-of-support-18-20";
const R22_24 = "java.jdk.end-of-support-22-24";
const TOOLCHAIN = "the JDK that builds the project";
const PIN = "the pinned JDK";
const COMPILE = "the language level the code is compiled for";

test("java passes detector conformance on every fixture", async () => {
  await runDetectorConformance({
    detector: javaDetector,
    fixtures: [
      {
        name: "java positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: await Promise.all([
          expected(R18_20, "gradle-groovy/build.gradle", 8, `JDK 20, ${TOOLCHAIN},`),
          expected(R18_20, "gradle-groovy/build.gradle", 10, `JDK 19, ${COMPILE},`, "medium"),
          expected(R18_20, "gradle-groovy/build.gradle", 11, `JDK 18, ${COMPILE},`, "medium"),
          expected(R22_24, "gradle-kotlin/build.gradle.kts", 8, `JDK 24, ${TOOLCHAIN},`),
          expected(R22_24, "gradle-kotlin/build.gradle.kts", 10, `JDK 23, ${COMPILE},`, "medium"),
          expected(R22_24, "maven/pom.xml", 9, `JDK 22, ${COMPILE},`, "medium"),
          expected(R18_20, "maven/pom.xml", 10, `JDK 18, ${COMPILE},`, "medium"),
          expected(R12_16, "maven/pom.xml", 30, `JDK 16, ${COMPILE},`, "medium"),
          expected(R12_16, "maven/pom.xml", 31, `JDK 16, ${COMPILE},`, "medium"),
          expected(R12_16, "pins/.java-version", 1, `JDK 16, ${PIN},`),
          expected(R18_20, "pins/.sdkmanrc", 2, `JDK 18.0.2-tem, ${PIN},`),
          expected(R22_24, "pins/.tool-versions", 2, `JDK temurin-22.0.1, ${PIN},`),
        ]),
      },
    ],
    checks: [determinismCheck, evidenceCheck],
  });
  await runDetectorConformance({
    detector: javaDetector,
    fixtures: [{ name: "java negative", root: resolve(fixtures, "negative"), expectedFindings: [] }],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: javaDetector,
    fixtures: [{ name: "java zero", root: resolve(fixtures, "zero"), expectedFindings: [] }],
    checks: [zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: javaDetector,
    fixtures: [{ name: "java malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("dynamic JDK declarations are reported as unclassified, never guessed", async () => {
  const analysis = await javaDetector.analyze({ root: resolve(fixtures, "negative") });
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.location.path, item.location.line, item.reference]),
    [
      ["gradle/build.gradle", 7, "libs.versions.java.get().toInteger()"],
      ["gradle/build.gradle", 9, "JavaVersion.toVersion(javaVersion)"],
      ["gradle/build.gradle", 14, "rootProject.ext.jdk"],
      ["maven/pom.xml", 12, "${jdk.version}"],
      ["maven/pom.xml", 13, "${java.version}"],
    ],
  );
  assert.ok(analysis.unclassified.every((item) => item.component === "java" && /does not expand/.test(item.reason)));
});

test("LTS releases and releases before 9 are never reported", async () => {
  const root = await repository({
    ".java-version": "17\n",
    "a/.tool-versions": "java temurin-8.0.402+6\n",
    "b/.sdkmanrc": "java=21.0.1-tem\n",
    "c/.java-version": "1.7\n",
    "d/.java-version": "25\n",
    "e/.java-version": "11.0.22\n",
  });
  assert.deepEqual(await javaDetector.scan({ root }), []);
});

test("a dependency that has moved is reported from pom.xml and Gradle, at its own version", async () => {
  const root = await repository({
    "pom.xml": [
      "<project><dependencies>",
      "<dependency><groupId>mysql</groupId><artifactId>mysql-connector-java</artifactId><version>8.0.33</version></dependency>",
      "<dependency><groupId>mysql</groupId><artifactId>mysql-connector-java</artifactId><version>8.0.28</version></dependency>",
      "</dependencies></project>",
    ].join("\n"),
    "app/build.gradle.kts": 'dependencies {\n    runtimeOnly("org.slf4j:slf4j-log4j12:2.0.17")\n    runtimeOnly("org.slf4j:slf4j-log4j12:1.7.36")\n}\n',
  });
  const findings = await javaDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line, finding.severity]), [
    ["java.maven.org.slf4j.slf4j-log4j12.relocated", "app/build.gradle.kts", 2, "medium"],
    ["java.maven.mysql.mysql-connector-java.relocated", "pom.xml", 2, "medium"],
  ]);
  assert.equal(findings[1]!.replacement, "com.mysql:mysql-connector-j");
});

test("skips dependency, build, and fixture directories and symbolic links, and finds nested files", async () => {
  const root = await repository({
    "services/api/.java-version": "22\n",
    "node_modules/pkg/.java-version": "22\n",
    "build/.java-version": "22\n",
    ".gradle/.java-version": "22\n",
    "tests/fixtures/old/.java-version": "22\n",
  });
  await symlink(join(root, "services"), join(root, "linked")).catch(() => undefined);
  assert.deepEqual((await javaDetector.scan({ root })).map((finding) => finding.location.path), ["services/api/.java-version"]);
});

test("a file that is too large or too deep is skipped without failing", async () => {
  const root = await repository({
    "pom.xml": `<project><!-- ${"x".repeat(1024 * 1024)} --><properties><java.version>22</java.version></properties></project>`,
    "a/b/c/d/e/f/g/h/i/.java-version": "22\n",
    ".java-version": "22\n",
  });
  assert.deepEqual((await javaDetector.scan({ root })).map((finding) => finding.location.path), [".java-version"]);
});

test("a repository with no JVM files scans to nothing without reading the registry", async () => {
  const root = await repository({ "README.md": "hello\n", "package.json": "{}\n" });
  assert.deepEqual(await javaDetector.analyze({ root }), { findings: [], unclassified: [] });
});

test("every curated java rule has migration guidance with real verification commands", async () => {
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/java.json", "utf8")));
  for (const rule of registry.rules) {
    assert.ok(rule.migration, rule.id);
    assert.ok(rule.migration.constraints.length >= 1, rule.id);
    assert.ok(rule.migration.steps.some((step) => step.targets === "declaration"), rule.id);
    assert.ok(rule.migration.verification.length >= 1, rule.id);
    for (const check of rule.migration.verification) assert.match(check.command, /^(?:\.\/mvnw|\.\/gradlew|java|mvn|gradle) /, rule.id);
  }
});

test("a migration packet for a JDK finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [javaDetector]);
  const finding = result.findings.find((item) => item.id === `${R18_20}:gradle-groovy/build.gradle:8`);
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("gradle-groovy/build.gradle"));
  assert.ok(packet.steps.some((step) => step.id === "update-jdk-declaration"));
  assert.ok(packet.verification.some((check) => check.command.startsWith("./mvnw -B verify")));
});
