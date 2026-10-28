import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test, type TestContext } from "node:test";
import { promisify } from "node:util";

import { JavaDetector } from "../src/detectors/java/index.js";
import type { Finding, ScanResult } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { javaFixer, planFixes, renderPatches } from "../src/fix/index.js";

const execute = promisify(execFile);

const scan = (root: string) => scanRepository(root, [new JavaDetector()]);

async function repository(t: TestContext, files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-java-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "core.autocrlf", "false"], { cwd: root });
  return root;
}

async function apply(root: string, patches: { path: string; diff: string }[]): Promise<void> {
  await writeFile(join(root, "fix.patch"), renderPatches(patches));
  await execute("git", ["apply", "--check", "fix.patch"], { cwd: root });
  await execute("git", ["apply", "fix.patch"], { cwd: root });
}

/** A `java.jdk.` finding as the detector emits it, pointing at one line of one file. */
function finding(path: string, line: number): Finding {
  return {
    id: `java.jdk.end-of-support-22-24:${path}:${line}`,
    ruleId: "java.jdk.end-of-support-22-24",
    detector: "java",
    title: "Java 22-24 are out of support",
    summary: `${path} declares an out-of-support JDK.`,
    severity: "medium",
    confidence: "exact",
    location: { path, line },
    replacement: "Java 25 (LTS) or later",
    sources: [{ title: "Oracle Java SE support roadmap", url: "https://www.oracle.com/java/technologies/java-se-support-roadmap.html" }],
  };
}

const scanOf = (root: string, findings: Finding[]): ScanResult =>
  ({ schemaVersion: "evergreen.scan.v1", root, scannedAt: "2026-10-28T00:00:00.000Z", findings, diagnostics: [] });

test("raises the Maven release property and the compiler plugin release, keeps everything else", async (t) => {
  const before = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>app</artifactId>
  <version>1.0.0</version>
  <properties>
    <maven.compiler.release>16</maven.compiler.release>
    <maven.compiler.source>16</maven.compiler.source>
    <java.version>16</java.version>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
  <build>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
        <configuration>
          <release>13</release> <!-- keep this comment -->
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
  const root = await repository(t, { "pom.xml": before });
  const patches = await javaFixer.plan(await scan(root));
  assert.deepEqual(patches.map((patch) => patch.path), ["pom.xml"]);
  assert.equal(await readFile(join(root, "pom.xml"), "utf8"), before);
  await apply(root, patches);
  assert.equal(await readFile(join(root, "pom.xml"), "utf8"),
    before.replace("<maven.compiler.release>16</maven.compiler.release>", "<maven.compiler.release>25</maven.compiler.release>")
      .replace("<release>13</release>", "<release>25</release>"));
  assert.deepEqual(await javaFixer.plan(await scan(root)), []);
});

test("raises the Gradle toolchain and source compatibility across modules, keeping each written form", async (t) => {
  const groovy = `plugins {
    id("java")
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(20)
    }
}

sourceCompatibility = JavaVersion.VERSION_22
`;
  const kotlin = `plugins {
    id("java")
}

jvmToolchain(19)
sourceCompatibility = "24"
`;
  const root = await repository(t, { "build.gradle": groovy, "nested/build.gradle.kts": kotlin });
  const patches = await planFixes(await scan(root));
  assert.deepEqual(patches.map((patch) => patch.path), ["build.gradle", "nested/build.gradle.kts"]);
  await apply(root, patches);
  assert.equal(await readFile(join(root, "build.gradle"), "utf8"),
    groovy.replace("JavaLanguageVersion.of(20)", "JavaLanguageVersion.of(25)").replace("JavaVersion.VERSION_22", "JavaVersion.VERSION_25"));
  assert.equal(await readFile(join(root, "nested/build.gradle.kts"), "utf8"),
    kotlin.replace("jvmToolchain(19)", "jvmToolchain(25)").replace('"24"', '"25"'));
  assert.deepEqual(await javaFixer.plan(await scan(root)), []);
});

for (const [name, path, contents, line] of [
  ["a computed compatibility value", "build.gradle", "sourceCompatibility = JavaVersion.toVersion(22)\n", 1],
  ["a computed release", "pom.xml",
    `<project>
  <build>
    <plugins>
      <plugin>
        <artifactId>maven-compiler-plugin</artifactId>
        <configuration>
          <release>\${java.version}</release>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`, 7],
  ["a target compatibility level", "build.gradle", "targetCompatibility = JavaVersion.VERSION_22\n", 1],
] as const) {
  test(`refuses to patch ${name}`, async (t) => {
    const root = await repository(t, { [path]: contents });
    assert.deepEqual(await javaFixer.plan(scanOf(root, [finding(path, line)])), []);
  });
}

test("refuses to raise an already supported value, an outside path, a pin file, and a missing file", async (t) => {
  const supported = await repository(t, { "build.gradle": "sourceCompatibility = 25\n" });
  const pinned = await repository(t, { ".java-version": "16\n" });
  const empty = await repository(t, {});
  assert.deepEqual(await javaFixer.plan(scanOf(supported, [finding("build.gradle", 1)])), []);
  assert.deepEqual(await javaFixer.plan(scanOf(pinned, [finding(".java-version", 1)])), []);
  assert.deepEqual(await javaFixer.plan(scanOf(empty, [finding("gone/pom.xml", 4)])), []);
});

test("leaves a file without a final newline alone", async (t) => {
  const root = await repository(t, { "pom.xml": "<project>\n  <properties>\n    <maven.compiler.release>16</maven.compiler.release>\n  </properties>\n</project>" });
  const result = await scan(root);
  assert.ok(result.findings.some((item) => item.ruleId.startsWith("java.jdk.")), "the detector reports the property");
  assert.deepEqual(await javaFixer.plan(result), []);
});

test("preserves CRLF line endings", async (t) => {
  const before = "<project>\r\n  <properties>\r\n    <maven.compiler.release>16</maven.compiler.release>\r\n  </properties>\r\n</project>\r\n";
  const root = await repository(t, { "pom.xml": before });
  const patches = await javaFixer.plan(await scan(root));
  assert.equal(patches.length, 1);
  assert.match(patches[0]!.diff, /\+    <maven\.compiler\.release>25<\/maven\.compiler\.release>\r\n/);
  await apply(root, patches);
  assert.equal(await readFile(join(root, "pom.xml"), "utf8"), before.replace("16</maven.compiler.release>", "25</maven.compiler.release>"));
});
