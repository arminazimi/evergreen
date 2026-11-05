import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTf } from "../src/detectors/serverless/parse-tf.js";

// parseTf masks comments, strings, and heredocs before it reads any attribute. These cases pin that masking.

test("a comment or a string that looks like a resource is masked and yields nothing", () => {
  const source = [
    '# resource "aws_lambda_function" "a" {',
    '/* resource "aws_lambda_function" "b" { runtime = "python3.8" } */',
    'resource "aws_lambda_function" "c" {',
    '  runtime = "nodejs14.x"',
    '  description = "has \\" an escaped quote"',
    "}",
  ].join("\n");
  assert.deepEqual(parseTf(source), [{ value: "nodejs14.x", line: 4, platform: "aws" }]);
});

test("a heredoc body that looks like an attribute is masked, and the real attribute after it is read", () => {
  const source = [
    'resource "aws_lambda_function" "a" {',
    "  description = <<EOT",
    '  runtime = "python3.8"',
    "EOT",
    '  runtime = "nodejs14.x"',
    "}",
  ].join("\n");
  assert.deepEqual(parseTf(source), [{ value: "nodejs14.x", line: 5, platform: "aws" }]);
});

test("an unterminated block comment makes the whole file yield nothing", () => {
  const source = 'resource "aws_lambda_function" "a" {\n  runtime = "nodejs14.x"\n}\n/* never closed';
  assert.deepEqual(parseTf(source), []);
});

test("an unterminated double-quoted string makes the whole file yield nothing", () => {
  const source = 'resource "aws_lambda_function" "a" {\n  runtime = "nodejs14.x\n}';
  assert.deepEqual(parseTf(source), []);
});

test("a heredoc without its closing marker makes the whole file yield nothing", () => {
  const source = 'resource "aws_lambda_function" "a" {\n  x = <<EOT\n  runtime = "nodejs14.x"\n}';
  assert.deepEqual(parseTf(source), []);
});

test("a shift operator is not a heredoc and does not stall the masker", () => {
  const source = 'resource "aws_lambda_function" "a" {\n  runtime = "nodejs14.x"\n  shift = 1 << 2\n}';
  assert.deepEqual(parseTf(source), [{ value: "nodejs14.x", line: 2, platform: "aws" }]);
});
