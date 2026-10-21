import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  GCLOUD_RUNTIME_SUPPORT_URL,
  gcloudFunctionsRuntimesImporter,
  parseGCloudRuntimePage,
  pickReplacement,
  runtimeFamily,
} from "../../tools/importers/serverless-2.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/serverless-2.json");

const MINI_PAGE = `
<table>
  <tr><th>GA</th><th>Deprecated</th><th>Decommissioned</th></tr>
  <tr><td>Yes</td><td>Yes</td><td>No</td></tr>
</table>
<table>
  <tr><th>Runtime</th><th>Generation</th><th>Runtime ID</th><th>Stacks</th><th>Runtime base image</th><th>Deprecation</th><th>Decommission</th></tr>
  <tr><td>Node.js 24</td><td>Run functions</td><td>nodejs24</td><td>google-24</td><td>google-24/nodejs24</td><td>2028-04-30</td><td>2028-10-31</td></tr>
  <tr><td>Node.js 22</td><td>1st gen, Run functions</td><td>nodejs22</td><td>google-22</td><td>google-22/nodejs22</td><td>2027-04-30</td><td>2027-10-31</td></tr>
  <tr><td>Node.js 20</td><td>1st gen, Run functions</td><td>nodejs20</td><td>google-22</td><td>google-22/nodejs20</td><td>2026-04-30</td><td>2026-10-30</td></tr>
  <tr><td>Node.js 14</td><td>1st gen, Run functions</td><td>nodejs14</td><td>google-18-full</td><td>google-18-full/nodejs14</td><td>2024-01-30</td><td>2025-01-30</td></tr>
  <tr><td>Node.js 8</td><td>1st gen, Run functions</td><td>nodejs8</td><td>Decommissioned</td><td>Decommissioned</td><td>2020-06-05</td><td>Feb 2021</td></tr>
  <tr><td>Node.js 26 (Preview)</td><td>Run functions</td><td>nodejs26</td><td>google-24</td><td>google-24/nodejs26</td><td></td><td></td></tr>
</table>
`;

test("drafts end-of-life rules for decommissioned GCloud runtimes from the recording", async () => {
  const drafts = await execute(gcloudFunctionsRuntimesImporter, { replay: recording });
  assert.ok(drafts.rules.length >= 1);
  assert.ok(drafts.rules.every((rule) => rule.ecosystem === "serverless"));
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "serverless-2"));
  assert.ok(drafts.rules.every((rule) => rule.purl.startsWith("pkg:generic/google-cloud-functions-runtime/")));
  assert.ok(drafts.rules.every((rule) => rule.vers === "vers:semver/*"));
  assert.ok(drafts.rules.every((rule) => rule.sources[0]!.url === GCLOUD_RUNTIME_SUPPORT_URL));

  const node14 = drafts.rules.find((rule) => rule.id === "serverless.google-cloud-functions.nodejs14");
  assert.ok(node14);
  assert.equal(node14.event, "end-of-life");
  assert.equal(node14.severity, "high");
  assert.equal(node14.deadline, "2025-01-30");
  assert.equal(node14.purl, "pkg:generic/google-cloud-functions-runtime/nodejs14");
  assert.ok(node14.replacement?.includes("nodejs"));
  assert.match(node14.summary, /deprecated on 2024-01-30/);
  assert.match(node14.summary, /decommissioned on 2025-01-30/);
});

test("a future decommission within twelve months becomes scheduled-end-of-life", async () => {
  const drafts = await execute(gcloudFunctionsRuntimesImporter, { replay: recording, now: "2026-10-21" });
  const node20 = drafts.rules.find((rule) => rule.id === "serverless.google-cloud-functions.nodejs20");
  assert.ok(node20);
  assert.equal(node20.event, "scheduled-end-of-life");
  assert.equal(node20.severity, "low");
  assert.equal(node20.deadline, "2026-10-30");
});

test("parses schedule tables from a minimal page", async () => {
  const context: ImporterContext = {
    now: new Date("2026-10-21T12:00:00Z"),
    async fetchText() {
      return MINI_PAGE;
    },
  };
  const result = await gcloudFunctionsRuntimesImporter.import(context);
  assert.deepEqual(
    result.rules.map((rule) => rule.id).sort(),
    ["serverless.google-cloud-functions.nodejs14", "serverless.google-cloud-functions.nodejs20"],
  );
  assert.ok(result.notes.some((note) => note.includes("nodejs8") && note.includes("not a calendar date")));
  assert.ok(result.notes.some((note) => note.includes("nodejs26") && note.includes("no decommission date")));
  assert.ok(result.notes.some((note) => note.includes("nodejs22") && note.includes("twelve months")));
});

test("runtime family and replacement helpers", () => {
  assert.equal(runtimeFamily("nodejs14"), "nodejs");
  assert.equal(runtimeFamily("python38"), "python");
  assert.equal(runtimeFamily("dotnet3"), "dotnet");
  const rows = parseGCloudRuntimePage(MINI_PAGE);
  assert.equal(pickReplacement("nodejs14", rows, "2026-10-21"), "nodejs24 or nodejs22");
  assert.ok(!pickReplacement("nodejs14", rows, "2026-10-21")?.includes("nodejs26"));
});
