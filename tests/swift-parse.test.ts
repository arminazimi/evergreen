import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES as RESOLVED_MAXIMUM_INPUT_BYTES, parsePackageResolved } from "../src/detectors/swift/parse-package-resolved.js";
import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parsePackageSwift,
} from "../src/detectors/swift/parse-package-swift.js";
import { MAXIMUM_PROJECT_BYTES, parseXcodeProjectIOSDeploymentTargets } from "../src/detectors/swift/parse-xcode-project.js";
import {
  MAXIMUM_INPUT_BYTES as TOOLCHAIN_MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH as TOOLCHAIN_MAXIMUM_LINE_LENGTH,
  parseSwiftVersion,
  parseXcodeVersion,
} from "../src/detectors/swift/parse-swift-toolchain.js";

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

test("Package.resolved: reads pin versions with the line of state.version", async () => {
  assert.deepEqual(parsePackageResolved(await fixture("positive/Package.resolved")), [
    { identity: "swift-argument-parser", value: "1.2.3", line: 9 },
    { identity: "swift-log", value: "1.5.3", line: 18 },
  ]);
  assert.deepEqual(parsePackageResolved(await fixture("zero/Package.resolved")), [
    { identity: "swift-argument-parser", value: "1.3.0", line: 9 },
  ]);
});

test("Package.resolved: ignores branch-only, revision-only, and fileSystem pins", async () => {
  assert.deepEqual(parsePackageResolved(await fixture("negative/Package.resolved")), []);
});

test("Package.resolved: malformed and truncated JSON returns nothing", async () => {
  const malformed = await fixture("malformed/Package.resolved");
  assert.doesNotThrow(() => parsePackageResolved(malformed));
  assert.deepEqual(parsePackageResolved(malformed), []);
  for (const junk of ["", "{", '{"pins":', "\u0000", '{"version":2}']) {
    assert.doesNotThrow(() => parsePackageResolved(junk));
    assert.deepEqual(parsePackageResolved(junk), []);
  }
  assert.deepEqual(parsePackageResolved("x".repeat(RESOLVED_MAXIMUM_INPUT_BYTES + 1)), []);
});

test("Package.resolved: ignores the file format version and legacy v1 object.pins", () => {
  assert.deepEqual(
    parsePackageResolved('{"pins":[],"version":2}\n'),
    [],
  );
  assert.deepEqual(
    parsePackageResolved(
      JSON.stringify({
        object: {
          pins: [{ package: "legacy", repositoryURL: "https://example.com/a", state: { version: "1.0.0" } }],
        },
        version: 1,
      }),
    ),
    [],
  );
});

test("parses .swift-version and .xcode-version pins with exact lines", async () => {
  assert.deepEqual(parseSwiftVersion(await fixture("positive/.swift-version")), [{ value: "5.9", line: 1 }]);
  assert.deepEqual(parseXcodeVersion(await fixture("positive/.xcode-version")), [{ value: "15.4", line: 1 }]);
  assert.deepEqual(parseSwiftVersion(await fixture("zero/.swift-version")), [{ value: "6.0", line: 1 }]);
  assert.deepEqual(parseXcodeVersion(await fixture("zero/.xcode-version")), [{ value: "26.0", line: 1 }]);
});

test("ignores moving names, comments, and non-version tokens in toolchain pins", async () => {
  assert.deepEqual(parseSwiftVersion(await fixture("negative/.swift-version")), []);
  assert.deepEqual(parseXcodeVersion(await fixture("negative/.xcode-version")), []);
});

test("malformed and empty toolchain pins return nothing and never throw", async () => {
  assert.deepEqual(parseSwiftVersion(await fixture("malformed/.swift-version")), []);
  assert.deepEqual(parseXcodeVersion(await fixture("malformed/.xcode-version")), []);
  for (const parser of [parseSwiftVersion, parseXcodeVersion]) {
    for (const junk of ["\u0000\u0001", "\uFEFF", "latest", "stable", "\r\n\r\n", "x".repeat(TOOLCHAIN_MAXIMUM_LINE_LENGTH + 1)]) {
      assert.doesNotThrow(() => parser(junk));
      assert.deepEqual(parser(junk), []);
    }
  }
});

