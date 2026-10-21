import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseTerraformLock } from "../src/detectors/terraform/parse-lock.js";

const fixtures = resolve("tests/fixtures/terraform");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses locked provider versions with exact lines", async () => {
  assert.deepEqual(parseTerraformLock(await fixture("positive/.terraform.lock.hcl")), [
    { address: "registry.terraform.io/hashicorp/aws", value: "3.74.0", line: 5, constraints: "~> 3.0" },
  ]);
  assert.deepEqual(parseTerraformLock(await fixture("zero/.terraform.lock.hcl")), [
    { address: "registry.terraform.io/hashicorp/aws", value: "5.70.0", line: 5, constraints: "~> 5.0" },
  ]);
});

test("ignores commented-out providers", async () => {
  assert.deepEqual(parseTerraformLock(await fixture("negative/.terraform.lock.hcl")), []);
});

test("returns nothing for an unclosed provider block", async () => {
  assert.deepEqual(parseTerraformLock(await fixture("malformed/.terraform.lock.hcl")), []);
  assert.deepEqual(parseTerraformLock(""), []);
  assert.deepEqual(
    parseTerraformLock('provider "registry.terraform.io/hashicorp/aws" {\n  version = "3.74.0\n}\n'),
    [],
  );
});

test("reads several providers, with and without constraints, in order", () => {
  const contents = `provider "registry.terraform.io/hashicorp/aws" {
  version     = "5.70.0"
  constraints = ">= 5.0.0, < 6.0.0"
  hashes = [
    "h1:abc=",
    "zh:def",
  ]
}

provider "registry.terraform.io/hashicorp/random" {
  version = "3.6.3"
}
`;
  assert.deepEqual(parseTerraformLock(contents), [
    { address: "registry.terraform.io/hashicorp/aws", value: "5.70.0", line: 2, constraints: ">= 5.0.0, < 6.0.0" },
    { address: "registry.terraform.io/hashicorp/random", value: "3.6.3", line: 11 },
  ]);
});

test("accepts CRLF and a byte order mark", () => {
  const contents = '\uFEFFprovider "registry.terraform.io/hashicorp/aws" {\r\n  version = "5.70.0"\r\n}\r\n';
  assert.deepEqual(parseTerraformLock(contents), [
    { address: "registry.terraform.io/hashicorp/aws", value: "5.70.0", line: 2 },
  ]);
});

test("skips dynamic, unlabeled, nested, and non-provider forms", () => {
  const address = '"registry.terraform.io/hashicorp/aws"';
  for (const body of ["version = var.v", 'version = "${var.v}"', 'version = ""', 'version = ["5.0.0"]', 'other = "5.0.0"']) {
    assert.deepEqual(parseTerraformLock(`provider ${address} {\n  ${body}\n}\n`), [], body);
  }
  assert.deepEqual(parseTerraformLock('provider {\n  version = "5.0.0"\n}\n'), []);
  assert.deepEqual(parseTerraformLock('provider "aws" {\n  version = "5.0.0"\n}\n'), []);
  assert.deepEqual(parseTerraformLock('provider "a" "b" {\n  version = "5.0.0"\n}\n'), []);
  assert.deepEqual(parseTerraformLock('module "x" {\n  version = "5.0.0"\n}\n'), []);
  assert.deepEqual(
    parseTerraformLock(`provider ${address} {\n  nested = {\n    version = "9.9.9"\n  }\n}\n`),
    [],
  );
});

test("bounds oversized input", () => {
  const padding = "# ".padEnd(MAXIMUM_INPUT_BYTES + 1, "x");
  assert.deepEqual(
    parseTerraformLock(`${padding}\nprovider "registry.terraform.io/hashicorp/aws" {\n  version = "5.0.0"\n}\n`),
    [],
  );
});
