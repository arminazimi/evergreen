import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { isDynamicVersion, jdkRuleVersion, parseJdkVersion } from "../src/detectors/java/jdk-version.js";
import { MAXIMUM_INPUT_BYTES as MAXIMUM_POM_BYTES, parsePom } from "../src/detectors/java/parse-pom.js";
import {
  MAXIMUM_DECLARATIONS,
  MAXIMUM_INPUT_BYTES as MAXIMUM_GRADLE_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseGradle,
} from "../src/detectors/java/parse-gradle.js";
import { MAXIMUM_INPUT_BYTES as MAXIMUM_WRAPPER_BYTES, MAXIMUM_VALUE_LENGTH, parseWrapper } from "../src/detectors/java/parse-wrapper.js";
import { MAXIMUM_DEPTH, MAXIMUM_ELEMENTS, parseXml } from "../src/detectors/java/xml.js";

async function fixture(caseName: string, ...file: string[]): Promise<string> {
  return readFile(resolve("tests/fixtures/java", caseName, ...file), "utf8");
}

// pom.xml

test("reads compiler properties, compiler plugin settings, and direct dependencies with lines", async () => {
  assert.deepEqual(parsePom(await fixture("positive", "maven", "pom.xml")), [
    { kind: "jdk", role: "compile-level", value: "22", major: 22, line: 9 },
    { kind: "jdk", role: "compile-level", value: "18", major: 18, line: 10 },
    { kind: "jdk", role: "compile-level", value: "1.8", major: 8, line: 11 },
    { kind: "jdk", role: "compile-level", value: "1.8", major: 8, line: 12 },
    { kind: "dependency", group: "com.google.collections", artifact: "google-collections", version: "1.0", line: 19 },
    { kind: "jdk", role: "compile-level", value: "16", major: 16, line: 30 },
    { kind: "jdk", role: "compile-level", value: "16", major: 16, line: 31 },
  ]);
});

test("returns property references as dynamic and skips lookalikes", async () => {
  assert.deepEqual(parsePom(await fixture("negative", "maven", "pom.xml")), [
    { kind: "dynamic", role: "compile-level", value: "${jdk.version}", line: 12 },
    { kind: "dynamic", role: "compile-level", value: "${java.version}", line: 13 },
    { kind: "jdk", role: "compile-level", value: "17", major: 17, line: 15 },
  ]);
  assert.deepEqual(parsePom(await fixture("zero", "maven", "pom.xml")), [
    { kind: "jdk", role: "compile-level", value: "21", major: 21, line: 8 },
  ]);
});

test("a pom with an unclosed tag, an entity, or a DOCTYPE yields nothing", async () => {
  for (const file of ["pom.xml", "entity-pom.xml"]) {
    const malformed = await fixture("malformed", "maven", file);
    assert.doesNotThrow(() => parsePom(malformed));
    assert.deepEqual(parsePom(malformed), [], file);
  }
  for (const junk of ["", "\0", "<", "<project", "<project>", "<project></other>", "<a/><b/>", "text", "<project>&amp;</project>", "<project><![CDATA[x"]) {
    assert.doesNotThrow(() => parsePom(junk));
    assert.deepEqual(parsePom(junk), [], JSON.stringify(junk));
  }
});

test("only a project root and a maven-compiler-plugin are read", () => {
  assert.deepEqual(parsePom("<settings><properties><java.version>22</java.version></properties></settings>"), []);
  const pom = [
    "<project>",
    "  <build>",
    "    <pluginManagement><plugins><plugin>",
    "      <artifactId>maven-compiler-plugin</artifactId>",
    "      <configuration><release>20</release><compilerArgs><arg>x</arg></compilerArgs></configuration>",
    "    </plugin></plugins></pluginManagement>",
    "    <plugins><plugin>",
    "      <artifactId>maven-surefire-plugin</artifactId>",
    "      <configuration><source>20</source></configuration>",
    "    </plugin></plugins>",
    "  </build>",
    "</project>",
  ].join("\n");
  assert.deepEqual(parsePom(pom), [{ kind: "jdk", role: "compile-level", value: "20", major: 20, line: 5 }]);
});

