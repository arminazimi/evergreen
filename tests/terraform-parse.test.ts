import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseTerraformFile } from "../src/detectors/terraform/parse-terraform.js";

const fixtures = resolve("tests/fixtures/terraform");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses required_version and provider constraints with exact lines", async () => {
  assert.deepEqual(parseTerraformFile(await fixture("positive/main.tf")), [
    { kind: "required_version", value: "~> 0.12.31", line: 2 },
    { kind: "provider_version", provider: "aws", source: "hashicorp/aws", value: "~> 3.0", line: 7 },
  ]);
  assert.deepEqual(parseTerraformFile(await fixture("zero/main.tf")), [
    { kind: "required_version", value: "~> 1.9.0", line: 2 },
    { kind: "provider_version", provider: "aws", source: "hashicorp/aws", value: "~> 5.0", line: 7 },
  ]);
});

test("ignores comments, variable defaults, references, modules, resources, and strings", async () => {
  assert.deepEqual(parseTerraformFile(await fixture("negative/main.tf")), []);
});

test("returns nothing for malformed files", async () => {
  assert.deepEqual(parseTerraformFile(await fixture("malformed/main.tf")), []);
  assert.deepEqual(parseTerraformFile('terraform {\n  required_version = "~> 1.0"\n'), []);
  assert.deepEqual(parseTerraformFile('terraform {\n  /* required_version = "1.0"\n}\n'), []);
  assert.deepEqual(parseTerraformFile(""), []);
});

test("supports several terraform blocks, CRLF, a byte order mark, and a provider without source", () => {
  const contents =
    '﻿terraform {\r\n  required_version = ">= 1.5"\r\n}\r\nterraform {\r\n  required_providers {\r\n    null = {\r\n      version = "3.2.1"\r\n    }\r\n  }\r\n}\r\n';
  assert.deepEqual(parseTerraformFile(contents), [
    { kind: "required_version", value: ">= 1.5", line: 2 },
    { kind: "provider_version", provider: "null", value: "3.2.1", line: 7 },
  ]);
});

test("accepts one-line blocks and trailing comments", () => {
  assert.deepEqual(parseTerraformFile('terraform { required_version = "1.5.7" }\n'), [
    { kind: "required_version", value: "1.5.7", line: 1 },
  ]);
  assert.deepEqual(parseTerraformFile('terraform {\n  required_version = "1.5.7" # pinned\n}\n'), [
    { kind: "required_version", value: "1.5.7", line: 2 },
  ]);
});

test("skips dynamic and unsupported value forms", () => {
  for (const value of [
    "var.v",
    '"${var.v}"',
    '"1.0\\n"',
    '""',
    'format("%s", "1.0")',
    '"1.0" + "x"',
    '[ "1.0" ]',
    "<<EOT\n1.0\nEOT",
  ]) {
    assert.deepEqual(parseTerraformFile(`terraform {\n  required_version = ${value}\n}\n`), [], value);
  }
  assert.deepEqual(parseTerraformFile('terraform "x" {\n  required_version = "1.0"\n}\n'), []);
  assert.deepEqual(parseTerraformFile('locals {\n  terraform {\n    required_version = "1.0"\n  }\n}\n'), []);
  assert.deepEqual(
    parseTerraformFile('terraform {\n  backend "s3" {\n    required_version = "1.0"\n  }\n}\n'),
    [],
  );
});

test("does not read nested or non-provider version attributes", () => {
  const contents = `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      configuration_aliases = [aws.west]
      nested = {
        version = "9.9.9"
      }
    }
    google = "~> 4.0"
  }
}
`;
  assert.deepEqual(parseTerraformFile(contents), []);
});

test("bounds oversized input", () => {
  const padding = "# ".padEnd(MAXIMUM_INPUT_BYTES + 1, "x");
  assert.deepEqual(parseTerraformFile(`${padding}\nterraform {\n  required_version = "1.0"\n}\n`), []);
  const longLine = `terraform {\n  required_version = "1.0"\n  # ${"x".repeat(5000)}\n}\n`;
  assert.deepEqual(parseTerraformFile(longLine), [{ kind: "required_version", value: "1.0", line: 2 }]);
});
