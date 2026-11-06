import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAndroidSettingsGradle } from "../src/detectors/android/parse-settings-gradle.js";

function pins(source: string): string[] {
  return parseAndroidSettingsGradle(source).map((entry) => `${entry.kind}=${entry.value}@${entry.line}`);
}

test("readPluginPin reads Kotlin DSL and Groovy plugin pins", () => {
  assert.deepEqual(pins('id("com.android.application") version "8.1.0"'), ["agp=8.1.0@1"]);
  assert.deepEqual(pins("id 'com.android.library' version '8.2.1'"), ["agp=8.2.1@1"]);
  assert.deepEqual(pins('id("org.jetbrains.kotlin.android") version("1.9.20")'), ["kotlin-android=1.9.20@1"]);
  assert.deepEqual(pins('id\n  "com.android.application"\n  version\n  "8.0.0"'), ["agp=8.0.0@1"]);
});

test("readPluginPin skips unsupported ids, versions, and forms", () => {
  assert.deepEqual(pins('id("other.plugin") version "1.0"'), []);
  assert.deepEqual(pins('id("com.android.application") version agpVersion'), []);
  assert.deepEqual(pins('id("com.android.application") version "8.+"'), []);
  assert.deepEqual(pins('id("com.android.application") version "$v"'), []);
  assert.deepEqual(pins('id("com.android.application")'), []);
  assert.deepEqual(pins('id("com.android.application") versionX "8.0.0"'), []);
  assert.deepEqual(pins('id("com.android.application") version1 "8.0.0"'), []);
  assert.deepEqual(pins('id("com.android.application").version("8.0.0")'), []);
  assert.deepEqual(pins("id com.android.application version '8.0.0'"), []);
  assert.deepEqual(pins('id("com.android.application) version "8.0.0"'), []);
});

test("readPluginPin gives up on oversized whitespace gaps", () => {
  assert.deepEqual(pins(`id${" ".repeat(300)}"com.android.application" version "8.0.0"`), []);
  assert.deepEqual(pins(`id "com.android.application"${" ".repeat(300)}version "8.0.0"`), []);
  assert.deepEqual(pins(`id "com.android.application" version${" ".repeat(300)}"8.0.0"`), []);
});

test("readPluginPin ignores lookalikes in comments and strings", () => {
  assert.deepEqual(pins('// id("com.android.application") version "8.0.0"'), []);
  assert.deepEqual(pins('val s = "id(\\"com.android.application\\") version \\"8.0.0\\""'), []);
});
