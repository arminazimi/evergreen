import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parsePubspecLock,
} from "../src/detectors/dart/parse-pubspec-lock.js";

const fixtures = resolve("tests/fixtures/dart");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

const hosted = (name: string, value: string, line: number) => ({ kind: "pub-package", name, value, line });

test("parses resolved hosted packages and SDK constraints of a positive pubspec.lock with exact lines", async () => {
  assert.deepEqual(parsePubspecLock(await fixture("positive/pubspec.lock")), [
    hosted("collection", "1.17.1", 11),
    hosted("flutter_lints", "2.0.1", 19),
    hosted("http", "0.13.6", 27),
    hosted("intl", "0.17.0", 35),
    hosted("meta", "1.9.1", 43),
    hosted("provider", "6.0.5", 51),
    hosted("shared_preferences", "2.0.15", 59),
    { kind: "dart-sdk", value: ">=2.19.0 <3.0.0", line: 61 },
    { kind: "flutter-sdk", value: ">=3.7.0", line: 62 },
  ]);
});

test("parses the current resolved packages and SDK constraints of a zero pubspec.lock", async () => {
  assert.deepEqual(parsePubspecLock(await fixture("zero/pubspec.lock")), [
    hosted("collection", "1.19.1", 11),
    hosted("flutter_lints", "6.0.0", 19),
    hosted("http", "1.6.0", 27),
    hosted("intl", "0.20.3", 35),
    hosted("meta", "1.19.0", 43),
    hosted("provider", "6.1.5+1", 51),
    hosted("shared_preferences", "2.5.6", 59),
    { kind: "dart-sdk", value: ">=3.13.0 <4.0.0", line: 61 },
    { kind: "flutter-sdk", value: ">=3.47.0", line: 62 },
  ]);
});

test("a negative pubspec.lock produces no declarations", async () => {
  assert.deepEqual(parsePubspecLock(await fixture("negative/pubspec.lock")), []);
});

test("a malformed pubspec.lock returns nothing, not partial declarations, and never throws", async () => {
  const contents = await fixture("malformed/pubspec.lock");
  assert.doesNotThrow(() => parsePubspecLock(contents));
  assert.deepEqual(parsePubspecLock(contents), []);
});

test("ignores non-hosted sources, entries without a source or version, and nested descriptions", () => {
  for (const contents of [
    'packages:\n  flutter:\n    dependency: "direct main"\n    description: flutter\n    source: sdk\n    version: "0.0.0"\n',
    'packages:\n  local_ui:\n    description:\n      path: "../local_ui"\n    source: path\n    version: "1.0.0"\n',
    'packages:\n  git_tool:\n    description:\n      url: "https://example.com/git_tool.git"\n    source: git\n    version: "0.0.1"\n',
    'packages:\n  http:\n    dependency: transitive\n    version: "1.0.0"\n',
    "packages:\n  http:\n    source: hosted\n",
    "packages:\n  http:\n    description:\n      source: hosted\n    version: \"1.0.0\"\n",
    "packages:\n  http:\n    source: \"hosted\"\n    description:\n      version: \"1.0.0\"\n",
  ]) {
    assert.deepEqual(parsePubspecLock(contents), [], contents);
  }
});

test("ignores versions and constraints that are not plain semantic versions", () => {
  for (const version of [
    '"${PUB_VERSION}"',
    '"^1.0.0"',
    '">=1.0.0"',
    '"1.0"',
    '"1.0.0 || 2.0.0"',
    '"any"',
    "[1.0.0]",
    "{ value: 1.0.0 }",
    "",
  ]) {
    assert.deepEqual(parsePubspecLock(`packages:\n  http:\n    source: hosted\n    version: ${version}\n`), [], version);
  }
  for (const sdk of ['"any"', '"${DART_SDK}"', '">=3.0.0 || <2.0.0"', "any", '"^3.0.0 1.0"']) {
    assert.deepEqual(parsePubspecLock(`sdks:\n  dart: ${sdk}\n`), [], sdk);
  }
});

test("ignores package names that are not lowercase Dart identifiers and SDK keys other than dart and flutter", () => {
  assert.deepEqual(
    parsePubspecLock(
      'packages:\n  Http:\n    source: hosted\n    version: "1.0.0"\n  my-pkg:\n    source: hosted\n    version: "1.0.0"\n',
    ),
    [],
  );
  assert.deepEqual(parsePubspecLock('sdks:\n  melos: ">=1.0.0 <2.0.0"\n'), []);
});

test("an entry written inline or as a block scalar, and everything nested under it, produces nothing", () => {
  assert.deepEqual(parsePubspecLock('packages:\n  http: { source: hosted, version: "1.0.0" }\n'), []);
  assert.deepEqual(parsePubspecLock('packages:\n  http: |\n    source: hosted\n    version: "1.0.0"\n'), []);
  assert.deepEqual(parsePubspecLock('packages:\n  http: >\n    source: hosted\n    version: "1.0.0"\n'), []);
});

test("a plain value that continues on a more-indented line is not read, but later lines are", () => {
  assert.deepEqual(parsePubspecLock("packages:\n  http:\n    source: hosted\n    version: 1.0.0\n      .1\n"), []);
  assert.deepEqual(parsePubspecLock("sdks:\n  dart: 2.19.0\n    <3.0.0\n  flutter: \">=3.7.0\"\n"), [
    { kind: "flutter-sdk", value: ">=3.7.0", line: 4 },
  ]);
});

