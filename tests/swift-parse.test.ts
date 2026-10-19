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
    parsePackageSwift(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\n// swift-tools-version:5.9\n`),
    [{ kind: "tools-version", value: "5.9", line: 2 }],
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
