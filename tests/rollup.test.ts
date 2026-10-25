import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import type { Finding, Severity } from "../src/domain.js";
import { RollupError, productOf, rollup, rollupFiles } from "../src/rollup.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function finding(ruleId: string, severity: Severity): Finding {
  return { id: `${ruleId}:${severity}`, ruleId, detector: "d", title: "t", summary: "s", severity, confidence: "exact", location: { path: "package.json" }, sources: [] };
}

const report = (...findings: Finding[]) => ({ schemaVersion: "evergreen.scan.v1", root: "/x", scannedAt: "2026-01-01T00:00:00Z", findings, diagnostics: [] });

async function files(reports: Record<string, unknown>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-rollup-"));
  roots.push(directory);
  for (const [name, content] of Object.entries(reports)) await writeFile(join(directory, name), JSON.stringify(content));
  return directory;
}

test("productOf takes the rule prefix", () => {
  assert.equal(productOf("nodejs.runtime.eol-18"), "nodejs");
  assert.equal(productOf("standalone"), "standalone");
});

test("rollup groups by product and owner and ignores input order", () => {
  const a = { repository: "api", owner: "platform", report: report(finding("nodejs.runtime.eol-18", "high"), finding("python.runtime.eol-3-8", "medium")) };
  const b = { repository: "web", report: report(finding("nodejs.runtime.eol-18", "high")) };
  const result = rollup([a, b]);
  assert.deepEqual(result, rollup([b, a]));
  assert.equal(result.repositories, 2);
  assert.equal(result.findings, 3);
  assert.deepEqual(result.byProduct.map((group) => [group.name, group.findings, group.repositories]), [["nodejs", 2, ["api", "web"]], ["python", 1, ["api"]]]);
  assert.deepEqual(result.byOwner.map((group) => [group.name, group.findings]), [["platform", 2], ["unowned", 1]]);
  assert.equal(result.severities.high, 2);
  assert.equal(result.byProduct[0]?.severities.high, 2);
});

test("an empty repository counts as a repository with no findings", () => {
  const result = rollup([{ repository: "clean", report: report() }]);
  assert.equal(result.repositories, 1);
  assert.equal(result.findings, 0);
  assert.deepEqual(result.byProduct, []);
});

test("rollupFiles reads reports and owners from files", async () => {
  const directory = await files({ "api.json": report(finding("nodejs.runtime.eol-18", "high")), "owners.json": { api: "platform" } });
  const result = await rollupFiles([join(directory, "api.json")], join(directory, "owners.json"));
  assert.deepEqual(result.byOwner.map((group) => group.name), ["platform"]);
});

test("rollupFiles refuses input that is not a scan report or owners map", async () => {
  const directory = await files({ "bad.json": { schemaVersion: "other" }, "owners.json": ["api"], "ok.json": report() });
  await assert.rejects(rollupFiles([join(directory, "bad.json")]), RollupError);
  await assert.rejects(rollupFiles([join(directory, "ok.json")], join(directory, "owners.json")), RollupError);
  await assert.rejects(rollupFiles([join(directory, "missing.json")]), RollupError);
  await assert.rejects(rollupFiles([]), RollupError);
});

test("the rollup command prints the same JSON for the same files", async () => {
  const directory = await files({ "api.json": report(finding("nodejs.runtime.eol-18", "high")), "web.json": report(finding("nodejs.runtime.eol-18", "low")) });
  const run = async () => (await execute(process.execPath, [cli, "rollup", join(directory, "web.json"), join(directory, "api.json"), "--json"])).stdout;
  const first = await run();
  assert.equal(first, await run());
  assert.equal((JSON.parse(first) as { findings: number }).findings, 2);
});
