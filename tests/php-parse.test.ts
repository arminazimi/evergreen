import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseComposerJson } from "../src/detectors/php/parse-composer-json.js";
import { parseComposerLock } from "../src/detectors/php/parse-composer-lock.js";

const fixtures = resolve("tests/fixtures/php");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses require.php, platform.php, and direct packages from composer.json with exact lines", async () => {
  assert.deepEqual(parseComposerJson(await fixture("positive/composer.json")), [
    { kind: "require-php", value: ">=7.4", line: 4 },
    { kind: "package", name: "monolog/monolog", value: "2.9.1", dev: false, line: 5 },
    { kind: "package", name: "symfony/http-foundation", value: "5.4.0", dev: false, line: 6 },
    { kind: "package", name: "phpunit/phpunit", value: "9.6.0", dev: true, line: 9 },
    { kind: "platform-php", value: "7.4.33", line: 13 },
  ]);
});

test("a valid composer.json with no lifecycle findings still parses its declarations", async () => {
  assert.deepEqual(parseComposerJson(await fixture("zero/composer.json")), [
    { kind: "require-php", value: ">=8.3", line: 4 },
    { kind: "package", name: "monolog/monolog", value: "3.8.0", dev: false, line: 5 },
    { kind: "platform-php", value: "8.3.12", line: 9 },
  ]);
});

test("ignores lookalikes, floating versions, and dynamic values", async () => {
  assert.deepEqual(parseComposerJson(await fixture("negative/composer.json")), []);
  for (const contents of [
    '{"require":{"php":""}}\n',
    '{"require":{"php":"*"}}\n',
    '{"require":{"php":"${PHP_VERSION}"}}\n',
    '{"require":{"php":7.4}}\n',
    '{"require":{"monolog/monolog":"*"}}\n',
    '{"require":{"monolog/monolog":"${V}"}}\n',
    '{"require":{"ext-json":"*"}}\n',
    '{"require":{"not-a-package":"1.0.0"}}\n',
    '{"extra":{"php":"7.4.33"}}\n',
    '{"config":{"platform":{"ext-gd":"1"}}}\n',
    '{"config":{"platform":{"php":"*"}}}\n',
    '{"config":{"platform":{"php":"${PHP_VERSION}"}}}\n',
  ]) {
    assert.deepEqual(parseComposerJson(contents), [], contents);
  }
});

test("a malformed composer.json returns nothing and never throws", async () => {
  const contents = await fixture("malformed/composer.json");
  assert.doesNotThrow(() => parseComposerJson(contents));
  assert.deepEqual(parseComposerJson(contents), []);
  for (const junk of ['{"require":{"php":">=7.4",}}\n', '{"require":{"php":">=7.4"', "{", "}", "\u0000\u0001", "}}}\n", "\r\n\r\n"]) {
    assert.doesNotThrow(() => parseComposerJson(junk));
    assert.deepEqual(parseComposerJson(junk), [], junk);
  }
});

test("handles CRLF, blank lines, and 1-based lines", () => {
  const contents =
    '{\r\n  "require": {\r\n    "php": ">=8.2",\r\n\r\n    "monolog/monolog": "3.0.0"\r\n  },\r\n  "config": {\r\n    "platform": {\r\n      "php": "8.2.0"\r\n    }\r\n  }\r\n}\r\n';
  assert.deepEqual(parseComposerJson(contents), [
    { kind: "require-php", value: ">=8.2", line: 3 },
    { kind: "package", name: "monolog/monolog", value: "3.0.0", dev: false, line: 5 },
    { kind: "platform-php", value: "8.2.0", line: 9 },
  ]);
});

