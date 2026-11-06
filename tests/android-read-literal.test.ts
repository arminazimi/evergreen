import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAndroidBuildGradle } from "../src/detectors/android/parse-build-gradle.js";

function values(body: string): string[] {
  return parseAndroidBuildGradle(`android {\n${body}\n}\n`).map((entry) => `${entry.kind}=${entry.value}`);
}

test("readLiteral accepts bare, assigned, and quoted numeric SDK values", () => {
  assert.deepEqual(values("compileSdk 34"), ["compileSdk=34"]);
  assert.deepEqual(values("minSdk = 21"), ["minSdk=21"]);
  assert.deepEqual(values('targetSdk "33"'), ["targetSdk=33"]);
  assert.deepEqual(values("compileSdk = '31';"), ["compileSdk=31"]);
  assert.deepEqual(values("minSdk 24 // comment"), ["minSdk=24"]);
  assert.deepEqual(values("minSdk 24 /* c */"), ["minSdk=24"]);
});

test("readLiteral rejects method calls, empty and non-numeric values", () => {
  assert.deepEqual(values("compileSdk(34)"), []);
  assert.deepEqual(values("compileSdk"), []);
  assert.deepEqual(values("compileSdk ;"), []);
  assert.deepEqual(values("compileSdk = // c"), []);
  assert.deepEqual(values("compileSdk abc"), []);
  assert.deepEqual(values("compileSdk 34abc"), []);
  assert.deepEqual(values('compileSdk "3$4"'), []);
  assert.deepEqual(values('compileSdk "x"'), []);
  assert.deepEqual(values('compileSdk "3\n4"'), []);
});

test("readLiteral reads buildToolsVersion only from dotted quoted strings", () => {
  assert.deepEqual(values('buildToolsVersion "34.0.0"'), ["buildToolsVersion=34.0.0"]);
  assert.deepEqual(values("buildToolsVersion = '30'"), ["buildToolsVersion=30"]);
  assert.deepEqual(values("buildToolsVersion 34"), []);
  assert.deepEqual(values('buildToolsVersion "34.0.0'), []);
  assert.deepEqual(values('buildToolsVersion "$v"'), []);
  assert.deepEqual(values('buildToolsVersion "a.b"'), []);
  assert.deepEqual(values('buildToolsVersion "3.\\0"'), ["buildToolsVersion=3.0"]);
});
