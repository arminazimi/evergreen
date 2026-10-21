import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  parseTerraformVersionFile,
  parseToolVersionsTerraform,
} from "../src/detectors/terraform/parse-version-files.js";

const fixtures = resolve("tests/fixtures/terraform");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses .terraform-version and the .tool-versions terraform entry with exact lines", async () => {
  assert.deepEqual(parseTerraformVersionFile(await fixture("positive/.terraform-version")), [
    { value: "0.12.31", line: 1 },
  ]);
  assert.deepEqual(parseToolVersionsTerraform(await fixture("positive/.tool-versions")), [
    { value: "0.12.31", line: 1 },
  ]);
  assert.deepEqual(parseTerraformVersionFile(await fixture("zero/.terraform-version")), [
    { value: "1.9.8", line: 1 },
  ]);
  assert.deepEqual(parseToolVersionsTerraform(await fixture("zero/.tool-versions")), [
    { value: "1.9.8", line: 1 },
  ]);
});

test("ignores latest, comments, other tools, and terraformer", async () => {
  assert.deepEqual(parseTerraformVersionFile(await fixture("negative/.terraform-version")), []);
  assert.deepEqual(parseToolVersionsTerraform(await fixture("negative/.tool-versions")), []);
});

test("returns nothing for a missing version", async () => {
  assert.deepEqual(parseToolVersionsTerraform(await fixture("malformed/.tool-versions")), []);
  assert.deepEqual(parseTerraformVersionFile(""), []);
  assert.deepEqual(parseToolVersionsTerraform(""), []);
  assert.deepEqual(parseTerraformVersionFile("# nothing\n\n"), []);
});

test("returns nothing for dynamic and unsupported version forms", () => {
  for (const value of ["latest", "latest:^1.8", "min-required", "system", "ref:main", "path:/opt/tf", "1.9", "v1.9.8", "1.9.x", "~> 1.9.0", "1.9.8 1.8.0"]) {
    assert.deepEqual(parseTerraformVersionFile(`${value}\n`), [], value);
    if (!value.includes(" ")) assert.deepEqual(parseToolVersionsTerraform(`terraform ${value}\n`), [], value);
  }
  assert.deepEqual(parseTerraformVersionFile("1.9.8\n1.8.0\n"), []);
});

test("accepts comments, blank lines, CRLF, a byte order mark, and a prerelease", () => {
  assert.deepEqual(parseTerraformVersionFile("﻿# pinned\r\n\r\n1.10.0-rc1 # candidate\r\n"), [
    { value: "1.10.0-rc1", line: 3 },
  ]);
  assert.deepEqual(parseToolVersionsTerraform("nodejs 22.11.0\r\n  terraform   1.9.8   1.8.0  # primary\r\n"), [
    { value: "1.9.8", line: 2 },
  ]);
  assert.deepEqual(parseToolVersionsTerraform("terraform 1.9.8\nterraform 1.8.0\n"), [{ value: "1.9.8", line: 1 }]);
});

test("bounds oversized input and overlong lines", () => {
  assert.deepEqual(parseTerraformVersionFile(`${"#".repeat(MAXIMUM_INPUT_BYTES + 1)}\n1.9.8\n`), []);
  assert.deepEqual(parseToolVersionsTerraform(`${"#".repeat(MAXIMUM_INPUT_BYTES + 1)}\nterraform 1.9.8\n`), []);
  assert.deepEqual(parseToolVersionsTerraform(`terraform 1.9.8 ${"x".repeat(2000)}\n`), []);
});
