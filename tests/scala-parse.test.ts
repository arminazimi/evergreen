import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parseBuildProperties, PINNED_SBT_VERSION } from "../src/detectors/scala/parse-build-properties.js";
import { parseBuildSbt } from "../src/detectors/scala/parse-build-sbt.js";
import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseScalaVersion,
  PINNED_SCALA_VERSION,
} from "../src/detectors/scala/parse-scala-version.js";

const fixtures = resolve("tests/fixtures/scala");

async function fixture(...parts: string[]): Promise<string> {
  return readFile(resolve(fixtures, ...parts), "utf8");
}

test("empty input has no declarations", () => {
  assert.deepEqual(parseScalaVersion(""), []);
  assert.deepEqual(parseBuildSbt(""), []);
  assert.deepEqual(parseBuildProperties(""), []);
});

test("input that is too large, or lines that are too long, give nothing instead of an error", () => {
  assert.deepEqual(parseScalaVersion("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseBuildSbt("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseBuildProperties("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.doesNotThrow(() => parseScalaVersion(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
  assert.doesNotThrow(() => parseBuildSbt(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
  assert.doesNotThrow(() => parseBuildProperties(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`));
});

test("junk never throws", () => {
  for (const junk of ["\u0000\u0001\u0002", "\uFEFF", "}}}{{{", "\r\n\r\n", "a\nb\n".repeat(1000)]) {
    assert.doesNotThrow(() => parseScalaVersion(junk), JSON.stringify(junk.slice(0, 12)));
    assert.doesNotThrow(() => parseBuildSbt(junk), JSON.stringify(junk.slice(0, 12)));
    assert.doesNotThrow(() => parseBuildProperties(junk), JSON.stringify(junk.slice(0, 12)));
  }
});

test("version patterns accept exact pins only", () => {
  assert.equal(PINNED_SCALA_VERSION.test("2.11.12"), true);
  assert.equal(PINNED_SCALA_VERSION.test("3.3.4"), true);
  assert.equal(PINNED_SCALA_VERSION.test("2.13"), false);
  assert.equal(PINNED_SBT_VERSION.test("0.13.18"), true);
  assert.equal(PINNED_SBT_VERSION.test("1.9.9"), true);
  assert.equal(PINNED_SBT_VERSION.test("latest"), false);
});

test("parses .scala-version with a single pin", async () => {
  assert.deepEqual(parseScalaVersion(await fixture("positive/.scala-version")), [{ value: "2.11.12", line: 1 }]);
  assert.deepEqual(parseScalaVersion(await fixture("zero/.scala-version")), [{ value: "3.3.4", line: 1 }]);
  assert.deepEqual(parseScalaVersion(await fixture("malformed/.scala-version")), []);
});

test(".scala-version rejects multiple pins or unsupported tokens", () => {
  assert.deepEqual(parseScalaVersion("2.11.12\n2.13.14\n"), []);
  assert.deepEqual(parseScalaVersion("system\n"), []);
  assert.deepEqual(parseScalaVersion("# comment only\n"), []);
});

test("parses build.sbt scalaVersion forms with exact lines", async () => {
  assert.deepEqual(parseBuildSbt(await fixture("positive/build.sbt")), [{ kind: "scala", value: "2.11.12", line: 7 }]);
  assert.deepEqual(parseBuildSbt(await fixture("negative/build.sbt")), [{ kind: "scala", value: "2.13.14", line: 7 }]);
  assert.deepEqual(parseBuildSbt(await fixture("malformed/build.sbt")), []);
});

test("build.sbt recognizes ThisBuild slash and in ThisBuild forms", () => {
  assert.deepEqual(parseBuildSbt('ThisBuild / scalaVersion := "2.11.12"\n'), [{ kind: "scala", value: "2.11.12", line: 1 }]);
  assert.deepEqual(parseBuildSbt('scalaVersion in ThisBuild := "2.11.12"\n'), [{ kind: "scala", value: "2.11.12", line: 1 }]);
  assert.deepEqual(parseBuildSbt('scalaVersion := "2.11.12",\n'), [{ kind: "scala", value: "2.11.12", line: 1 }]);
  assert.deepEqual(parseBuildSbt('scalaVersion := s"2.11.12"\n'), []);
});

test("parses project/build.properties sbt.version pins", async () => {
  assert.deepEqual(parseBuildProperties(await fixture("positive/project/build.properties")), [
    { kind: "sbt", value: "0.13.18", line: 1 },
  ]);
  assert.deepEqual(parseBuildProperties(await fixture("zero/project/build.properties")), [
    { kind: "sbt", value: "1.10.2", line: 1 },
  ]);
  assert.deepEqual(parseBuildProperties(await fixture("malformed/project/build.properties")), []);
});
