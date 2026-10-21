import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parsePubspec,
} from "../src/detectors/dart/parse-pubspec.js";

const fixtures = resolve("tests/fixtures/dart");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses the environment constraints and direct dependencies of a pubspec.yaml with exact lines", async () => {
  assert.deepEqual(parsePubspec(await fixture("positive/pubspec.yaml")), [
    { kind: "dart-sdk", value: ">=2.19.0 <3.0.0", line: 7 },
    { kind: "flutter-sdk", value: ">=3.7.0", line: 8 },
    { kind: "pub-dependency", name: "http", value: "^0.13.5", line: 13 },
    { kind: "pub-dependency", name: "intl", value: "0.17.0", line: 14 },
    { kind: "pub-dependency", name: "provider", value: "^6.0.5", line: 15 },
    { kind: "pub-dependency", name: "shared_preferences", value: "^2.0.15", line: 16 },
  ]);
  assert.deepEqual(parsePubspec(await fixture("zero/pubspec.yaml")), [
    { kind: "dart-sdk", value: ">=3.13.0 <4.0.0", line: 7 },
    { kind: "flutter-sdk", value: ">=3.47.0", line: 8 },
    { kind: "pub-dependency", name: "http", value: "^1.6.0", line: 13 },
    { kind: "pub-dependency", name: "intl", value: "^0.20.3", line: 14 },
    { kind: "pub-dependency", name: "provider", value: "^6.1.5", line: 15 },
    { kind: "pub-dependency", name: "shared_preferences", value: "^2.5.6", line: 16 },
  ]);
});

test("a negative pubspec.yaml produces no declarations", async () => {
  assert.deepEqual(parsePubspec(await fixture("negative/pubspec.yaml")), []);
});

test("a malformed pubspec.yaml returns nothing, not partial declarations, and never throws", async () => {
  const contents = await fixture("malformed/pubspec.yaml");
  assert.doesNotThrow(() => parsePubspec(contents));
  assert.deepEqual(parsePubspec(contents), []);
});

test("ignores any, templates, nested mappings, path and git sources, and lookalike values", () => {
  for (const contents of [
    "environment:\n  sdk: any\n  flutter: any\n",
    "environment:\n  sdk:\n  flutter:\n",
    "environment:\n  sdk: ^3.0\n",
    "environment:\n  sdk: 3\n",
    "environment:\n  sdk: =3.0.0\n",
    "environment:\n  sdk: \">=3.0.0 || <2.0.0\"\n",
    "environment:\n  sdk: \">=${MIN_SDK}\"\n",
    "environment:\n  sdk: >=2.19.0\n",
    "environment:\n  sdk: [\"3.0.0\"]\n",
    "environment: { sdk: \">=3.0.0\" }\n",
    "dependencies: { http: ^1.0.0 }\n",
    "dependencies:\n  flutter:\n    sdk: flutter\n  local_ui:\n    path: ../local_ui\n  git_tool:\n    git:\n      url: https://example.com/git_tool.git\n",
    "dependencies:\n  hosted_without_version:\n    hosted: https://pub.example.com\n",
    "dependencies:\n  http:\n    hosted: https://pub.example.com\n    version: ^1.0.0\n",
    "dependencies:\n  template:\n    version: ${PUB_VERSION}\n",
    "dependencies:\n  http: ${PUB_VERSION}\n",
    "dependencies:\n  http: ^1.0.0 || ^2.0.0\n",
    "dependencies:\n  Http: ^1.0.0\n",
    "dependencies:\n  my-pkg: ^1.0.0\n",
    "dependencies:\n  \"http\": ^1.0.0\n",
    "dependencies:\n  http: ^1.0\n",
    "dev_dependencies:\n  http: ^1.0.0\ndependency_overrides:\n  http: ^2.0.0\n",
    "description: \"sdk: ^3.0.0\"\n",
    "# environment:\n#   sdk: \">=3.0.0 <4.0.0\"\n# dependencies:\n#   http: ^1.0.0\n",
  ]) {
    assert.deepEqual(parsePubspec(contents), [], contents);
  }
});

test("a plain value that continues on a more-indented line is not read", () => {
  assert.deepEqual(parsePubspec("environment:\n  sdk: ^3.0.0\n    <4.0.0\n"), []);
  assert.deepEqual(parsePubspec("dependencies:\n  http: ^0.13.5\n    intl\n  provider: ^6.0.5\n"), [
    { kind: "pub-dependency", name: "provider", value: "^6.0.5", line: 4 },
  ]);
});

test("a quoted scalar that spans lines or contains escapes is not read, but later lines are", () => {
  assert.deepEqual(parsePubspec('environment:\n  sdk: ">=3.0.0\n    <4.0.0"\n  flutter: ">=3.7.0"\n'), [
    { kind: "flutter-sdk", value: ">=3.7.0", line: 4 },
  ]);
  assert.deepEqual(parsePubspec('environment:\n  sdk: "\\x3E3.0.0"\n'), []);
});