test("bounds untrusted input and stays deterministic", () => {
  assert.deepEqual(parseComposerJson("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  const sample = '{"require":{"php":">=8.3","monolog/monolog":"3.8.0"}}\n';
  assert.deepEqual(parseComposerJson(sample), parseComposerJson(sample));
});

test("package name validation is linear-time and rejects oversize keys", () => {
  const cases = [
    '{"require":{"' + "a".repeat(100_000) + '!":"1.0"}}',
    '{"require":{"a/' + "a".repeat(100_000) + '!":"1.0"}}',
    '{"require":{"' + "a-".repeat(50_000) + '!":"1.0"}}',
    '{"require":{"a/' + "a-".repeat(50_000) + '!":"1.0"}}',
  ];
  for (const contents of cases) {
    const started = performance.now();
    assert.deepEqual(parseComposerJson(contents), []);
    assert.ok(performance.now() - started < 500, `slow parse for length ${contents.length}`);
  }

  const underLimit = "a".repeat(127) + "/" + "b".repeat(128);
  assert.equal(underLimit.length, 256);
  assert.deepEqual(parseComposerJson(`{"require":{"${underLimit}":"1.0.0"}}\n`), [
    { kind: "package", name: underLimit, value: "1.0.0", dev: false, line: 1 },
  ]);
  const overLimit = "a".repeat(128) + "/" + "b".repeat(128);
  assert.equal(overLimit.length, 257);
  assert.deepEqual(parseComposerJson(`{"require":{"${overLimit}":"1.0.0"}}\n`), []);
});

test("accepts the same valid package names as before and rejects malformed shapes", () => {
  for (const name of ["monolog/monolog", "symfony/http-foundation", "a_b/c.d", "a/b--c", "UPPER/case"]) {
    assert.deepEqual(parseComposerJson(`{"require":{"${name}":"1.0.0"}}\n`), [
      { kind: "package", name, value: "1.0.0", dev: false, line: 1 },
    ]);
  }
  for (const name of ["vendor/", "/name", "a/b/c", "ext-json/x"]) {
    assert.deepEqual(parseComposerJson(`{"require":{"${name}":"1.0.0"}}\n`), [], name);
  }
});

test("duplicate package keys in one section keep only the last occurrence", () => {
  assert.deepEqual(parseComposerJson('{"require":{"a/b":"1.0.0",\n"a/b":"2.0.0"}}\n'), [
    { kind: "package", name: "a/b", value: "2.0.0", dev: false, line: 2 },
  ]);
  assert.deepEqual(parseComposerJson('{"require-dev":{"a/b":"1.0.0",\n"a/b":"2.0.0"}}\n'), [
    { kind: "package", name: "a/b", value: "2.0.0", dev: true, line: 2 },
  ]);
  assert.deepEqual(parseComposerJson('{"require":{"a/b":"1.0.0"},"require-dev":{"a/b":"2.0.0"}}\n'), [
    { kind: "package", name: "a/b", value: "1.0.0", dev: false, line: 1 },
    { kind: "package", name: "a/b", value: "2.0.0", dev: true, line: 1 },
  ]);
  assert.deepEqual(parseComposerJson('{"require":{"a/b":"1.0.0","c/d":"2.0.0","a/b":"3.0.0"}}\n'), [
    { kind: "package", name: "a/b", value: "3.0.0", dev: false, line: 1 },
    { kind: "package", name: "c/d", value: "2.0.0", dev: false, line: 1 },
  ]);
});

test("rejects // and block comments in composer.json", () => {
  assert.deepEqual(parseComposerJson('{ // c\n "require": {"php": "^8.1"} }'), []);
  assert.deepEqual(parseComposerJson('{ /* c */ "require": {"php": "^8.1"} }'), []);
  assert.deepEqual(parseComposerJson('{\n  "require": {\n    // no\n    "php": "^8.1"\n  }\n}\n'), []);
});

test("parses resolved packages, abandoned flags, and platform.php from composer.lock with exact lines", async () => {
  assert.deepEqual(parseComposerLock(await fixture("positive/composer.lock")), [
    {
      kind: "locked-package",
      name: "monolog/monolog",
      value: "2.9.1",
      line: 5,
      dev: false,
      abandoned: false,
      abandonedLine: 6,
    },
    {
      kind: "locked-package",
      name: "old/abandoned",
      value: "1.0.0",
      line: 10,
      dev: false,
      abandoned: "new/replacement",
      abandonedLine: 11,
    },
    { kind: "locked-package", name: "symfony/http-foundation", value: "5.4.0", line: 15, dev: false, abandoned: false },
    { kind: "locked-package", name: "phpunit/phpunit", value: "9.6.0", line: 21, dev: true, abandoned: false },
    { kind: "platform-php", value: "7.4.33", line: 25 },
  ]);
});

test("a valid composer.lock with no lifecycle findings still parses its declarations", async () => {
  assert.deepEqual(parseComposerLock(await fixture("zero/composer.lock")), [
    {
      kind: "locked-package",
      name: "monolog/monolog",
      value: "3.8.0",
      line: 5,
      dev: false,
      abandoned: false,
      abandonedLine: 6,
    },
    { kind: "platform-php", value: "8.3.12", line: 11 },
  ]);
});

test("ignores empty lock sections, lookalike platform keys, and dynamic values", async () => {
  assert.deepEqual(parseComposerLock(await fixture("negative/composer.lock")), []);
  for (const contents of [
    '{"packages":[{"name":"a/b","version":""}]}\n',
    '{"packages":[{"name":"a/b","version":"*"}]}\n',
    '{"packages":[{"name":"a/b","version":"${V}"}]}\n',
    '{"packages":[{"name":"a/b","version":1}]}\n',
    '{"packages":[{"name":"not-a-package","version":"1.0.0"}]}\n',
    '{"packages":[{"name":"ext-json","version":"1.0.0"}]}\n',
    '{"packages":[{"version":"1.0.0"}]}\n',
    '{"packages":[{"name":"a/b"}]}\n',
    '{"platform":{"ext-json":"*"}}\n',
    '{"platform":{"php":"*"}}\n',
    '{"platform":{"php":"${PHP_VERSION}"}}\n',
    '{"platform-dev":{"php":"8.3.12"}}\n',
    '{"plugin-api-version":"2.3.0"}\n',
  ]) {
    assert.deepEqual(parseComposerLock(contents), [], contents);
  }
});

test("a malformed composer.lock returns nothing and never throws", async () => {
  const contents = await fixture("malformed/composer.lock");
  assert.doesNotThrow(() => parseComposerLock(contents));
  assert.deepEqual(parseComposerLock(contents), []);
  for (const junk of [
    '{"packages":[{"name":"a/b","version":"1.0.0",}]}\n',
    '{"packages":[{"name":"a/b","version":"1.0.0"',
    "{",
    "}",
    "\u0000\u0001",
    "}}}\n",
    "\r\n\r\n",
  ]) {
    assert.doesNotThrow(() => parseComposerLock(junk));
    assert.deepEqual(parseComposerLock(junk), [], junk);
  }
});

test("composer.lock handles CRLF, abandoned true, and 1-based lines", () => {
  const contents =
    '{\r\n  "packages": [\r\n    {\r\n      "name": "old/pkg",\r\n      "version": "1.0.0",\r\n      "abandoned": true\r\n    }\r\n  ],\r\n  "platform": {\r\n    "php": "8.2.0"\r\n  }\r\n}\r\n';
  assert.deepEqual(parseComposerLock(contents), [
    {
      kind: "locked-package",
      name: "old/pkg",
      value: "1.0.0",
      line: 5,
      dev: false,
      abandoned: true,
      abandonedLine: 6,
    },
    { kind: "platform-php", value: "8.2.0", line: 10 },
  ]);
});

test("composer.lock bounds untrusted input and stays deterministic", () => {
  assert.deepEqual(parseComposerLock("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  const sample = '{"packages":[{"name":"a/b","version":"1.0.0","abandoned":false}],"platform":{"php":"8.3.0"}}\n';
  assert.deepEqual(parseComposerLock(sample), parseComposerLock(sample));
});

test("rejects // and block comments in composer.lock", () => {
  assert.deepEqual(parseComposerLock('{ // c\n "packages": [{"name":"a/b","version":"1.0.0"}] }'), []);
  assert.deepEqual(parseComposerLock('{ /* c */ "packages": [{"name":"a/b","version":"1.0.0"}] }'), []);
});
