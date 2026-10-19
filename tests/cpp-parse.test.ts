import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseCmakeLists,
} from "../src/detectors/cpp/parse-cmakelists.js";

const fixtures = resolve("tests/fixtures/cpp");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses the minimum version, language standards, and compiler checks from CMakeLists.txt with exact lines", async () => {
  assert.deepEqual(parseCmakeLists(await fixture("positive/CMakeLists.txt")), [
    { kind: "cmake-minimum-required", value: "3.16", line: 1 },
    { kind: "language-standard", language: "c", value: "99", line: 5 },
    { kind: "language-standard", language: "cxx", value: "17", line: 6 },
    { kind: "compiler-check", language: "c", compiler: "GNU", comparison: "VERSION_LESS", value: "9.3", line: 9 },
    { kind: "compiler-check", language: "cxx", compiler: "GNU", comparison: "VERSION_LESS", value: "9.3", line: 13 },
  ]);
});

test("a valid CMakeLists.txt with no lifecycle findings still parses its declarations", async () => {
  assert.deepEqual(parseCmakeLists(await fixture("zero/CMakeLists.txt")), [
    { kind: "cmake-minimum-required", value: "3.31", line: 1 },
    { kind: "language-standard", language: "c", value: "17", line: 5 },
    { kind: "language-standard", language: "cxx", value: "20", line: 6 },
    { kind: "compiler-check", language: "cxx", compiler: "GNU", comparison: "VERSION_LESS", value: "13.2", line: 9 },
  ]);
});

test("ignores comments, unrelated keys, and dynamic values", async () => {
  assert.deepEqual(parseCmakeLists(await fixture("negative/CMakeLists.txt")), []);
});

test("a malformed CMakeLists.txt returns nothing and never throws", async () => {
  const contents = await fixture("malformed/CMakeLists.txt");
  assert.doesNotThrow(() => parseCmakeLists(contents));
  assert.deepEqual(parseCmakeLists(contents), []);
  for (const junk of ['set(CMAKE_CXX_STANDARD "17\n', "cmake_minimum_required(VERSION 3.16\n", ")", "\u0000\u0001", "}}}\n"]) {
    assert.doesNotThrow(() => parseCmakeLists(junk));
    assert.deepEqual(parseCmakeLists(junk), []);
  }
});

test("matches command names case-insensitively and accepts quoted values and FATAL_ERROR", () => {
  assert.deepEqual(parseCmakeLists('CMake_Minimum_Required(VERSION "3.20")'), [
    { kind: "cmake-minimum-required", value: "3.20", line: 1 },
  ]);
  assert.deepEqual(parseCmakeLists("cmake_minimum_required(VERSION 3.16 FATAL_ERROR)"), [
    { kind: "cmake-minimum-required", value: "3.16", line: 1 },
  ]);
  assert.deepEqual(parseCmakeLists('set(CMAKE_C_STANDARD "11")'), [
    { kind: "language-standard", language: "c", value: "11", line: 1 },
  ]);
});

test("commands and values may span lines, and the value line is reported", () => {
  const contents = ["cmake_minimum_required(", "  VERSION 3.16", ")", "set(CMAKE_CXX_STANDARD", "  20)", ""].join("\n");
  assert.deepEqual(parseCmakeLists(contents), [
    { kind: "cmake-minimum-required", value: "3.16", line: 2 },
    { kind: "language-standard", language: "cxx", value: "20", line: 5 },
  ]);
});

test("ignores comments, trailing comments, and bracket comments", () => {
  assert.deepEqual(parseCmakeLists("# cmake_minimum_required(VERSION 2.8)\n# set(CMAKE_CXX_STANDARD 98)\n"), []);
  assert.deepEqual(parseCmakeLists("set(CMAKE_CXX_STANDARD 17) # pinned\n"), [
    { kind: "language-standard", language: "cxx", value: "17", line: 1 },
  ]);
  const block = ["#[[", "cmake_minimum_required(VERSION 2.8)", "set(CMAKE_CXX_STANDARD 98)", "]]", "cmake_minimum_required(VERSION 3.16)", ""];
  assert.deepEqual(parseCmakeLists(block.join("\n")), [
    { kind: "cmake-minimum-required", value: "3.16", line: 5 },
  ]);
  assert.deepEqual(parseCmakeLists("#[=[\nset(CMAKE_CXX_STANDARD 98)\n]=]\ncmake_minimum_required(VERSION 3.16)\n"), [
    { kind: "cmake-minimum-required", value: "3.16", line: 4 },
  ]);
  assert.deepEqual(parseCmakeLists("#[[ never closed\ncmake_minimum_required(VERSION 3.16)\n"), []);
});

