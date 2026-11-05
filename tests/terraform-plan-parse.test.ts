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

test("reads top-level provider_config when configuration has none", () => {
  const json = JSON.stringify({
    provider_config: {
      "google.default": { name: "google", version_constraint: "~> 5.0" },
    },
  });

  assert.deepEqual(parseTerraformPlanJson(json), [
    {
      kind: "provider_version",
      provider: "google",
      value: "~> 5.0",
      pointer: "/provider_config/google.default",
    },
  ]);
});

test("reads provider_config version, source, and skips entries without a constraint", () => {
  const json = JSON.stringify({
    configuration: {
      provider_config: {
        "azurerm.main": { name: "azurerm", full_name: "registry.terraform.io/hashicorp/azurerm", version: 3.5 },
        "random.none": { name: "random" },
        "bad.entry": "not an object",
      },
    },
  });

  assert.deepEqual(parseTerraformPlanJson(json), [
    {
      kind: "provider_version",
      provider: "azurerm",
      source: "registry.terraform.io/hashicorp/azurerm",
      value: "3.5",
      pointer: "/configuration/provider_config/azurerm.main",
    },
  ]);
});

test("reads provider_requirements constraints and does not duplicate a provider already found", () => {
  const json = JSON.stringify({
    configuration: {
      provider_config: {
        aws: { name: "aws", version_constraint: "4.67.0" },
      },
      provider_requirements: {
        aws: { source: "hashicorp/aws", version_constraints: ["5.0.0"] },
        random: { source: "hashicorp/random", version_constraint: "3.6.0" },
        empty: { source: "hashicorp/empty", version_constraints: [] },
        unversioned: { source: "hashicorp/unversioned" },
        ignored: "not an object",
      },
    },
  });

  assert.deepEqual(parseTerraformPlanJson(json), [
    {
      kind: "provider_version",
      provider: "aws",
      value: "4.67.0",
      pointer: "/configuration/provider_config/aws",
    },
    {
      kind: "provider_version",
      provider: "random",
      source: "hashicorp/random",
      value: "3.6.0",
      pointer: "/configuration/provider_requirements/random",
    },
  ]);
});

test("reads engine versions from resource_changes after values and skips duplicate addresses", () => {
  const json = JSON.stringify({
    resource_changes: [
      "not an object",
      { address: "", type: "aws_db_instance", change: { after: { engine: "mysql", engine_version: "8.0" } } },
      {
        address: "aws_db_instance.main",
        type: "aws_db_instance",
        name: "main",
        change: { after: { engine: "mysql", engine_version: 8 } },
      },
      {
        address: "aws_db_instance.main",
        type: "aws_db_instance",
        name: "main",
        change: { after: { engine: "mysql", engine_version: "5.7" } },
      },
      { address: "aws_rds_cluster.empty", type: "aws_rds_cluster", change: { after: { engine: "aurora" } } },
    ],
  });

  assert.deepEqual(parseTerraformPlanJson(json), [
    {
      kind: "engine_version",
      resource: "aws_db_instance",
      name: "main",
      engine: "mysql",
      value: "8",
      address: "aws_db_instance.main",
      pointer: "/resource_changes/2/change/after",
    },
  ]);
});

test("prefers planned_values engine versions over resource_changes for the same address", () => {
  const json = JSON.stringify({
    planned_values: {
      root_module: {
        resources: [
          {
            address: "aws_db_instance.main",
            type: "aws_db_instance",
            name: "main",
            values: { engine: "postgres", engine_version: "14" },
          },
        ],
      },
    },
    resource_changes: [
      {
        address: "aws_db_instance.main",
        type: "aws_db_instance",
        name: "main",
        change: { after: { engine: "postgres", engine_version: "12" } },
      },
    ],
  });

  assert.deepEqual(parseTerraformPlanJson(json), [
    {
      kind: "engine_version",
      resource: "aws_db_instance",
      name: "main",
      engine: "postgres",
      value: "14",
      address: "aws_db_instance.main",
      pointer: "aws_db_instance.main",
    },
  ]);
});