test("toolchain pins bound untrusted input and keep a later valid line", () => {
  assert.deepEqual(parseSwiftVersion("x".repeat(TOOLCHAIN_MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseXcodeVersion("x".repeat(TOOLCHAIN_MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseSwiftVersion(`${"x".repeat(TOOLCHAIN_MAXIMUM_LINE_LENGTH + 1)}\n5.9\n`), [{ value: "5.9", line: 2 }]);
  assert.deepEqual(parseXcodeVersion(`${"x".repeat(TOOLCHAIN_MAXIMUM_LINE_LENGTH + 1)}\n15.4\n`), [{ value: "15.4", line: 2 }]);
});

test("toolchain pins handle CRLF, blank lines, comments, and reject multiple pins", () => {
  assert.deepEqual(parseSwiftVersion("5.9\r\n"), [{ value: "5.9", line: 1 }]);
  assert.deepEqual(parseSwiftVersion("\n# pinned\n  5.9  \n"), [{ value: "5.9", line: 3 }]);
  assert.deepEqual(parseXcodeVersion("# 15.4 was old\n15.4\n"), [{ value: "15.4", line: 2 }]);
  assert.deepEqual(parseSwiftVersion("5.9\n6.0\n"), []);
  assert.deepEqual(parseXcodeVersion("15.4\n16.2\n"), []);
});

/** A minimal Xcode project: one app target with two configurations, one library target, and one app target that inherits its minimum. */
function xcodeProject(options: { appProductType?: string; appDeployment?: string; libraryDeployment?: string } = {}): string {
  const appDeployment = options.appDeployment ?? "12.0";
  const libraryDeployment = options.libraryDeployment ?? "12.0";
  const lines = [
    "// !$*UTF8*$!",
    "{",
    "\tobjects = {",
    "",
    "/* Begin PBXNativeTarget section */",
    "\t\tA100000000000000000000A1 /* MyApp */ = {",
    "\t\t\tisa = PBXNativeTarget;",
    "\t\t\tbuildConfigurationList = B100000000000000000000B1 /* Build configuration list for PBXNativeTarget \"MyApp\" */;",
    `\t\t\tproductType = "${options.appProductType ?? "com.apple.product-type.application"}";`,
    "\t\t};",
    "\t\tA200000000000000000000A2 /* MyKit */ = {",
    "\t\t\tisa = PBXNativeTarget;",
    "\t\t\tbuildConfigurationList = B200000000000000000000B2 /* Build configuration list for PBXNativeTarget \"MyKit\" */;",
    `\t\t\tproductType = "com.apple.product-type.framework";`,
    "\t\t};",
    "/* End PBXNativeTarget section */",
    "",
    "/* Begin XCBuildConfiguration section */",
    "\t\tC100000000000000000000C1 /* Debug */ = {",
    "\t\t\tisa = XCBuildConfiguration;",
    "\t\t\tbuildSettings = {",
    `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${appDeployment};`,
    "\t\t\t\tPRODUCT_NAME = MyApp;",
    "\t\t\t};",
    "\t\t\tname = Debug;",
    "\t\t};",
    "\t\tC200000000000000000000C2 /* Release */ = {",
    "\t\t\tisa = XCBuildConfiguration;",
    "\t\t\tbuildSettings = {",
    `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${appDeployment};`,
    "\t\t\t};",
    "\t\t\tname = Release;",
    "\t\t};",
    "\t\tC300000000000000000000C3 /* Debug */ = {",
    "\t\t\tisa = XCBuildConfiguration;",
    "\t\t\tbuildSettings = {",
    `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${libraryDeployment};`,
    "\t\t\t};",
    "\t\t\tname = Debug;",
    "\t\t};",
    "\t\tC400000000000000000000C4 /* Release */ = {",
    "\t\t\tisa = XCBuildConfiguration;",
    "\t\t\tbuildSettings = {",
    "\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = \"$(inherited)\";",
    "\t\t\t};",
    "\t\t\tname = Release;",
    "\t\t};",
    "/* End XCBuildConfiguration section */",
    "",
    "/* Begin XCConfigurationList section */",
    "\t\tB100000000000000000000B1 /* Build configuration list for PBXNativeTarget \"MyApp\" */ = {",
    "\t\t\tisa = XCConfigurationList;",
    "\t\t\tbuildConfigurations = (",
    "\t\t\t\tC100000000000000000000C1 /* Debug */,",
    "\t\t\t\tC200000000000000000000C2 /* Release */,",
    "\t\t\t);",
    "\t\t\tdefaultConfigurationIsVisible = 0;",
    "\t\t};",
    "\t\tB200000000000000000000B2 /* Build configuration list for PBXNativeTarget \"MyKit\" */ = {",
    "\t\t\tisa = XCConfigurationList;",
    "\t\t\tbuildConfigurations = (",
    "\t\t\t\tC300000000000000000000C3 /* Debug */,",
    "\t\t\t\tC400000000000000000000C4 /* Release */,",
    "\t\t\t);",
    "\t\t};",
    "/* End XCConfigurationList section */",
    "\t};",
    "}",
    "",
  ];
  return lines.join("\n");
}

test("reads the iOS deployment target of each build configuration of an app target", () => {
  const declarations = parseXcodeProjectIOSDeploymentTargets(xcodeProject());
  assert.deepEqual(declarations, [
    { value: "12.0", line: 22 },
    { value: "12.0", line: 30 },
  ]);
});

test("reads no deployment target from a library target or a non-application product", () => {
  assert.deepEqual(parseXcodeProjectIOSDeploymentTargets(xcodeProject({ appProductType: "com.apple.product-type.framework" })), []);
  assert.deepEqual(parseXcodeProjectIOSDeploymentTargets(xcodeProject({ appDeployment: "13.0" })), [
    { value: "13.0", line: 22 },
    { value: "13.0", line: 30 },
  ]);
});

test("skips inherited, variable, and non-numeric deployment targets", () => {
  assert.deepEqual(parseXcodeProjectIOSDeploymentTargets(xcodeProject({ appDeployment: "$(IOS_DEPLOYMENT_TARGET)" })), []);
});

test("returns nothing for a truncated, oversized, or ambiguous project", () => {
  const complete = xcodeProject();
  const truncated = complete.slice(0, complete.indexOf("\t\t\tname = Release;"));
  assert.deepEqual(parseXcodeProjectIOSDeploymentTargets(truncated), []);
  assert.deepEqual(parseXcodeProjectIOSDeploymentTargets(complete + " ".repeat(MAXIMUM_PROJECT_BYTES)), []);
  const duplicated = complete.replace("C200000000000000000000C2 /* Release */ = {", "C100000000000000000000C1 /* Debug */ = {");
  assert.deepEqual(parseXcodeProjectIOSDeploymentTargets(duplicated), []);
});