test("reads values in CDATA, with attributes, and across lines", () => {
  const pom = '<project xmlns="x">\n  <properties>\n    <java.version>\n      <![CDATA[18]]>\n    </java.version>\n  </properties>\n</project>';
  assert.deepEqual(parsePom(pom), [{ kind: "jdk", role: "compile-level", value: "18", major: 18, line: 4 }]);
  assert.deepEqual(parsePom("﻿<?xml version=\"1.0\"?>\r\n<project>\r\n<properties>\r\n<java.version>22</java.version>\r\n</properties>\r\n</project>\r\n"), [
    { kind: "jdk", role: "compile-level", value: "22", major: 22, line: 4 },
  ]);
});

test("dependencies need literal coordinates", () => {
  const pom = [
    "<project><dependencies>",
    "<dependency><groupId>a.b</groupId><artifactId>c</artifactId><version>1.0</version></dependency>",
    "<dependency><groupId>a.b</groupId><artifactId>d</artifactId><version>${d.version}</version></dependency>",
    "<dependency><groupId>a.b</groupId><artifactId>e</artifactId></dependency>",
    "<dependency><groupId>a b</groupId><artifactId>f</artifactId><version>1</version></dependency>",
    "</dependencies><dependencyManagement><dependencies>",
    "<dependency><groupId>a.b</groupId><artifactId>g</artifactId><version>1</version></dependency>",
    "</dependencies></dependencyManagement></project>",
  ].join("\n");
  assert.deepEqual(parsePom(pom), [{ kind: "dependency", group: "a.b", artifact: "c", version: "1.0", line: 2 }]);
});

test("bounds pom size, depth, and element count", () => {
  assert.deepEqual(parsePom(`<project><!-- ${"x".repeat(MAXIMUM_POM_BYTES)} --><properties><java.version>22</java.version></properties></project>`), []);
  const deep = "<a>".repeat(MAXIMUM_DEPTH + 2) + "</a>".repeat(MAXIMUM_DEPTH + 2);
  assert.equal(parseXml(deep), undefined);
  assert.equal(parseXml(`<project>${"<e/>".repeat(MAXIMUM_ELEMENTS + 1)}</project>`), undefined);
  assert.ok(parseXml(`<project>${"<e/>".repeat(1000)}</project>`));
});

test("is deterministic", async () => {
  const contents = await fixture("positive", "maven", "pom.xml");
  assert.deepEqual(parsePom(contents), parsePom(contents));
});

// JDK versions

test("reads the feature release of a JDK version text", () => {
  const cases: Array<[string, number | undefined]> = [
    ["22", 22], ["17.0.2", 17], ["1.8", 8], ["1.8.0_292", 8], ["8", 8], ["18.0.2-tem", 18], ["temurin-22.0.1", 22],
    ["openjdk-17", 17], ["zulu-21.0.1+12", 21], ["22-ea", 22], ["17.0.2+8", 17], ["graalvm-ce-17.0.9", 17],
    ["1", undefined], ["1.", undefined], ["", undefined], ["abc", undefined], ["latest", undefined], ["-tem", undefined],
    ["4", undefined], ["100", undefined], ["22 extra", undefined], ["1.x", undefined],
  ];
  for (const [text, major] of cases) assert.equal(parseJdkVersion(text)?.major, major, text);
  assert.equal(jdkRuleVersion(22), "22.0.0");
});

test("recognizes references that are never expanded", () => {
  for (const value of ["${jdk}", "$(JDK)", "latest", "system", "LTS", "default"]) assert.equal(isDynamicVersion(value), true, value);
  for (const value of ["22", "temurin-22", "1.8", ""]) assert.equal(isDynamicVersion(value), false, value);
});

// build.gradle and build.gradle.kts

