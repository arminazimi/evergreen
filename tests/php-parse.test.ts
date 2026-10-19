import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseComposerJson } from "../src/detectors/php/parse-composer-json.js";

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
