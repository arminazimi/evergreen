import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseTerraformPlanJson } from "../src/detectors/terraform/plan.js";

const fixtures = resolve("tests/fixtures/terraform");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses terraform_version, provider_config, and database engine_version from plan JSON", async () => {
  const contents = await fixture("plan_json/plan.json");
  const declarations = parseTerraformPlanJson(contents);

  assert.deepEqual(declarations, [
    {
      kind: "cli_version",
      value: "1.12.3",
      pointer: "/terraform_version",
    },
    {
      kind: "provider_version",
      provider: "aws",
      source: "registry.terraform.io/hashicorp/aws",
      value: "4.67.0",
      pointer: "/configuration/provider_config/aws",
    },
    {
      kind: "engine_version",
      resource: "aws_db_instance",
      name: "legacy_db",
      engine: "postgres",
      value: "12.22",
      address: "aws_db_instance.legacy_db",
      pointer: "aws_db_instance.legacy_db",
    },
  ]);
});

test("returns empty array for malformed JSON or non-object JSON", () => {
  assert.deepEqual(parseTerraformPlanJson("not json"), []);
  assert.deepEqual(parseTerraformPlanJson("{ invalid json"), []);
  assert.deepEqual(parseTerraformPlanJson('"just a string"'), []);
  assert.deepEqual(parseTerraformPlanJson("12345"), []);
  assert.deepEqual(parseTerraformPlanJson("[]"), []);
  assert.deepEqual(parseTerraformPlanJson("null"), []);
  assert.deepEqual(parseTerraformPlanJson(""), []);
});

test("bounds huge input", () => {
  const padding = " ".repeat(MAXIMUM_INPUT_BYTES + 1);
  assert.deepEqual(parseTerraformPlanJson(padding), []);
});

test("handles deeply nested child modules safely", () => {
  let nested: Record<string, unknown> = {
    resources: [
      {
        address: "aws_db_instance.deep",
        type: "aws_db_instance",
        name: "deep",
        values: { engine: "postgres", engine_version: "12.1" },
      },
    ],
  };

  // Nest child modules 20 levels deep (MAXIMUM_DEPTH is 10)
  for (let i = 0; i < 20; i++) {
    nested = { child_modules: [nested] };
  }

  const json = JSON.stringify({
    planned_values: {
      root_module: nested,
    },
  });

  // Should not throw stack overflow, and depth limit should prevent reading past depth 10
  assert.doesNotThrow(() => {
    const decls = parseTerraformPlanJson(json);
    assert.deepEqual(decls, []);
  });
});
