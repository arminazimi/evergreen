import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_DECLARATIONS,
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseAndroidBuildGradle,
} from "../src/detectors/android/parse-build-gradle.js";

async function fixture(caseName: string, file: string): Promise<string> {
  return readFile(resolve("tests/fixtures/android", caseName, file), "utf8");
}

test("reads compileSdk, minSdk, and targetSdk from Groovy build.gradle with lines", async () => {
  assert.deepEqual(parseAndroidBuildGradle(await fixture("positive", "build.gradle")), [
    { kind: "compileSdk", value: "34", line: 7 },
    { kind: "minSdk", value: "21", line: 11 },
    { kind: "targetSdk", value: "34", line: 12 },
  ]);
});

test("reads compileSdk, minSdk, and targetSdk from Kotlin build.gradle.kts with lines", async () => {
  assert.deepEqual(parseAndroidBuildGradle(await fixture("positive", "build.gradle.kts")), [
    { kind: "compileSdk", value: "34", line: 7 },
    { kind: "minSdk", value: "21", line: 11 },
    { kind: "targetSdk", value: "34", line: 12 },
  ]);
});

test("zero fixtures yield the same literal declarations (no lifecycle claim)", async () => {
  assert.deepEqual(parseAndroidBuildGradle(await fixture("zero", "build.gradle")), [
    { kind: "compileSdk", value: "35", line: 7 },
    { kind: "minSdk", value: "24", line: 11 },
    { kind: "targetSdk", value: "35", line: 12 },
  ]);
  assert.deepEqual(parseAndroidBuildGradle(await fixture("zero", "build.gradle.kts")), [
    { kind: "compileSdk", value: "35", line: 7 },
    { kind: "minSdk", value: "24", line: 11 },
    { kind: "targetSdk", value: "35", line: 12 },
  ]);
});

test("skips comments, dynamics, and lookalikes in negative fixtures", async () => {
  assert.deepEqual(parseAndroidBuildGradle(await fixture("negative", "build.gradle")), []);
  assert.deepEqual(parseAndroidBuildGradle(await fixture("negative", "build.gradle.kts")), []);
});

test("malformed unterminated string yields nothing without throwing", async () => {
  const malformed = await fixture("malformed", "build.gradle.kts");
  assert.doesNotThrow(() => parseAndroidBuildGradle(malformed));
  assert.deepEqual(parseAndroidBuildGradle(malformed), []);
});

test("reads quoted buildToolsVersion and ignores values outside android blocks", () => {
  const source = [
    'buildToolsVersion "28.0.0"',
    "android {",
    '  buildToolsVersion "34.0.0"',
    "  compileSdk = 34",
    "}",
  ].join("\n");
  assert.deepEqual(parseAndroidBuildGradle(source), [
    { kind: "buildToolsVersion", value: "34.0.0", line: 3 },
    { kind: "compileSdk", value: "34", line: 4 },
  ]);
});

test("junk, oversize, and null-byte inputs yield nothing", () => {
  for (const junk of ["", "\0", "android {", "android {\n  compileSdk =\n}", "plugins { id 'x' }"]) {
    assert.doesNotThrow(() => parseAndroidBuildGradle(junk));
    assert.deepEqual(parseAndroidBuildGradle(junk), [], JSON.stringify(junk));
  }
  assert.deepEqual(parseAndroidBuildGradle("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseAndroidBuildGradle(`android {\n  compileSdk ${"9".repeat(MAXIMUM_LINE_LENGTH)}\n}`), []);
  const many = `android {\n${Array.from({ length: MAXIMUM_DECLARATIONS + 10 }, (_, i) => `  compileSdk ${i}\n`).join("")}}`;
  assert.equal(parseAndroidBuildGradle(many).length, MAXIMUM_DECLARATIONS);
});
