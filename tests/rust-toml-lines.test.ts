import assert from "node:assert/strict";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, MAXIMUM_LINE_LENGTH, readTomlLines } from "../src/detectors/rust/toml-lines.js";

test("readTomlLines returns headers and key-value lines with their table and 1-based line", () => {
  assert.deepEqual(readTomlLines('[package]\nname = "x" # comment\n[[bin]]\nname = "y"\n'), [
    { line: 1, table: "package", arrayTable: false, header: "package" },
    {
      line: 2,
      table: "package",
      arrayTable: false,
      key: "name",
      value: '"x"',
    },
    { line: 3, table: "bin", arrayTable: true, header: "bin" },
    { line: 4, table: "bin", arrayTable: false, key: "name", value: '"y"' },
  ]);
});

test("readTomlLines skips the inside of multi-line strings and arrays", () => {
  const lines = readTomlLines('description = """\nnot = "a"\n"""\nfeatures = [\n  "a",\n  "b",\n]\nafter = 1\n');
  assert.deepEqual(
    lines?.map((line) => [line.line, line.key]),
    [
      [1, "description"],
      [4, "features"],
      [8, "after"],
    ],
  );
  assert.equal(lines?.[1]?.value, undefined, "a value that spans lines is absent");
});

test("readTomlLines reads CRLF line endings with 1-based lines", () => {
  assert.deepEqual(readTomlLines("[a]\r\nb = 1\r\n"), [
    { line: 1, table: "a", arrayTable: false, header: "a" },
    { line: 2, table: "a", arrayTable: false, key: "b", value: "1" },
  ]);
});

test("readTomlLines returns undefined for a table header that is not closed", () => {
  assert.equal(readTomlLines('[package\nname = "x"\n'), undefined);
});

test("readTomlLines returns undefined for a line without a key or without an equals sign", () => {
  assert.equal(readTomlLines('= "x"\n'), undefined);
  assert.equal(readTomlLines("loose words\n"), undefined);
});

test("readTomlLines returns undefined for an unbalanced quote", () => {
  assert.equal(readTomlLines('name = "x\n'), undefined);
});

test("readTomlLines returns undefined when brackets close more than they open", () => {
  assert.equal(readTomlLines("a = ]\n"), undefined);
});

test("readTomlLines returns undefined for a line or an input over the bounds", () => {
  assert.equal(readTomlLines(`name = "${"x".repeat(MAXIMUM_LINE_LENGTH)}"\n`), undefined);
  assert.equal(readTomlLines("#".repeat(MAXIMUM_INPUT_BYTES + 1)), undefined);
});
