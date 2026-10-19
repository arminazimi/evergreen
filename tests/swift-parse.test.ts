import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parsePackageSwift,
} from "../src/detectors/swift/parse-package-swift.js";

const fixtures = resolve("tests/fixtures/swift");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses swift-tools-version and literal from/exact package pins with exact lines", async () => {
  assert.deepEqual(parsePackageSwift(await fixture("positive/Package.swift")), [
    { kind: "tools-version", value: "5.9", line: 1 },
    {
      kind: "package",
      url: "https://github.com/apple/swift-argument-parser",
      requirement: "from",
      value: "1.2.0",
      line: 11,
    },
    {
      kind: "package",
      url: "https://github.com/apple/swift-log.git",
      requirement: "exact",
      value: "1.5.3",
      line: 12,
    },
  ]);
  assert.deepEqual(parsePackageSwift(await fixture("zero/Package.swift")), [
    { kind: "tools-version", value: "6.0", line: 1 },
    {
      kind: "package",
      url: "https://github.com/apple/swift-argument-parser",
      requirement: "from",
      value: "1.3.0",
      line: 8,
    },
  ]);
});

test("ignores comments, platforms, path pins, and dynamic package versions", async () => {
  assert.deepEqual(parsePackageSwift(await fixture("negative/Package.swift")), []);
});

test("malformed package call skips the pin but keeps a valid tools-version", async () => {
  const malformed = await fixture("malformed/Package.swift");
  assert.doesNotThrow(() => parsePackageSwift(malformed));
  assert.deepEqual(parsePackageSwift(malformed), [{ kind: "tools-version", value: "5.9", line: 1 }]);
});

test("malformed and junk input returns nothing and never throws", () => {
  for (const junk of ["\u0000\u0001", "\uFEFF", "}}}", "\r\n\r\n", 'let x = .package(url: "https://x", from: "1.', "x".repeat(MAXIMUM_LINE_LENGTH + 1)]) {
    assert.doesNotThrow(() => parsePackageSwift(junk));
    assert.deepEqual(parsePackageSwift(junk), []);
  }
});

test("bounds untrusted input without losing later lines", () => {
  assert.deepEqual(parsePackageSwift("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(
    parsePackageSwift(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n.package(url: "https://x/a", from: "1.0.0")\n`),
    [{ kind: "package", url: "https://x/a", requirement: "from", value: "1.0.0", line: 2 }],
  );
});

test("handles CRLF, spacing in the tools-version directive, and 1-based lines", () => {
  assert.deepEqual(parsePackageSwift("// swift-tools-version: 5.10\r\n"), [
    { kind: "tools-version", value: "5.10", line: 1 },
  ]);
  assert.deepEqual(
    parsePackageSwift('// swift-tools-version:5.9\n.package(url: "https://example.com/a", from: "1.0.0")\n'),
    [
      { kind: "tools-version", value: "5.9", line: 1 },
      { kind: "package", url: "https://example.com/a", requirement: "from", value: "1.0.0", line: 2 },
    ],
  );
});

test("rejects branch, revision, ranges, and lookalike tools-version prose", () => {
  assert.deepEqual(
    parsePackageSwift([
      "// Notes: once used swift-tools-version:4.0 here",
      '.package(url: "https://example.com/a", branch: "main")',
      '.package(url: "https://example.com/b", revision: "abc")',
      '.package(url: "https://example.com/c", "1.0.0"..<"2.0.0")',
      '.package(url: "https://example.com/d", .upToNextMajor(from: "1.0.0"))',
    ].join("\n")),
    [],
  );
});

test("strips a single-line block comment that contains a package", () => {
  assert.deepEqual(parsePackageSwift('/* .package(url: "https://x/a", from: "1.0.0") */\n'), []);
});

test("strips a multi-line block comment that contains a package", () => {
  assert.deepEqual(
    parsePackageSwift(['/*', '.package(url: "https://x/a", from: "1.0.0")', '*/', '.package(url: "https://x/b", exact: "2.0.0")'].join("\n")),
    [{ kind: "package", url: "https://x/b", requirement: "exact", value: "2.0.0", line: 4 }],
  );
});

test("reads every package call on one line", () => {
  assert.deepEqual(
    parsePackageSwift('[.package(url: "https://x/a", from: "1.0.0"), .package(url: "https://x/b", exact: "2.0.0")]\n'),
    [
      { kind: "package", url: "https://x/a", requirement: "from", value: "1.0.0", line: 1 },
      { kind: "package", url: "https://x/b", requirement: "exact", value: "2.0.0", line: 1 },
    ],
  );
});

test("ignores tools-version on line 2 or later", () => {
  assert.deepEqual(parsePackageSwift('import PackageDescription\n// swift-tools-version:5.9\n'), []);
});

test("accepts tools-version after a UTF-8 BOM on line 1", () => {
  assert.deepEqual(parsePackageSwift("\uFEFF// swift-tools-version:5.9\n"), [
    { kind: "tools-version", value: "5.9", line: 1 },
  ]);
});

test("a /* inside a string literal does not start a block comment", () => {
  assert.deepEqual(
    parsePackageSwift('let s = "/*"; .package(url: "https://x/a", from: "1.0.0")\n'),
    [{ kind: "package", url: "https://x/a", requirement: "from", value: "1.0.0", line: 1 }],
  );
});

test("a string containing // before a real package on the same line still parses", () => {
  assert.deepEqual(
    parsePackageSwift('let s = "https://example.com"; .package(url: "https://x/a", from: "1.0.0")\n'),
    [{ kind: "package", url: "https://x/a", requirement: "from", value: "1.0.0", line: 1 }],
  );
});

test("tools-version inside a block comment does not count", () => {
  assert.deepEqual(parsePackageSwift("/* // swift-tools-version:5.9 */\n"), []);
  assert.deepEqual(parsePackageSwift("/*\n// swift-tools-version:5.9\n*/\n"), []);
});

test("a /* inside a // line comment does not open a block comment", () => {
  assert.deepEqual(
    parsePackageSwift(['// exclude Sources/*', '.package(url: "https://x/a", from: "1.0.0")'].join("\n")),
    [{ kind: "package", url: "https://x/a", requirement: "from", value: "1.0.0", line: 2 }],
  );
});

test("an unbalanced quote inside a // comment does not poison later stripping", () => {
  assert.deepEqual(
    parsePackageSwift(['// the "foo', '/* .package(url: "https://x/a", from: "1.0.0") */', '.package(url: "https://x/b", exact: "2.0.0")'].join("\n")),
    [{ kind: "package", url: "https://x/b", requirement: "exact", value: "2.0.0", line: 3 }],
  );
});

test("a multiline string containing /* and .package is ignored", () => {
  assert.deepEqual(
    parsePackageSwift(['let s = """', '/* .package(url: "https://x/a", from: "1.0.0") */', '"""', '.package(url: "https://x/b", from: "2.0.0")'].join("\n")),
    [{ kind: "package", url: "https://x/b", requirement: "from", value: "2.0.0", line: 4 }],
  );
});

test("nested block comments blank the whole nest", () => {
  assert.deepEqual(
    parsePackageSwift('/* outer /* inner .package(url: "https://x/a", from: "1.0.0") */ still */\n.package(url: "https://x/b", exact: "2.0.0")\n'),
    [{ kind: "package", url: "https://x/b", requirement: "exact", value: "2.0.0", line: 2 }],
  );
});
