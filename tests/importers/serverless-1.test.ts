import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  LAMBDA_RUNTIMES_URL,
  awsLambdaRuntimesImporter,
  parseRuntimeTable,
  pickReplacement,
  runtimeFamily,
  sectionAfterHeading,
} from "../../tools/importers/serverless-1.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/serverless-1.json");

const MINI_PAGE = `
<h2 id="runtimes-supported">Supported runtimes</h2>
<table>
  <tr><th>Name</th><th>Identifier</th><th>OS</th><th>Deprecation date</th></tr>
  <tr><td><p>Node.js 24</p></td><td><code class="code">nodejs24.x</code></td><td><p>AL2023</p></td><td><p>Not scheduled</p></td></tr>
  <tr><td><p>Node.js 22</p></td><td><code class="code">nodejs22.x</code></td><td><p>AL2023</p></td><td><p>Apr 30, 2027</p></td></tr>
  <tr><td><p>OS-only</p></td><td><code class="code">provided.al2023</code></td><td><p>AL2023</p></td><td><p>Jun 30, 2029</p></td></tr>
</table>
<h2 id="runtimes-deprecated">Deprecated runtimes</h2>
<table>
  <tr><th>Name</th><th>Identifier</th><th>OS</th><th>Deprecation date</th></tr>
  <tr><td><p>Node.js 14</p></td><td><code class="code">nodejs14.x</code></td><td><p>AL2</p></td><td><p>Dec 4, 2023</p></td></tr>
  <tr><td><p>Go 1.x</p></td><td><code class="code">go1.x</code></td><td><p>AL1</p></td><td><p>Jan 8, 2024</p></td></tr>
  <tr><td><p>Node.js 20</p></td><td><code class="code">nodejs20.x</code></td><td><p>AL2023</p></td><td><p>Apr 30, 2026</p></td></tr>
  <tr><td><p>Far future</p></td><td><code class="code">nodejs99.x</code></td><td><p>AL2023</p></td><td><p>Dec 1, 2030</p></td></tr>
</table>
`;

test("drafts end-of-life rules for deprecated Lambda runtimes from the recording", async () => {
  const drafts = await execute(awsLambdaRuntimesImporter, { replay: recording });
  assert.ok(drafts.rules.length >= 5);
  assert.ok(drafts.rules.every((rule) => rule.ecosystem === "serverless"));
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "serverless-1"));
  assert.ok(drafts.rules.every((rule) => rule.purl.startsWith("pkg:generic/aws-lambda-runtime/")));
  assert.ok(drafts.rules.every((rule) => rule.vers === "vers:semver/*"));
  assert.ok(drafts.rules.every((rule) => rule.sources[0]!.url === LAMBDA_RUNTIMES_URL));

  const node14 = drafts.rules.find((rule) => rule.id === "serverless.aws-lambda.nodejs14.x");
  assert.ok(node14);
  assert.equal(node14.event, "end-of-life");
  assert.equal(node14.severity, "high");
  assert.equal(node14.deadline, "2023-12-04");
  assert.equal(node14.purl, "pkg:generic/aws-lambda-runtime/nodejs14.x");
  assert.ok(node14.replacement?.includes("nodejs"));

  const ruby27 = drafts.rules.find((rule) => rule.id === "serverless.aws-lambda.ruby2.7");
  assert.ok(ruby27);
  assert.equal(ruby27.deadline, "2023-12-07");
});

test("a future deprecation within twelve months becomes scheduled-end-of-life", async () => {
  const drafts = await execute(awsLambdaRuntimesImporter, { replay: recording, now: "2026-01-15" });
  const node20 = drafts.rules.find((rule) => rule.id === "serverless.aws-lambda.nodejs20.x");
  assert.ok(node20);
  assert.equal(node20.event, "scheduled-end-of-life");
  assert.equal(node20.severity, "low");
  assert.equal(node20.deadline, "2026-04-30");

  const node14 = drafts.rules.find((rule) => rule.id === "serverless.aws-lambda.nodejs14.x");
  assert.ok(node14);
  assert.equal(node14.event, "end-of-life");
});

test("parses supported and deprecated tables from a minimal page", async () => {
  const context: ImporterContext = {
    now: new Date("2026-10-21T12:00:00Z"),
    async fetchText() {
      return MINI_PAGE;
    },
  };
  const result = await awsLambdaRuntimesImporter.import(context);
  assert.equal(result.rules.length, 3);
  assert.deepEqual(
    result.rules.map((rule) => rule.id).sort(),
    ["serverless.aws-lambda.go1.x", "serverless.aws-lambda.nodejs14.x", "serverless.aws-lambda.nodejs20.x"],
  );
  const go = result.rules.find((rule) => rule.id === "serverless.aws-lambda.go1.x")!;
  assert.equal(go.replacement, "provided.al2023");
  assert.ok(result.notes.some((note) => note.includes("nodejs99.x") && note.includes("twelve months")));
});

test("runtime family and replacement helpers", () => {
  assert.equal(runtimeFamily("nodejs14.x"), "nodejs");
  assert.equal(runtimeFamily("dotnetcore3.1"), "dotnet");
  assert.equal(runtimeFamily("provided.al2"), "provided");
  const supported = parseRuntimeTable(sectionAfterHeading(MINI_PAGE, "runtimes-supported")!.match(/<table[\s\S]*<\/table>/i)![0]!);
  assert.equal(pickReplacement("nodejs14.x", supported), "nodejs24.x or nodejs22.x");
  assert.equal(pickReplacement("go1.x", supported), "provided.al2023");
});
