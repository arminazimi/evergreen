import assert from "node:assert/strict";
import { test } from "node:test";

import { MAXIMUM_DECLARATIONS } from "../src/detectors/android/gradle-scan.js";
import { parseAndroidLibsVersionsToml } from "../src/detectors/android/parse-libs-versions-toml.js";

function pins(source: string): string[] {
  return parseAndroidLibsVersionsToml(source).map((entry) => `${entry.kind}=${entry.value}@${entry.line}`);
}

test("parseAndroidLibsVersionsToml reads agp and kotlin pins only from [versions]", () => {
  assert.deepEqual(pins('[versions]\nagp = "8.1.0"\nkotlin = \'1.9.0\' # c\nother = "1"\n'), [
    "agp=8.1.0@2",
    "kotlin=1.9.0@3",
  ]);
  assert.deepEqual(pins('[plugins]\nagp = "8.1.0"\n[versions]\n[[bundles]]\nkotlin = "1.9.0"\n'), []);
  assert.deepEqual(pins('[versions]\r\nagp = "8.1.0"\r\n'), ["agp=8.1.0@2"]);
});

test("parseAndroidLibsVersionsToml skips dynamic, interpolated, and empty values", () => {
  assert.deepEqual(pins('[versions]\nagp = "8.+"\nkotlin = ""\n'), []);
  assert.deepEqual(pins('[versions]\nagp = "$x"\n'), []);
  assert.deepEqual(pins("[versions]\nagp = 8\n"), []);
});

test("parseAndroidLibsVersionsToml returns nothing for unreadable strings", () => {
  assert.deepEqual(pins('[versions]\nagp = "8.1.0\n'), []);
  assert.deepEqual(pins('[versions]\nagp = """8.1.0"""\n'), []);
  assert.deepEqual(pins('[versions]\nagp = "8.1.0" # "\n'), ["agp=8.1.0@2"]);
});

test("parseAndroidLibsVersionsToml skips overlong lines and caps declarations", () => {
  assert.deepEqual(pins(`[versions]\n#${"x".repeat(5000)}\nagp = "8.1.0"\n`), ["agp=8.1.0@3"]);
  const many = `[versions]\n${'agp = "1"\n'.repeat(MAXIMUM_DECLARATIONS + 5)}`;
  assert.equal(parseAndroidLibsVersionsToml(many).length, MAXIMUM_DECLARATIONS);
});
