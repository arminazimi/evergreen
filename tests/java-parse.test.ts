import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { isDynamicVersion, jdkRuleVersion, parseJdkVersion } from "../src/detectors/java/jdk-version.js";
import { MAXIMUM_INPUT_BYTES as MAXIMUM_POM_BYTES, parsePom } from "../src/detectors/java/parse-pom.js";
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
