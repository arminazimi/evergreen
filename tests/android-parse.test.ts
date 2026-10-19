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
import {
  MAXIMUM_DECLARATIONS as MAXIMUM_TOML_DECLARATIONS,
  MAXIMUM_INPUT_BYTES as MAXIMUM_TOML_BYTES,
  parseAndroidLibsVersionsToml,
} from "../src/detectors/android/parse-libs-versions-toml.js";
import {
  MAXIMUM_DECLARATIONS as MAXIMUM_SETTINGS_DECLARATIONS,
  MAXIMUM_INPUT_BYTES as MAXIMUM_SETTINGS_BYTES,
  parseAndroidSettingsGradle,
} from "../src/detectors/android/parse-settings-gradle.js";

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

test("one-line android and defaultConfig blocks in Groovy and Kotlin", () => {
  assert.deepEqual(parseAndroidBuildGradle("android { compileSdk 34 }"), [{ kind: "compileSdk", value: "34", line: 1 }]);
  assert.deepEqual(parseAndroidBuildGradle("android { compileSdk = 34 }"), [{ kind: "compileSdk", value: "34", line: 1 }]);
  assert.deepEqual(parseAndroidBuildGradle("android {\n  defaultConfig { minSdk 21 }\n}"), [{ kind: "minSdk", value: "21", line: 2 }]);
  assert.deepEqual(parseAndroidBuildGradle("android {\n  defaultConfig { minSdk = 21 }\n}"), [{ kind: "minSdk", value: "21", line: 2 }]);
});

test("ignores receiver and ext properties that look like SDK keys", () => {
  assert.deepEqual(
    parseAndroidBuildGradle("android {\n  ext.minSdk = 21\n  foo.compileSdk = 34\n  bar.targetSdk 33\n  baz.buildToolsVersion \"34.0.0\"\n}"),
    [],
  );
  assert.deepEqual(parseAndroidBuildGradle("android {\n  ext.minSdk = 21\n  minSdk = 22\n}"), [{ kind: "minSdk", value: "22", line: 3 }]);
});

test("skips method-call forms and legacy *Version names", () => {
  assert.deepEqual(parseAndroidBuildGradle("android {\n  compileSdk(34)\n  minSdk(21)\n  targetSdkVersion 33\n  compileSdkVersion = 34\n}"), []);
});

test("reads buildToolsVersion in Groovy and Kotlin equals form", () => {
  assert.deepEqual(parseAndroidBuildGradle('buildToolsVersion "28.0.0"\nandroid {\n  buildToolsVersion "34.0.0"\n  compileSdk = 34\n}'), [
    { kind: "buildToolsVersion", value: "34.0.0", line: 3 },
    { kind: "compileSdk", value: "34", line: 4 },
  ]);
  assert.deepEqual(parseAndroidBuildGradle('android {\n  buildToolsVersion = "35.0.0"\n}'), [
    { kind: "buildToolsVersion", value: "35.0.0", line: 2 },
  ]);
});

test("nested defaultConfig versus declarations outside android blocks", () => {
  const source = [
    "minSdk 9",
    "android {",
    "  compileSdk 34",
    "  defaultConfig {",
    "    minSdk 21",
    "    targetSdk 34",
    "  }",
    "}",
    "targetSdk 8",
  ].join("\n");
  assert.deepEqual(parseAndroidBuildGradle(source), [
    { kind: "compileSdk", value: "34", line: 3 },
    { kind: "minSdk", value: "21", line: 5 },
    { kind: "targetSdk", value: "34", line: 6 },
  ]);
});

test("two android blocks each contribute declarations", () => {
  const source = "android { compileSdk 34 }\nandroid {\n  minSdk = 21\n}";
  assert.deepEqual(parseAndroidBuildGradle(source), [
    { kind: "compileSdk", value: "34", line: 1 },
    { kind: "minSdk", value: "21", line: 3 },
  ]);
});

test("CRLF line endings keep 1-based line numbers", () => {
  assert.deepEqual(parseAndroidBuildGradle("android {\r\n  compileSdk 34\r\n  minSdk = 21\r\n}"), [
    { kind: "compileSdk", value: "34", line: 2 },
    { kind: "minSdk", value: "21", line: 3 },
  ]);
});

test("escaped quotes inside a string do not hide a later declaration", () => {
  assert.deepEqual(parseAndroidBuildGradle('android {\n  def label = "say \\"hi\\""\n  compileSdk 34\n}'), [
    { kind: "compileSdk", value: "34", line: 3 },
  ]);
});

test("dollar interpolation in values is skipped", () => {
  assert.deepEqual(parseAndroidBuildGradle('android {\n  targetSdk = "$target"\n  minSdk "${min}"\n  compileSdk 34\n}'), [
    { kind: "compileSdk", value: "34", line: 4 },
  ]);
});