test("returns nothing for configure-time values, generator expressions, and unsupported set forms", () => {
  for (const contents of [
    "cmake_minimum_required(VERSION ${MINIMUM_CMAKE_VERSION})\n",
    "cmake_minimum_required(VERSION $ENV{CMAKE_MIN})\n",
    "cmake_minimum_required(VERSION $CACHE{MINIMUM_CMAKE_VERSION})\n",
    "cmake_minimum_required(VERSION 3.16...3.27)\n",
    "set(CMAKE_CXX_STANDARD ${REQUIRED_CXX_STANDARD})\n",
    "set(CMAKE_CXX_STANDARD $<IF:$<BOOL:${X}>,17,20>)\n",
    "set(REQUIRED_CXX_STANDARD 17)\n",
    "set(PROJECT_VERSION 1.0)\n",
    "set(CMAKE_CXX_STANDARD_REQUIRED ON)\n",
    "set(CMAKE_CXX_STANDARD 17 CACHE STRING \"C++ standard\")\n",
    "set(CMAKE_CXX_STANDARD 17 PARENT_SCOPE)\n",
  ]) {
    assert.deepEqual(parseCmakeLists(contents), [], contents);
  }
});

test("reads compiler checks only when the compiler id and a version comparison are both literal", () => {
  assert.deepEqual(
    parseCmakeLists('if(CMAKE_CXX_COMPILER_ID STREQUAL "Clang" AND CMAKE_CXX_COMPILER_VERSION VERSION_GREATER_EQUAL 15.0)'),
    [{ kind: "compiler-check", language: "cxx", compiler: "Clang", comparison: "VERSION_GREATER_EQUAL", value: "15.0", line: 1 }],
  );
  assert.deepEqual(
    parseCmakeLists('if(CMAKE_C_COMPILER_ID STREQUAL "MSVC" AND (CMAKE_C_COMPILER_VERSION VERSION_LESS 19.20))'),
    [{ kind: "compiler-check", language: "c", compiler: "MSVC", comparison: "VERSION_LESS", value: "19.20", line: 1 }],
  );
  for (const contents of [
    'if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")\n',
    "if(CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)\n",
    'if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" OR CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)\n',
    'if(NOT CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)\n',
    'if(CMAKE_CXX_COMPILER_ID MATCHES "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)\n',
    '"GNU" STREQUAL CMAKE_CXX_COMPILER_ID AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3\n',
    'if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS ${MINIMUM_VERSION})\n',
    'if(CMAKE_CXX_COMPILER_ID STREQUAL "" AND CMAKE_CXX_COMPILER_VERSION VERSION_LESS 9.3)\n',
  ]) {
    assert.deepEqual(parseCmakeLists(contents), [], contents);
  }
});

test("handles CRLF, blank lines, and 1-based lines", () => {
  const contents = "\r\ncmake_minimum_required(VERSION 3.21)\r\n\r\nset(CMAKE_C_STANDARD 17)\r\n";
  const declarations = parseCmakeLists(contents);
  assert.deepEqual(declarations, [
    { kind: "cmake-minimum-required", value: "3.21", line: 2 },
    { kind: "language-standard", language: "c", value: "17", line: 4 },
  ]);
  assert.deepEqual(parseCmakeLists(contents), declarations);
});

test("bounds untrusted input without losing later lines", () => {
  assert.deepEqual(parseCmakeLists("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseCmakeLists(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\ncmake_minimum_required(VERSION 3.16)\n`), [
    { kind: "cmake-minimum-required", value: "3.16", line: 2 },
  ]);
  for (const junk of ["\u0000\u0001", "\uFEFF", "}}}\n", "\r\n\r\n"]) {
    assert.doesNotThrow(() => parseCmakeLists(junk));
  }
});
