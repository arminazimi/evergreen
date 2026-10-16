import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, parseGoMod } from "../src/detectors/go/parse-go-mod.js";
import { parseGoWork } from "../src/detectors/go/parse-go-work.js";

async function goModFixture(caseName: string): Promise<string> {
  return readFile(resolve("tests/fixtures/go", caseName, "go.mod"), "utf8");
}

async function goWorkFixture(caseName: string): Promise<string> {
  return readFile(resolve("tests/fixtures/go", caseName, "go.work"), "utf8");
}

test("parses static go.mod declarations with exact lines", async () => {
  assert.deepEqual(parseGoMod(await goModFixture("positive")), [
    { kind: "go", value: "1.22.4", line: 3 },
    { kind: "toolchain", value: "go1.23.1", line: 5 },
    { kind: "require", module: "example.com/direct/single", value: "v1.2.3", line: 7 },
    { kind: "require", module: "example.com/direct/block", value: "v2.3.4", line: 10 },
  ]);
});

test("ignores comments, unrelated keys, dynamic values, and indirect requirements", async () => {
  assert.deepEqual(parseGoMod(await goModFixture("negative")), []);
  assert.deepEqual(parseGoMod(await goModFixture("zero")), []);
});

test("malformed input returns nothing and never throws", async () => {
  const malformed = await goModFixture("malformed");
  assert.doesNotThrow(() => parseGoMod(malformed));
  assert.deepEqual(parseGoMod(malformed), []);
  for (const junk of ["\u0000\u0001\u0002", "\uFEFF", "}}}{{{", "\r\n\r\n", "a\nb\n".repeat(1000)]) {
    assert.doesNotThrow(() => parseGoMod(junk));
  }
});

test("bounds untrusted input without affecting adjacent valid declarations", () => {
  assert.deepEqual(parseGoMod("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(parseGoMod(`${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\ngo 1.22.4\n`), [
    { kind: "go", value: "1.22.4", line: 2 },
  ]);
});

test("handles CRLF deterministically and reports 1-based lines", () => {
  const contents = "module example.com/test\r\n\r\ngo 1.21.0\r\ntoolchain go1.22.2\r\n";
  const declarations = parseGoMod(contents);
  assert.deepEqual(declarations, [
    { kind: "go", value: "1.21.0", line: 3 },
    { kind: "toolchain", value: "go1.22.2", line: 4 },
  ]);
  assert.deepEqual(parseGoMod(contents), declarations);
});

test("parses static go.work directives with exact lines", async () => {
  assert.deepEqual(parseGoWork(await goWorkFixture("positive")), [
    { kind: "go", value: "1.22.4", line: 1 },
    { kind: "toolchain", value: "go1.23.1", line: 3 },
  ]);
});

test("go.work comments, unrelated paths, dynamic values, and zero cases produce nothing", async () => {
  assert.deepEqual(parseGoWork(await goWorkFixture("negative")), []);
  assert.deepEqual(parseGoWork(await goWorkFixture("zero")), []);
});

test("malformed go.work input returns nothing and never throws", async () => {
  const malformed = await goWorkFixture("malformed");
  assert.doesNotThrow(() => parseGoWork(malformed));
  assert.deepEqual(parseGoWork(malformed), []);
  assert.deepEqual(parseGoWork("go 1.22.4\nreplace (\nexample.com/old => ./new\n"), []);
});

test("go.work parsing is bounded, deterministic, and handles CRLF", () => {
  assert.deepEqual(parseGoWork("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  const contents = `${"x".repeat(MAXIMUM_LINE_LENGTH + 1)}\r\ngo 1.21.0\r\ntoolchain go1.22.2\r\n`;
  const declarations = parseGoWork(contents);
  assert.deepEqual(declarations, [
    { kind: "go", value: "1.21.0", line: 2 },
    { kind: "toolchain", value: "go1.22.2", line: 3 },
  ]);
  assert.deepEqual(parseGoWork(contents), declarations);
});

