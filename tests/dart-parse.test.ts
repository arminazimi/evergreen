import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  parseFvmConfigJson,
  parseFvmrc,
} from "../src/detectors/dart/parse-fvm.js";

const fixtures = resolve("tests/fixtures/dart");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses modern and legacy FVM pins with exact lines", async () => {
  assert.deepEqual(parseFvmrc(await fixture("positive/.fvmrc")), [{ value: "3.7.12", line: 2 }]);
  assert.deepEqual(parseFvmConfigJson(await fixture("positive/.fvm/fvm_config.json")), [
    { value: "3.7.12", line: 2 },
  ]);
  assert.deepEqual(parseFvmrc(await fixture("zero/.fvmrc")), [{ value: "3.47.7", line: 2 }]);
  assert.deepEqual(parseFvmConfigJson(await fixture("zero/.fvm/fvm_config.json")), [
    { value: "3.47.7", line: 2 },
  ]);
});

test("ignores channels, flavors, unrelated keys, and the other FVM file shape", async () => {
  assert.deepEqual(parseFvmrc(await fixture("negative/.fvmrc")), []);
  assert.deepEqual(parseFvmConfigJson(await fixture("negative/.fvm/fvm_config.json")), []);
  assert.deepEqual(parseFvmrc('{"flutterSdkVersion":"3.7.12"}'), []);
  assert.deepEqual(parseFvmConfigJson('{"flutter":"3.7.12"}'), []);
  assert.deepEqual(parseFvmrc('{"flavors":{"dev":"3.7.12"}}'), []);
  assert.deepEqual(parseFvmConfigJson('{"cachePath":"/fvm/versions/3.7.12"}'), []);
});

test("returns nothing for dynamic and unsupported pin forms", () => {
  for (const value of [
    "stable",
    "beta",
    "master",
    "latest",
    "${FLUTTER_VERSION}",
    "3.7",
    "v3.7.12",
    "3.7.12 || 3.10.0",
    " 3.7.12 ",
    "",
  ]) {
    assert.deepEqual(parseFvmrc(JSON.stringify({ flutter: value })), [], value);
    assert.deepEqual(parseFvmConfigJson(JSON.stringify({ flutterSdkVersion: value })), [], value);
  }
  assert.deepEqual(parseFvmrc('{"flutter":3.7}'), []);
  assert.deepEqual(parseFvmConfigJson('{"flutterSdkVersion":true}'), []);
});

test("accepts prerelease, build metadata, CRLF, and a byte order mark", () => {
  assert.deepEqual(parseFvmrc('{\r\n  "flutter": "3.24.0-0.1.pre"\r\n}\r\n'), [
    { value: "3.24.0-0.1.pre", line: 2 },
  ]);
  assert.deepEqual(parseFvmConfigJson('\uFEFF{\n  "flutterSdkVersion": "3.7.12+hotfix.1"\n}\n'), [
    { value: "3.7.12+hotfix.1", line: 2 },
  ]);
});

test("malformed FVM files return nothing and never throw", async () => {
  const malformed = [
    await fixture("malformed/.fvmrc"),
    await fixture("malformed/.fvm/fvm_config.json"),
    '{"flutter":"3.7.12"',
    '{"flutter":"3.7.12" trailing}',
    '{// comment\n"flutter":"3.7.12"}',
    '{"flutter":"3.7.12",}',
    "\u0000\u0001",
  ];
  for (const contents of malformed) {
    assert.doesNotThrow(() => parseFvmrc(contents));
    assert.doesNotThrow(() => parseFvmConfigJson(contents));
    assert.deepEqual(parseFvmrc(contents), [], contents);
    assert.deepEqual(parseFvmConfigJson(contents), [], contents);
  }
});

test("bounds untrusted input and remains deterministic", () => {
  const sample = '{\n  "flutter": "3.7.12"\n}\n';
  assert.deepEqual(parseFvmrc("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseFvmrc(sample), parseFvmrc(sample));

  let nested = '"3.7.12"';
  for (let depth = 0; depth < 65; depth += 1) nested = `{\"flutter\":${nested}}`;
  assert.deepEqual(parseFvmrc(nested), []);
});