test("a quoted value that spans lines or contains escapes is not read, but later lines are", () => {
  assert.deepEqual(parsePubspecLock('sdks:\n  dart: ">=2.19.0\n    <3.0.0"\n  flutter: ">=3.7.0"\n'), [
    { kind: "flutter-sdk", value: ">=3.7.0", line: 4 },
  ]);
  assert.deepEqual(parsePubspecLock('sdks:\n  dart: "\\x3E2.19.0"\n'), []);
});

test("reads only the packages and sdks sections and their direct children", () => {
  assert.deepEqual(parsePubspecLock('dependencies:\n  http:\n    source: hosted\n    version: "1.0.0"\n'), []);
  assert.deepEqual(parsePubspecLock('other:\n  packages:\n    http:\n      source: hosted\n      version: "1.0.0"\n'), []);
  assert.deepEqual(parsePubspecLock('sdks:\n  dart: ">=3.0.0"\n  melos: ">=1.0.0"\n'), [
    { kind: "dart-sdk", value: ">=3.0.0", line: 2 },
  ]);
});

test("keeps the value without comments and skips commented-out entries", () => {
  assert.deepEqual(
    parsePubspecLock(
      'packages:\n  # old:\n  #   source: git\n  http:\n    source: hosted # pinned\n    version: "1.0.0" # pinned\n',
    ),
    [hosted("http", "1.0.0", 6)],
  );
  assert.deepEqual(parsePubspecLock('sdks:\n  dart: ">=2.19.0 <3.0.0" # dart\n'), [
    { kind: "dart-sdk", value: ">=2.19.0 <3.0.0", line: 2 },
  ]);
});

test("reads the version key whatever its position among the entry's keys", () => {
  assert.deepEqual(parsePubspecLock('packages:\n  http:\n    version: "1.0.0"\n    source: hosted\n'), [hosted("http", "1.0.0", 3)]);
});

test("accepts pre-release and build versions, single quotes, CRLF, and a byte order mark", () => {
  assert.deepEqual(
    parsePubspecLock('packages:\n  http:\n    source: hosted\n    version: "2.0.0-dev.1"\n  provider:\n    source: hosted\n    version: 6.1.5+1\n'),
    [hosted("http", "2.0.0-dev.1", 4), hosted("provider", "6.1.5+1", 7)],
  );
  assert.deepEqual(parsePubspecLock("sdks:\n  dart: '>=3.0.0 <4.0.0'\n"), [
    { kind: "dart-sdk", value: ">=3.0.0 <4.0.0", line: 2 },
  ]);
  assert.deepEqual(
    parsePubspecLock(
      'packages:\r\n  http:\r\n    source: hosted\r\n    version: "1.0.0"\r\nsdks:\r\n  dart: ">=3.0.0"\r\n',
    ),
    [hosted("http", "1.0.0", 4), { kind: "dart-sdk", value: ">=3.0.0", line: 6 }],
  );
  assert.deepEqual(parsePubspecLock('\uFEFFpackages:\n  http:\n    source: hosted\n    version: "1.0.0"\n'), [
    hosted("http", "1.0.0", 4),
  ]);
});

test("a malformed document returns nothing for the whole file", () => {
  for (const contents of [
    'packages:\n  http:\n    source: hosted\n    version: "1.0.0\n',
    'packages:\n  http:\n    source: hosted\n    version: "1.0.0" trailing\n',
    "packages:\n\thttp:\n",
    "packages:\n  http:\n\tsource: hosted\n",
    'packages:\n  http:\n    source: hosted\n    version: "1.0.0"\n  http:\n    source: hosted\n    version: "1.1.0"\n',
    'packages:\n  http:\n    source: hosted\n    version: "1.0.0"\n    version: "1.1.0"\n',
    'sdks:\n  dart: ">=3.0.0"\n  dart: ">=2.0.0"\n',
    'packages:\n  http:\n    source: hosted\n    version: "1.0.0"\npackages:\n',
    'packages:\n    http:\n      source: hosted\n      version: "1.0.0"\n  intl:\n    source: hosted\n    version: "1.0.0"\n',
    'packages:\n  http:\n      source: hosted\n    version: "1.0.0"\n',
    "packages:\n  http:\n    source: hosted\n    version: [1.6.0\n",
    "packages:\n  http:\n    source: hosted\n    version: [1.0.0] trailing\n",
    "sdks:\n  dart: [>=3.0.0\n",
    "}}}\n",
    "\u0000\u0001",
    "\r\n\r\n",
    "- item\n",
    "packages: [\n",
  ]) {
    assert.doesNotThrow(() => parsePubspecLock(contents));
    assert.deepEqual(parsePubspecLock(contents), [], contents);
  }
});

test("bounds untrusted input: an over-long line or an over-large file returns nothing", () => {
  const entry = 'packages:\n  http:\n    source: hosted\n    version: "1.0.0"\n';
  assert.deepEqual(parsePubspecLock(entry), [hosted("http", "1.0.0", 4)]);
  assert.deepEqual(parsePubspecLock(`${entry}# ${"x".repeat(MAXIMUM_LINE_LENGTH)}\n`), []);
  assert.deepEqual(parsePubspecLock(`${entry}${"# padding\n".repeat(Math.ceil(MAXIMUM_INPUT_BYTES / 10) + 1)}`), []);
  assert.deepEqual(parsePubspecLock(`x: ${"a".repeat(MAXIMUM_LINE_LENGTH)}\nsdks:\n  dart: ">=3.0.0"\n`), []);
});

test("parsing is deterministic", async () => {
  const contents = await fixture("positive/pubspec.lock");
  assert.deepEqual(parsePubspecLock(contents), parsePubspecLock(contents));
});
