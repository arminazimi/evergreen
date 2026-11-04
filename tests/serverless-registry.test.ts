import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";

const AWS_RUNTIMES = "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html";
const GOOGLE_RUNTIMES = "https://cloud.google.com/functions/docs/runtime-support";
const GOOGLE_APPENGINE = "https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule";
const AZURE_APP_SERVICE = "https://learn.microsoft.com/en-us/azure/app-service/language-support-policy";
const AZURE_FUNCTIONS = "https://learn.microsoft.com/en-us/azure/azure-functions/functions-versions";

/**
 * Deadlines taken from the vendor tables on 2026-10-30 (AWS deprecation date; Google decommission date).
 * Every runtime either table dates has an entry, so a rule that goes missing or changes its date fails here.
 */
const SOURCE_DEADLINES = {
  "serverless.aws-lambda.dotnet10": { deadline: "2028-11-14", source: AWS_RUNTIMES, identifier: "dotnet10" },
  "serverless.aws-lambda.dotnet5.0": { deadline: "2022-05-10", source: AWS_RUNTIMES, identifier: "dotnet5.0" },
  "serverless.aws-lambda.dotnet6": { deadline: "2024-12-20", source: AWS_RUNTIMES, identifier: "dotnet6" },
  "serverless.aws-lambda.dotnet7": { deadline: "2024-05-14", source: AWS_RUNTIMES, identifier: "dotnet7" },
  "serverless.aws-lambda.dotnet8": { deadline: "2026-11-10", source: AWS_RUNTIMES, identifier: "dotnet8" },
  "serverless.aws-lambda.dotnet9": { deadline: "2026-11-10", source: AWS_RUNTIMES, identifier: "dotnet9" },
  "serverless.aws-lambda.dotnetcore1.0": { deadline: "2019-06-27", source: AWS_RUNTIMES, identifier: "dotnetcore1.0" },
  "serverless.aws-lambda.dotnetcore2.0": { deadline: "2019-05-30", source: AWS_RUNTIMES, identifier: "dotnetcore2.0" },
  "serverless.aws-lambda.dotnetcore2.1": { deadline: "2022-01-05", source: AWS_RUNTIMES, identifier: "dotnetcore2.1" },
  "serverless.aws-lambda.dotnetcore3.1": { deadline: "2023-04-03", source: AWS_RUNTIMES, identifier: "dotnetcore3.1" },
  "serverless.aws-lambda.go1.x": { deadline: "2024-01-08", source: AWS_RUNTIMES, identifier: "go1.x" },
  "serverless.aws-lambda.java11": { deadline: "2027-06-30", source: AWS_RUNTIMES, identifier: "java11" },
  "serverless.aws-lambda.java11.al2023": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "java11.al2023" },
  "serverless.aws-lambda.java17": { deadline: "2027-06-30", source: AWS_RUNTIMES, identifier: "java17" },
  "serverless.aws-lambda.java17.al2023": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "java17.al2023" },
  "serverless.aws-lambda.java21": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "java21" },
  "serverless.aws-lambda.java25": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "java25" },
  "serverless.aws-lambda.java8": { deadline: "2024-01-08", source: AWS_RUNTIMES, identifier: "java8" },
  "serverless.aws-lambda.java8.al2": { deadline: "2027-06-30", source: AWS_RUNTIMES, identifier: "java8.al2" },
  "serverless.aws-lambda.java8.al2023": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "java8.al2023" },
  "serverless.aws-lambda.nodejs": { deadline: "2016-08-30", source: AWS_RUNTIMES, identifier: "nodejs" },
  "serverless.aws-lambda.nodejs10.x": { deadline: "2021-07-30", source: AWS_RUNTIMES, identifier: "nodejs10.x" },
  "serverless.aws-lambda.nodejs12.x": { deadline: "2023-03-31", source: AWS_RUNTIMES, identifier: "nodejs12.x" },
  "serverless.aws-lambda.nodejs14.x": { deadline: "2023-12-04", source: AWS_RUNTIMES, identifier: "nodejs14.x" },
  "serverless.aws-lambda.nodejs16.x": { deadline: "2024-06-12", source: AWS_RUNTIMES, identifier: "nodejs16.x" },
  "serverless.aws-lambda.nodejs18.x": { deadline: "2025-09-01", source: AWS_RUNTIMES, identifier: "nodejs18.x" },
  "serverless.aws-lambda.nodejs20.x": { deadline: "2026-04-30", source: AWS_RUNTIMES, identifier: "nodejs20.x" },
  "serverless.aws-lambda.nodejs22.x": { deadline: "2027-04-30", source: AWS_RUNTIMES, identifier: "nodejs22.x" },
  "serverless.aws-lambda.nodejs24.x": { deadline: "2028-04-30", source: AWS_RUNTIMES, identifier: "nodejs24.x" },
  "serverless.aws-lambda.nodejs4.3": { deadline: "2020-03-05", source: AWS_RUNTIMES, identifier: "nodejs4.3" },
  "serverless.aws-lambda.nodejs4.3-edge": {
    deadline: "2020-03-05",
    source: AWS_RUNTIMES,
    identifier: "nodejs4.3-edge",
  },
  "serverless.aws-lambda.nodejs6.10": { deadline: "2019-08-12", source: AWS_RUNTIMES, identifier: "nodejs6.10" },
  "serverless.aws-lambda.nodejs8.10": { deadline: "2020-03-06", source: AWS_RUNTIMES, identifier: "nodejs8.10" },
  "serverless.aws-lambda.provided": { deadline: "2024-01-08", source: AWS_RUNTIMES, identifier: "provided" },
  "serverless.aws-lambda.provided.al2": { deadline: "2026-07-31", source: AWS_RUNTIMES, identifier: "provided.al2" },
  "serverless.aws-lambda.provided.al2023": {
    deadline: "2029-06-30",
    source: AWS_RUNTIMES,
    identifier: "provided.al2023",
  },
  "serverless.aws-lambda.python2.7": { deadline: "2021-07-15", source: AWS_RUNTIMES, identifier: "python2.7" },
  "serverless.aws-lambda.python3.10": { deadline: "2026-10-31", source: AWS_RUNTIMES, identifier: "python3.10" },
  "serverless.aws-lambda.python3.11": { deadline: "2027-06-30", source: AWS_RUNTIMES, identifier: "python3.11" },
  "serverless.aws-lambda.python3.12": { deadline: "2028-10-31", source: AWS_RUNTIMES, identifier: "python3.12" },
  "serverless.aws-lambda.python3.13": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "python3.13" },
  "serverless.aws-lambda.python3.14": { deadline: "2029-06-30", source: AWS_RUNTIMES, identifier: "python3.14" },
  "serverless.aws-lambda.python3.6": { deadline: "2022-07-18", source: AWS_RUNTIMES, identifier: "python3.6" },
  "serverless.aws-lambda.python3.7": { deadline: "2023-12-04", source: AWS_RUNTIMES, identifier: "python3.7" },
  "serverless.aws-lambda.python3.8": { deadline: "2024-10-14", source: AWS_RUNTIMES, identifier: "python3.8" },
  "serverless.aws-lambda.python3.9": { deadline: "2025-12-15", source: AWS_RUNTIMES, identifier: "python3.9" },
  "serverless.aws-lambda.ruby2.5": { deadline: "2021-07-30", source: AWS_RUNTIMES, identifier: "ruby2.5" },
  "serverless.aws-lambda.ruby2.7": { deadline: "2023-12-07", source: AWS_RUNTIMES, identifier: "ruby2.7" },
  "serverless.aws-lambda.ruby3.2": { deadline: "2026-03-31", source: AWS_RUNTIMES, identifier: "ruby3.2" },
  "serverless.aws-lambda.ruby3.3": { deadline: "2027-03-31", source: AWS_RUNTIMES, identifier: "ruby3.3" },
  "serverless.aws-lambda.ruby3.4": { deadline: "2028-03-31", source: AWS_RUNTIMES, identifier: "ruby3.4" },
  "serverless.aws-lambda.ruby4.0": { deadline: "2029-03-31", source: AWS_RUNTIMES, identifier: "ruby4.0" },
  "serverless.google-cloud-functions.nodejs14": {
    deadline: "2025-01-30",
    source: GOOGLE_RUNTIMES,
    identifier: "nodejs14",
  },
} as const;

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/serverless.json", "utf8"))).rules;
}

