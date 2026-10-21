import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES as MAXIMUM_SERVERLESS_BYTES,
  MAXIMUM_LINE_LENGTH as MAXIMUM_SERVERLESS_LINE,
  parseServerlessYml,
} from "../src/detectors/serverless/parse-serverless-yml.js";
import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseTemplate,
} from "../src/detectors/serverless/parse-template.js";
import {
  MAXIMUM_INPUT_BYTES as MAXIMUM_TF_BYTES,
  MAXIMUM_LINE_LENGTH as MAXIMUM_TF_LINE,
  parseTf,
} from "../src/detectors/serverless/parse-tf.js";

async function fixture(caseName: string, file: string): Promise<string> {
  return readFile(resolve("tests/fixtures/serverless", caseName, file), "utf8");
}

test("reads Globals and function Runtime values from template.yaml", async () => {
  assert.deepEqual(parseTemplate(await fixture("positive", "template.yaml")), [
    { value: "nodejs14.x", line: 7 },
    { value: "python3.8", line: 15 },
    { value: "dotnetcore3.1", line: 21 },
  ]);
});

test("reads .yml extension, a leading comment, and single-quoted Runtime", async () => {
  assert.deepEqual(parseTemplate(await fixture("positive", "template.yml")), [
    { value: "nodejs16.x", line: 6 },
    { value: "ruby2.7", line: 12 },
  ]);
});

test("returns supported runtimes too; the registry decides what is a finding", async () => {
  assert.deepEqual(parseTemplate(await fixture("zero", "template.yaml")), [
    { value: "nodejs22.x", line: 6 },
    { value: "python3.13", line: 13 },
    { value: "java21", line: 18 },
  ]);
});

test("ignores comments, parameters, CloudFormation tags, env vars, and image functions", async () => {
  assert.deepEqual(parseTemplate(await fixture("negative", "template.yaml")), []);
});

test("malformed template YAML returns no declarations", async () => {
  assert.deepEqual(parseTemplate(await fixture("malformed", "template.yaml")), []);
});

test("rejects non-literal Runtime forms and unrelated resources", () => {
  for (const contents of [
    "Globals:\n  Function:\n    Runtime: !Ref Runtime\n",
    "Globals:\n  Function:\n    Runtime: !Sub '${Stage}-nodejs14.x'\n",
    "Resources:\n  Api:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime:\n        Ref: Runtime\n",
    "Resources:\n  Api:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime: |\n        nodejs14.x\n",
    "Resources:\n  Api:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime: [nodejs14.x]\n",
    "Resources:\n  Api:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime: 14\n",
    "Resources:\n  Api:\n    Type: AWS::Serverless::Api\n    Properties:\n      Runtime: nodejs14.x\n",
    "Parameters:\n  Runtime:\n    Default: nodejs14.x\n",
    "Globals:\n  Api:\n    OpenApiVersion: '3.0.1'\n",
    "",
    "}}}\n{{{",
  ]) {
    assert.deepEqual(parseTemplate(contents), []);
  }
});

test("junk and empty input never throw", () => {
  for (const input of ["", "\u0000\u0001\u0002", "just text\n", "Runtime: nodejs14.x\n"]) {
    assert.doesNotThrow(() => parseTemplate(input));
    assert.deepEqual(parseTemplate(input), []);
  }
});

test("the result is deterministic and uses 1-based value lines", () => {
  const input = "Globals:\n  Function:\n    Runtime: nodejs14.x\n";
  const result = parseTemplate(input);
  assert.deepEqual(parseTemplate(input), result);
  assert.deepEqual(result, [{ value: "nodejs14.x", line: 3 }]);
});

test("input over 1 MiB or a Runtime over the line bound returns nothing", () => {
  assert.deepEqual(parseTemplate("x".repeat(MAXIMUM_INPUT_BYTES + 1)), []);
  assert.deepEqual(
    parseTemplate(`Globals:\n  Function:\n    Runtime: ${"n".repeat(MAXIMUM_LINE_LENGTH + 1)}\n`),
    [],
  );
});

test("reads provider.runtime and per-function runtime from serverless.yml", async () => {
  assert.deepEqual(parseServerlessYml(await fixture("positive", "serverless.yml")), [
    { value: "nodejs14.x", line: 4 },
    { value: "python3.8", line: 9 },
  ]);
});

test("returns supported serverless.yml runtimes too; the registry decides what is a finding", async () => {
  assert.deepEqual(parseServerlessYml(await fixture("zero", "serverless.yml")), [
    { value: "nodejs22.x", line: 4 },
    { value: "python3.13", line: 8 },
  ]);
});

test("ignores interpolations, custom.runtime, image functions, and floating runtimes", async () => {
  assert.deepEqual(parseServerlessYml(await fixture("negative", "serverless.yml")), []);
});

test("malformed serverless.yml returns no declarations", async () => {
  assert.deepEqual(parseServerlessYml(await fixture("malformed", "serverless.yml")), []);
});