test("stops values before trailing line comments", () => {
  assert.deepEqual(parseAndroidBuildGradle("android {\n  compileSdk 34 // old\n  minSdk = 21 /* x */\n}"), [
    { kind: "compileSdk", value: "34", line: 2 },
    { kind: "minSdk", value: "21", line: 3 },
  ]);
});

test("large files with many string literals stay linear-time", () => {
  const strings = Array.from({ length: 20_000 }, (_, i) => `  def s${i} = "literal-${i}"`).join("\n");
  const source = `android {\n${strings}\n  compileSdk 34\n}`;
  assert.ok(Buffer.byteLength(source, "utf8") < MAXIMUM_INPUT_BYTES);
  const started = performance.now();
  const result = parseAndroidBuildGradle(source);
  const elapsed = performance.now() - started;
  assert.deepEqual(result, [{ kind: "compileSdk", value: "34", line: 20_002 }]);
  assert.ok(elapsed < 2000, `expected under 2000ms, took ${elapsed}ms`);
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

// settings.gradle(.kts)

test("reads AGP and Kotlin Android plugin versions from settings.gradle.kts", async () => {
  assert.deepEqual(parseAndroidSettingsGradle(await fixture("positive", "settings.gradle.kts")), [
    { kind: "agp", value: "8.5.2", line: 10 },
    { kind: "kotlin-android", value: "1.9.24", line: 11 },
  ]);
  assert.deepEqual(parseAndroidSettingsGradle(await fixture("zero", "settings.gradle.kts")), [
    { kind: "agp", value: "8.7.0", line: 10 },
    { kind: "kotlin-android", value: "2.0.21", line: 11 },
  ]);
});

test("skips comments and dynamic plugin versions in settings.gradle", async () => {
  assert.deepEqual(parseAndroidSettingsGradle(await fixture("negative", "settings.gradle")), []);
});

test("reads Groovy settings plugin pins and library plugin ids", () => {
  assert.deepEqual(
    parseAndroidSettingsGradle("plugins {\n  id 'com.android.library' version '8.5.2' apply false\n}"),
    [{ kind: "agp", value: "8.5.2", line: 2 }],
  );
});

test("settings junk and oversize inputs yield nothing", () => {
  for (const junk of ["", "\0", "plugins {\n  id(\"com.android.application\") version agpVersion\n}"]) {
    assert.deepEqual(parseAndroidSettingsGradle(junk), [], JSON.stringify(junk));
  }
  assert.deepEqual(parseAndroidSettingsGradle("x".repeat(MAXIMUM_SETTINGS_BYTES + 1)), []);
  const many = Array.from(
    { length: MAXIMUM_SETTINGS_DECLARATIONS + 5 },
    (_, i) => `id("com.android.application") version "${i}.0.0"`,
  ).join("\n");
  assert.equal(parseAndroidSettingsGradle(many).length, MAXIMUM_SETTINGS_DECLARATIONS);
});

// libs.versions.toml

test("reads agp and kotlin from [versions] in libs.versions.toml", async () => {
  assert.deepEqual(parseAndroidLibsVersionsToml(await fixture("positive", "libs.versions.toml")), [
    { kind: "agp", value: "8.5.2", line: 2 },
    { kind: "kotlin", value: "1.9.24", line: 3 },
  ]);
  assert.deepEqual(parseAndroidLibsVersionsToml(await fixture("zero", "libs.versions.toml")), [
    { kind: "agp", value: "8.7.0", line: 2 },
    { kind: "kotlin", value: "2.0.21", line: 3 },
  ]);
});

test("skips comments, lookalikes, and non-literal catalog versions", async () => {
  assert.deepEqual(parseAndroidLibsVersionsToml(await fixture("negative", "libs.versions.toml")), []);
});

test("malformed unterminated TOML string yields nothing", async () => {
  const malformed = await fixture("malformed", "libs.versions.toml");
  assert.doesNotThrow(() => parseAndroidLibsVersionsToml(malformed));
  assert.deepEqual(parseAndroidLibsVersionsToml(malformed), []);
});

test("TOML junk and oversize inputs yield nothing", () => {
  for (const junk of ["", "\0", "[plugins]\nagp = \"8.5.2\"\n", "[versions]\nnote = \"agp 1\"\n"]) {
    assert.deepEqual(parseAndroidLibsVersionsToml(junk), [], JSON.stringify(junk));
  }
  assert.deepEqual(parseAndroidLibsVersionsToml("x".repeat(MAXIMUM_TOML_BYTES + 1)), []);
  const many = `[versions]\n${Array.from({ length: MAXIMUM_TOML_DECLARATIONS + 5 }, (_, i) => `agp = "${i}.0.0"`).join("\n")}\n`;
  assert.equal(parseAndroidLibsVersionsToml(many).length, MAXIMUM_TOML_DECLARATIONS);
});