test("the serverless registry holds the curated AWS, Google Cloud, and Azure rules, each citing its vendor table", async () => {
  const all = await rules();
  assert.equal(all.length, 138);
  const aws = all.filter((rule) => rule.id.startsWith("serverless.aws-lambda."));
  assert.deepEqual(
    aws.map((rule) => rule.id).sort(),
    Object.keys(SOURCE_DEADLINES)
      .filter((id) => id.startsWith("serverless.aws-lambda."))
      .sort(),
  );
  for (const rule of aws) {
    const expected = SOURCE_DEADLINES[rule.id as keyof typeof SOURCE_DEADLINES];
    assert.ok(expected, rule.id);
    assert.ok(
      rule.sources.every((source) => source.url.startsWith("https://")),
      rule.id,
    );
    assert.ok(
      rule.sources.some((source) => source.url === expected.source),
      `${rule.id} cites ${expected.source}`,
    );
    assert.match(rule.summary, new RegExp(expected.identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const functions = all.filter((rule) => rule.id.startsWith("serverless.google-cloud-functions."));
  const appEngine = all.filter((rule) => rule.id.startsWith("serverless.google-appengine-runtime."));
  assert.equal(functions.length, 32);
  assert.equal(appEngine.length, 36);
  for (const rule of [...functions, ...appEngine]) {
    const source = rule.id.startsWith("serverless.google-cloud-functions.") ? GOOGLE_RUNTIMES : GOOGLE_APPENGINE;
    assert.ok(
      rule.sources.some((entry) => entry.url === source),
      `${rule.id} cites ${source}`,
    );
    assert.match(rule.summary, /runtime ID /, rule.id);
    assert.equal(rule.vers, "vers:semver/*", rule.id);
  }

  const appService = all.filter((rule) => rule.id.startsWith("serverless.azure-app-service."));
  const azureFunctions = all.filter((rule) => rule.id.startsWith("serverless.azure-functions."));
  assert.equal(appService.length, 16);
  assert.equal(azureFunctions.length, 2);
  for (const rule of [...appService, ...azureFunctions]) {
    const source = rule.id.startsWith("serverless.azure-functions.") ? AZURE_FUNCTIONS : AZURE_APP_SERVICE;
    assert.ok(
      rule.sources.some((entry) => entry.url === source),
      `${rule.id} cites ${source}`,
    );
    assert.match(rule.purl, /^pkg:generic\/azure-/, rule.id);
  }
});

test("each serverless rule deadline matches the date published by its source", async () => {
  const all = await rules();
  for (const [id, expected] of Object.entries(SOURCE_DEADLINES)) {
    const rule = all.find((candidate) => candidate.id === id);
    assert.ok(rule, id);
    assert.equal(rule.deadline, expected.deadline, id);
    assert.match(
      rule.summary,
      new RegExp(expected.deadline.replaceAll("-", "\\-")),
      `${id} summary names the deadline`,
    );
  }
});
