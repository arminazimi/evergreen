import assert from "node:assert/strict";
import { test } from "node:test";

import { maskGradleSource } from "../src/detectors/android/gradle-scan.js";

test("maskGradleSource blanks line and block comments but keeps newlines and offsets", () => {
  assert.equal(maskGradleSource("a // hi\nb"), "a      \nb");
  assert.equal(maskGradleSource("a /* x\ny */ b"), "a     \n     b");
  assert.equal(maskGradleSource("a // tail"), "a        ");
});

test("maskGradleSource blanks quoted and triple-quoted strings", () => {
  assert.equal(maskGradleSource("x 'ab' y"), "x      y");
  assert.equal(maskGradleSource('x "a\\"b" y'), "x        y");
  assert.equal(maskGradleSource('x """a\nb""" y'), "x     \n     y");
  assert.equal(maskGradleSource("x '''q''' y"), "x         y");
});

test("maskGradleSource keeps a lone slash and plain text", () => {
  assert.equal(maskGradleSource("a / b"), "a / b");
  assert.equal(maskGradleSource(""), "");
});

test("maskGradleSource returns undefined for unterminated constructs", () => {
  assert.equal(maskGradleSource("a /* open"), undefined);
  assert.equal(maskGradleSource('a """open'), undefined);
  assert.equal(maskGradleSource("a 'open"), undefined);
  assert.equal(maskGradleSource("a 'open\nb'"), undefined);
  assert.equal(maskGradleSource("a 'x\\"), undefined);
});