test("reads only the environment and dependencies sections and their direct children", () => {
  assert.deepEqual(parsePubspec("environment:\n  sdk: ^3.0.0\n  dart: ^2.0.0\n"), [
    { kind: "dart-sdk", value: "^3.0.0", line: 2 },
  ]);
  assert.deepEqual(parsePubspec("dependencies:\n  flutter:\n    sdk: flutter\n  http: ^1.0.0\n"), [
    { kind: "pub-dependency", name: "http", value: "^1.0.0", line: 4 },
  ]);
  assert.deepEqual(parsePubspec("description: Mentions sdk ^3.0.0.\nenvironment:\n  sdk: ^3.0.0\n"), [
    { kind: "dart-sdk", value: "^3.0.0", line: 3 },
  ]);
});

test("keeps the constraint without comments and skips commented-out entries", () => {
  assert.deepEqual(parsePubspec('environment:\n  # sdk: ">=2.0.0 <3.0.0"\n  sdk: ^3.0.0 # sdk: ^2.0.0\n'), [
    { kind: "dart-sdk", value: "^3.0.0", line: 3 },
  ]);
  assert.deepEqual(parsePubspec('environment:\n  sdk: ">=3.0.0 <4.0.0" # pinned\n'), [
    { kind: "dart-sdk", value: ">=3.0.0 <4.0.0", line: 2 },
  ]);
  assert.deepEqual(parsePubspec("dependencies:\n  http: ^1.0.0 # pinned\n"), [
    { kind: "pub-dependency", name: "http", value: "^1.0.0", line: 2 },
  ]);
});

test("accepts pre-release constraints, single quotes, CRLF, and a byte order mark", () => {
  assert.deepEqual(parsePubspec("dependencies:\n  http: 1.0.0-dev.1\n"), [
    { kind: "pub-dependency", name: "http", value: "1.0.0-dev.1", line: 2 },
  ]);
  assert.deepEqual(parsePubspec("environment:\n  sdk: '>=3.0.0 <4.0.0'\n"), [
    { kind: "dart-sdk", value: ">=3.0.0 <4.0.0", line: 2 },
  ]);
  assert.deepEqual(
    parsePubspec('environment:\r\n  sdk: ">=3.0.0 <4.0.0"\r\n  flutter: "^3.7.0"\r\n\r\ndependencies:\r\n  http: ^1.0.0 # pinned\r\n'),
    [
      { kind: "dart-sdk", value: ">=3.0.0 <4.0.0", line: 2 },
      { kind: "flutter-sdk", value: "^3.7.0", line: 3 },
      { kind: "pub-dependency", name: "http", value: "^1.0.0", line: 6 },
    ],
  );
  assert.deepEqual(parsePubspec("\uFEFFenvironment:\n  sdk: ^3.0.0\n"), [{ kind: "dart-sdk", value: "^3.0.0", line: 2 }]);
});

test("a malformed document returns nothing for the whole file", () => {
  for (const contents of [
    'environment:\n  sdk: ">=3.13.0 <4.0.0\n  flutter: ">=3.47.0"\n',
    'dependencies:\n  http: "^1.0.0\n',
    'environment:\n  sdk: ">=3.0.0" trailing\n  flutter: ">=3.7.0"\n',
    "environment:\n\tsdk: \">=3.0.0\"\n",
    "dependencies:\n  http: ^1.0.0\n\t  intl: ^0.20.3\n",
    "dependencies:\n  http: ^1.0.0\n  http: ^1.1.0\n",
    "environment:\n  sdk: ^3.0.0\nenvironment:\n  sdk: ^2.0.0\n",
    "environment:\n    sdk: ^3.0.0\n  flutter: ^3.7.0\n",
    "}}}\n",
    "\u0000\u0001",
    "\r\n\r\n",
  ]) {
    assert.doesNotThrow(() => parsePubspec(contents));
    assert.deepEqual(parsePubspec(contents), [], contents);
  }
});

test("bounds untrusted input without losing later lines", () => {
  const dependency = "dependencies:\n  http: ^1.0.0\n";
  assert.deepEqual(parsePubspec(dependency), [{ kind: "pub-dependency", name: "http", value: "^1.0.0", line: 2 }]);
  assert.deepEqual(parsePubspec(`${dependency}#${"x".repeat(MAXIMUM_INPUT_BYTES)}`), []);
  assert.deepEqual(parsePubspec(`x: ${"a".repeat(MAXIMUM_LINE_LENGTH + 1)}\n${dependency}`), [
    { kind: "pub-dependency", name: "http", value: "^1.0.0", line: 3 },
  ]);
  assert.deepEqual(parsePubspec(`dependencies:\n  intl: ^0.20.3 # ${"x".repeat(MAXIMUM_LINE_LENGTH)}\n  http: ^1.0.0\n`), [
    { kind: "pub-dependency", name: "http", value: "^1.0.0", line: 3 },
  ]);
});

test("parsing is deterministic", async () => {
  const contents = await fixture("positive/pubspec.yaml");
  assert.deepEqual(parsePubspec(contents), parsePubspec(contents));
});
