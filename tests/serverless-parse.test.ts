import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  MAXIMUM_INPUT_BYTES,
  MAXIMUM_LINE_LENGTH,
  parseTemplate,
} from "../src/detectors/serverless/parse-template.js";

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