test("reads toolchain, compatibility, Kotlin plugin, and dependency declarations from Groovy", async () => {
  assert.deepEqual(parseGradle(await fixture("positive", "gradle-groovy", "build.gradle")), [
    { kind: "kotlin-plugin", value: "1.9.22", line: 3 },
    { kind: "jdk", role: "toolchain", value: "20", major: 20, line: 8 },
    { kind: "jdk", role: "compile-level", value: "19", major: 19, line: 10 },
    { kind: "jdk", role: "compile-level", value: "18", major: 18, line: 11 },
    { kind: "dependency", group: "com.google.guava", artifact: "guava", version: "33.0.0-jre", line: 15 },
  ]);
});

test("reads the Kotlin DSL forms", async () => {
  assert.deepEqual(parseGradle(await fixture("positive", "gradle-kotlin", "build.gradle.kts")), [
    { kind: "kotlin-plugin", value: "1.9.22", line: 3 },
    { kind: "jdk", role: "toolchain", value: "24", major: 24, line: 8 },
    { kind: "jdk", role: "compile-level", value: "23", major: 23, line: 10 },
    { kind: "dependency", group: "com.google.guava", artifact: "guava", version: "33.0.0-jre", line: 14 },
  ]);
  assert.deepEqual(parseGradle(await fixture("zero", "gradle", "build.gradle.kts")), [
    { kind: "jdk", role: "toolchain", value: "25", major: 25, line: 7 },
  ]);
});

test("ignores comments and strings, and returns expressions as dynamic", async () => {
  assert.deepEqual(parseGradle(await fixture("negative", "gradle", "build.gradle")), [
    { kind: "dynamic", role: "toolchain", value: "libs.versions.java.get().toInteger()", line: 7 },
    { kind: "dynamic", role: "compile-level", value: "JavaVersion.toVersion(javaVersion)", line: 9 },
    { kind: "jdk", role: "compile-level", value: "17", major: 17, line: 10 },
    { kind: "dynamic", role: "toolchain", value: "rootProject.ext.jdk", line: 14 },
  ]);
});

test("reads legacy and compact forms", () => {
  const source = [
    "sourceCompatibility = 1.8",
    "targetCompatibility JavaVersion.VERSION_1_8",
    "sourceCompatibility = \"11\"",
    "java.sourceCompatibility = JavaVersion.VERSION_17",
    "compile 'a.b:c:1.0:sources@jar'",
    "implementation(\"a.b:d:\\${v}\")",
    "implementation \"a.b:e:$version\"",
    "api('a.b:f:2.0')",
    "kotlin(\"jvm\") version libs.versions.kotlin.get()",
    "id(\"org.jetbrains.kotlin.android\") version \"1.9.0\"",
    "sourceCompatibility = JavaVersion.VERSION_HIGHER",
  ].join("\n");
  assert.deepEqual(parseGradle(source), [
    { kind: "jdk", role: "compile-level", value: "1.8", major: 8, line: 1 },
    { kind: "jdk", role: "compile-level", value: "1.8", major: 8, line: 2 },
    { kind: "jdk", role: "compile-level", value: "11", major: 11, line: 3 },
    { kind: "jdk", role: "compile-level", value: "17", major: 17, line: 4 },
    { kind: "dependency", group: "a.b", artifact: "c", version: "1.0", line: 5 },
    { kind: "dependency", group: "a.b", artifact: "f", version: "2.0", line: 8 },
    { kind: "kotlin-plugin", value: "1.9.0", line: 10 },
    { kind: "dynamic", role: "compile-level", value: "JavaVersion.VERSION_HIGHER", line: 11 },
  ]);
});

test("a block comment or string that never ends yields nothing", async () => {
  const malformed = await fixture("malformed", "gradle", "build.gradle");
  assert.doesNotThrow(() => parseGradle(malformed));
  assert.deepEqual(parseGradle(malformed), []);
  for (const junk of ["", "\0", "/* sourceCompatibility = 17", "x = 'abc", 'x = """abc', "sourceCompatibility =", "{{{{", "\r\n\r\n"]) {
    assert.doesNotThrow(() => parseGradle(junk));
    assert.deepEqual(parseGradle(junk), [], JSON.stringify(junk));
  }
});

