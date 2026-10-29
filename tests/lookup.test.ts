import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { lookupProduct, LookupError, renderLookupText } from "../src/lookup.js";

test("aliases resolve to the same product and report its end of life", async () => {
  const node = await lookupProduct("node", "18");
  const nodejs = await lookupProduct("nodejs", "18.0.0");
  assert.deepEqual(node.product, nodejs.product);
  assert.deepEqual(node.findings, nodejs.findings);
  assert.equal(node.product.purl, "pkg:generic/nodejs");
  assert.equal(node.status, "end-of-life");
  assert.equal(node.deadline, "2025-04-30");
  assert.ok(node.findings.some((finding) => finding.ruleId === "nodejs.runtime.eol-18"));
  assert.ok(node.findings.every((finding) => finding.sources.length > 0));
});

test("a version with no matching rule is supported", async () => {
  const result = await lookupProduct("node", "99");
  assert.equal(result.status, "supported");
  assert.equal(result.findings.length, 0);
  assert.match(renderLookupText(result), /nodejs 99 — supported\nNo lifecycle rule matches this version\./);
});

test("packages resolve through their package URL name", async () => {
  const request = await lookupProduct("request");
  assert.equal(request.product.purl, "pkg:npm/request");
  assert.equal(request.status, "deprecated");
  assert.ok(request.findings.some((finding) => finding.ruleId === "npm.package.request.deprecated"));
  assert.match(renderLookupText(request), /request is deprecated/);
});

test("a product lookup leaves out symbol-level rules", async () => {
  const result = await lookupProduct("nodejs");
  assert.ok(result.findings.length > 0);
  assert.ok(result.findings.every((finding) => !finding.ruleId.includes(".symbol.")));
});

test("an unknown product fails with nearby names", async () => {
  const error = await lookupProduct("nodej").catch((reason: unknown) => reason);
  assert.ok(error instanceof LookupError);
  assert.match(error.message, /Unknown product "nodej"/);
  assert.match(error.message, /"nodejs"/);
});

test("rendering is deterministic and lists evidence links", async () => {
  const result = await lookupProduct("go", "1.19");
  assert.equal(renderLookupText(result), renderLookupText(await lookupProduct("golang", "1.19")));
  assert.deepEqual(result.findings, (await lookupProduct("golang", "1.19")).findings);
  assert.match(renderLookupText(result), /Product: pkg:generic\/golang/);
});

test("the CLI prints text and JSON and rejects unknown products", async () => {
  const run = promisify(execFile);
  const cli = resolve("dist/src/cli.js");
  const text = await run(process.execPath, [cli, "lookup", "node", "18"]);
  assert.match(text.stdout, /^nodejs 18 — end-of-life/);
  assert.match(text.stdout, /Ended: 2025-04-30/);
  const json = await run(process.execPath, [cli, "lookup", "node", "18", "--json"]);
  const result = JSON.parse(json.stdout) as { schemaVersion: string; status: string; product: { purl: string } };
  assert.equal(result.schemaVersion, "evergreen.lookup.v1");
  assert.equal(result.status, "end-of-life");
  assert.equal(result.product.purl, "pkg:generic/nodejs");
  await assert.rejects(run(process.execPath, [cli, "lookup", "nodej"]), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 2);
    assert.match(error.stderr ?? "", /Did you mean/);
    return true;
  });
});
