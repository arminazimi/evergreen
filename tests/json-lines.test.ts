import assert from "node:assert/strict";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, member, readJsonLines } from "../src/detectors/json-lines.js";

test("comments option accepts line and block comments when enabled", () => {
  const withComments = readJsonLines('// head\n{ /* mid */ "a": 1 }\n', { comments: true });
  assert.equal(withComments?.kind, "object");
  assert.equal(member(withComments, "a")?.value.kind, "other");
  assert.equal(member(withComments, "a")?.value.line, 2);
});

test("comments option rejects line and block comments when disabled", () => {
  assert.equal(readJsonLines('{ // c\n "a": 1 }', { comments: false }), undefined);
  assert.equal(readJsonLines('{ /* c */ "a": 1 }', { comments: false }), undefined);
});

test("unterminated block comment is malformed", () => {
  assert.equal(readJsonLines('{ /* unterminated "a": 1 }', { comments: true }), undefined);
});

test("a comment marker inside a string is not a comment", () => {
  const node = readJsonLines('{ "a": "// not a comment", "b": "/* also not */" }', { comments: false });
  assert.equal(node?.kind, "object");
  const a = member(node, "a")?.value;
  const b = member(node, "b")?.value;
  assert.equal(a?.kind, "string");
  assert.equal(b?.kind, "string");
  if (a?.kind === "string") assert.equal(a.value, "// not a comment");
  if (b?.kind === "string") assert.equal(b.value, "/* also not */");
});

test("UTF-8 BOM is accepted", () => {
  const node = readJsonLines("\uFEFF{\n  \"a\": true\n}\n", { comments: false });
  assert.equal(node?.kind, "object");
  assert.equal(member(node, "a")?.value.line, 2);
});

test("booleans keep their value and line; numbers stay other", () => {
  const node = readJsonLines('{"a": true, "b": false, "c": 1, "d": null}\n', { comments: false });
  assert.equal(node?.kind, "object");
  const a = member(node, "a")?.value;
  const b = member(node, "b")?.value;
  assert.equal(a?.kind, "boolean");
  assert.equal(b?.kind, "boolean");
  if (a?.kind === "boolean") assert.equal(a.value, true);
  if (b?.kind === "boolean") assert.equal(b.value, false);
  assert.equal(member(node, "c")?.value.kind, "other");
  assert.equal(member(node, "d")?.value.kind, "other");
});

test("bounds input size and nesting depth", () => {
  assert.equal(readJsonLines("x".repeat(MAXIMUM_INPUT_BYTES + 1), { comments: false }), undefined);
  let nested = '"x"';
  for (let i = 0; i < 65; i += 1) nested = `[${nested}]`;
  assert.equal(readJsonLines(nested, { comments: false }), undefined);
  nested = '"x"';
  for (let i = 0; i < 64; i += 1) nested = `[${nested}]`;
  assert.equal(readJsonLines(nested, { comments: false })?.kind, "array");
});
