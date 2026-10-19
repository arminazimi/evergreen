import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseVcpkgJson } from "../src/detectors/cpp/parse-vcpkg.js";

const fixtures = resolve("tests/fixtures/cpp");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses builtin-baseline and direct dependencies from vcpkg.json with exact lines", async () => {
  assert.deepEqual(parseVcpkgJson(await fixture("positive/vcpkg.json")), [
    { kind: "vcpkg-baseline", value: "664933b8d385dfc01f4e0cdff4c7c74e71f6a740", line: 5 },
    { kind: "vcpkg-dependency", name: "fmt", line: 7 },
    { kind: "vcpkg-dependency", name: "zlib", value: "1.2.13", line: 10 },
    { kind: "vcpkg-dependency", name: "openssl", line: 13 },
  ]);
});

test("a valid vcpkg.json with no lifecycle findings still parses its declarations", async () => {
  assert.deepEqual(parseVcpkgJson(await fixture("zero/vcpkg.json")), [
    { kind: "vcpkg-baseline", value: "664933b8d385dfc01f4e0cdff4c7c74e71f6a740", line: 5 },
    { kind: "vcpkg-dependency", name: "fmt", line: 7 },
    { kind: "vcpkg-dependency", name: "zlib", value: "1.3.1", line: 10 },
  ]);
});

test("ignores comments, features, overrides, and lookalike fields", async () => {
  assert.deepEqual(parseVcpkgJson(await fixture("negative/vcpkg.json")), []);
  for (const contents of [
    '{"name":"app","version":"1.0.0"}\n',
    '{"overrides":[{"name":"zlib","version":"1.2.13"}]}\n',
    '{"features":{"tools":{"dependencies":["ninja"]}}}\n',
    '{"dependencies":[""]}\n',
    '{"dependencies":[{"name":""}]}\n',
    '{"dependencies":[{"name":"zlib","version>=":""}]}\n',
    '{"dependencies":[{"name":"zlib","version>=":1}]}\n',
    '{"dependencies":[{"version>=":"1.2.13"}]}\n',
    '{"dependencies":[42]}\n',
    '{"dependencies":{"fmt":"1.0.0"}}\n',
    '{"builtin-baseline":""}\n',
    '{"builtin-baseline":42}\n',
  ]) {
    assert.deepEqual(parseVcpkgJson(contents), [], contents);
  }
});

test("a malformed vcpkg.json returns nothing and never throws", async () => {
  const contents = await fixture("malformed/vcpkg.json");
  assert.doesNotThrow(() => parseVcpkgJson(contents));
  assert.deepEqual(parseVcpkgJson(contents), []);
  for (const junk of [
    '{"dependencies":["fmt",]}\n',
    '{"builtin-baseline":"abc"',
    "{",
    "}",
    "\u0000\u0001",
    "}}}",
    "\r\n\r\n",
  ]) {
    assert.doesNotThrow(() => parseVcpkgJson(junk));
    assert.deepEqual(parseVcpkgJson(junk), [], junk);
  }
});

test("reads host and platform object dependencies and ignores option fields", () => {
  assert.deepEqual(
    parseVcpkgJson('{"dependencies":[{"name":"zlib","version>=":"1.2.13","default-features":false,"host":true}]}\n'),
    [{ kind: "vcpkg-dependency", name: "zlib", value: "1.2.13", line: 1 }],
  );
  assert.deepEqual(parseVcpkgJson('{"dependencies":[{"name":"openssl","platform":"windows"}]}\n'), [
    { kind: "vcpkg-dependency", name: "openssl", line: 1 },
  ]);
});

test("handles CRLF, blank lines, and 1-based lines", () => {
  const contents = '{\r\n  "builtin-baseline": "abc123",\r\n\r\n  "dependencies": [\r\n    "fmt"\r\n  ]\r\n}\r\n';
  assert.deepEqual(parseVcpkgJson(contents), [
    { kind: "vcpkg-baseline", value: "abc123", line: 2 },
    { kind: "vcpkg-dependency", name: "fmt", line: 5 },
  ]);
});

test("bounds untrusted input and stays deterministic", () => {
  assert.deepEqual(parseVcpkgJson("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  const sample = '{"dependencies":["fmt"]}\n';
  assert.deepEqual(parseVcpkgJson(sample), parseVcpkgJson(sample));
});