test("rejects non-literal serverless.yml runtime forms", () => {
  for (const contents of [
    "provider:\n  runtime: ${opt:runtime, 'nodejs14.x'}\n",
    "provider:\n  runtime: latest\n",
    "custom:\n  runtime: nodejs14.x\n",
    "functions:\n  api:\n    runtime: ${self:custom.runtime}\n",
    "functions:\n  api:\n    runtime: |\n      nodejs14.x\n",
    "functions:\n  api:\n    runtime: [nodejs14.x]\n",
    "functions:\n  api:\n    runtime: 14\n",
    "functions:\n  api:\n    image: public.ecr.aws/lambda/nodejs:14\n",
    "provider:\n  memorySize: 128\n",
    "",
    "}}}\n{{{",
  ]) {
    assert.deepEqual(parseServerlessYml(contents), []);
  }
});

test("a function without its own runtime does not invent a declaration", () => {
  assert.deepEqual(
    parseServerlessYml("provider:\n  runtime: nodejs14.x\nfunctions:\n  worker:\n    handler: handler.worker\n"),
    [{ value: "nodejs14.x", line: 2 }],
  );
});

test("serverless.yml results are deterministic and use 1-based value lines", () => {
  const input = "provider:\n  runtime: nodejs14.x\nfunctions:\n  api:\n    runtime: python3.8\n";
  const result = parseServerlessYml(input);
  assert.deepEqual(parseServerlessYml(input), result);
  assert.deepEqual(result, [
    { value: "nodejs14.x", line: 2 },
    { value: "python3.8", line: 5 },
  ]);
});

test("serverless.yml junk, oversize, and overlong runtime values return nothing", () => {
  for (const input of ["", "\u0000\u0001\u0002", "runtime: nodejs14.x\n"]) {
    assert.doesNotThrow(() => parseServerlessYml(input));
    assert.deepEqual(parseServerlessYml(input), []);
  }
  assert.deepEqual(parseServerlessYml("x".repeat(MAXIMUM_SERVERLESS_BYTES + 1)), []);
  assert.deepEqual(
    parseServerlessYml(`provider:\n  runtime: ${"n".repeat(MAXIMUM_SERVERLESS_LINE + 1)}\n`),
    [],
  );
});

test("reads Lambda, Azure function app, and Google function runtimes from *.tf", async () => {
  assert.deepEqual(parseTf(await fixture("positive", "main.tf")), [
    { value: "nodejs14.x", line: 3 },
    { value: "14", line: 13 },
    { value: "3.1", line: 23 },
    { value: "nodejs14", line: 30 },
    { value: "python38", line: 38 },
  ]);
});

test("returns supported Terraform runtimes too; the registry decides what is a finding", async () => {
  assert.deepEqual(parseTf(await fixture("zero", "main.tf")), [
    { value: "nodejs22.x", line: 3 },
    { value: "22", line: 13 },
    { value: "python313", line: 23 },
  ]);
});

test("ignores vars, locals, data sources, legacy linux_fx_version, and lookalikes", async () => {
  assert.deepEqual(parseTf(await fixture("negative", "main.tf")), []);
});

test("malformed Terraform returns no declarations", async () => {
  assert.deepEqual(parseTf(await fixture("malformed", "main.tf")), []);
});

test("rejects non-literal Terraform runtime forms", () => {
  for (const contents of [
    'resource "aws_lambda_function" "api" {\n  runtime = var.lambda_runtime\n}\n',
    'resource "aws_lambda_function" "api" {\n  runtime = local.runtime\n}\n',
    'resource "aws_lambda_function" "api" {\n  runtime = "${var.runtime}"\n}\n',
    'resource "aws_lambda_function" "api" {\n  runtime = <<EOF\nnodejs14.x\nEOF\n}\n',
    'resource "aws_instance" "web" {\n  ami = "ami-123"\n}\n',
    'data "aws_lambda_function" "existing" {\n  function_name = "existing"\n}\n',
    'resource "azurerm_function_app" "legacy" {\n  site_config {\n    linux_fx_version = "NODE|14"\n  }\n}\n',
    'resource "aws_lambda_function" "image" {\n  package_type = "Image"\n  image_uri = "public.ecr.aws/lambda/nodejs:14"\n}\n',
    "",
    "}}}\n{{{",
  ]) {
    assert.deepEqual(parseTf(contents), []);
  }
});

test("Terraform results are deterministic and use 1-based value lines", () => {
  const input = 'resource "aws_lambda_function" "api" {\n  runtime = "nodejs14.x"\n}\n';
  const result = parseTf(input);
  assert.deepEqual(parseTf(input), result);
  assert.deepEqual(result, [{ value: "nodejs14.x", line: 2 }]);
});

test("Terraform junk, oversize, and overlong runtime values return nothing", () => {
  for (const input of ["", "\u0000\u0001\u0002", 'runtime = "nodejs14.x"\n']) {
    assert.doesNotThrow(() => parseTf(input));
    assert.deepEqual(parseTf(input), []);
  }
  assert.deepEqual(parseTf("x".repeat(MAXIMUM_TF_BYTES + 1)), []);
  assert.deepEqual(
    parseTf(`resource "aws_lambda_function" "api" {\n  runtime = "${"n".repeat(MAXIMUM_TF_LINE + 1)}"\n}\n`),
    [],
  );
});