test("bounds gradle size, line length, and declaration count", () => {
  assert.deepEqual(parseGradle(`// ${"x".repeat(MAXIMUM_GRADLE_BYTES)}\nsourceCompatibility = 17\n`), []);
  assert.deepEqual(parseGradle(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\nsourceCompatibility = 17\n`), [
    { kind: "jdk", role: "compile-level", value: "17", major: 17, line: 2 },
  ]);
  assert.deepEqual(parseGradle(`sourceCompatibility = ${"1".repeat(MAXIMUM_LINE_LENGTH)}\n`), []);
  assert.equal(parseGradle("sourceCompatibility = 17\n".repeat(MAXIMUM_DECLARATIONS + 10)).length, MAXIMUM_DECLARATIONS);
});

test("gradle parsing is deterministic and handles CRLF", async () => {
  const contents = await fixture("positive", "gradle-groovy", "build.gradle");
  assert.deepEqual(parseGradle(contents), parseGradle(contents));
  assert.deepEqual(parseGradle("\r\nsourceCompatibility = 17\r\n"), [{ kind: "jdk", role: "compile-level", value: "17", major: 17, line: 2 }]);
});

// gradle-wrapper.properties

test("reads the Gradle version from distributionUrl with its line", async () => {
  assert.deepEqual(parseWrapper(await fixture("positive", "gradle-groovy", "gradle", "wrapper", "gradle-wrapper.properties")), [
    { kind: "gradle-wrapper", value: "8.5", url: "https://services.gradle.org/distributions/gradle-8.5-bin.zip", line: 3 },
  ]);
  assert.deepEqual(parseWrapper(await fixture("zero", "gradle", "gradle", "wrapper", "gradle-wrapper.properties")).map((entry) => entry.value), ["9.1.0"]);
});

test("reads colon and space separators, continuations, snapshots, and the last value", () => {
  const cases: Array<[string, string | undefined]> = [
    ["distributionUrl: https://services.gradle.org/distributions/gradle-7.6.4-all.zip\n", "7.6.4"],
    ["distributionUrl https\\://x.test/gradle-8.14-rc-1-bin.zip\n", "8.14-rc-1"],
    ["distributionUrl=https\\://x.test/gradle-8.5-2023\\\n  0101-bin.zip\n", "8.5-20230101"],
    ["distributionUrl=https\\://x.test/dist/\\\n  gradle-8.5-bin.zip\n", "8.5"],
    ["distributionUrl=https\\://x.test/gradle-6.9-bin.zip\ndistributionUrl=https\\://x.test/gradle-8.5-bin.zip\n", "8.5"],
    ["# distributionUrl=https\\://x.test/gradle-8.5-bin.zip\n! distributionUrl=x\n", undefined],
    ["distributionUrl=https\\://x.test/custom-bin.zip\n", undefined],
    ["distributionUrl=https\\://x.test/gradle--bin.zip\n", undefined],
    ["distributionUrl=\n", undefined],
    ["otherUrl=https\\://x.test/gradle-8.5-bin.zip\n", undefined],
    ["distributionUrl=file\\:///opt/gradle-8.5-bin.zip\r\n", "8.5"],
  ];
  for (const [source, version] of cases) assert.deepEqual(parseWrapper(source).map((entry) => entry.value), version ? [version] : [], source);
});

test("a binary or malformed wrapper file yields nothing", async () => {
  const malformed = await fixture("malformed", "gradle", "gradle", "wrapper", "gradle-wrapper.properties");
  assert.doesNotThrow(() => parseWrapper(malformed));
  assert.deepEqual(parseWrapper(malformed), []);
  for (const junk of ["", "\0", "=", "distributionUrl", "\\", "distributionUrl=\\"]) assert.deepEqual(parseWrapper(junk), [], JSON.stringify(junk));
});

test("bounds wrapper size and value length", () => {
  assert.deepEqual(parseWrapper(`# ${"x".repeat(MAXIMUM_WRAPPER_BYTES)}\ndistributionUrl=https\\://x.test/gradle-8.5-bin.zip\n`), []);
  assert.deepEqual(parseWrapper(`distributionUrl=https\\://x.test/${"a".repeat(MAXIMUM_VALUE_LENGTH)}/gradle-8.5-bin.zip\n`), []);
});
