import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { renderSarif } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

function finding(ruleId: string, path: string, line: number | undefined, severity: Severity = "high"): Finding {
  return {
    id: `${ruleId}:${path}:${line ?? ""}`,
    ruleId,
    detector: ruleId.split(".")[0]!,
    title: `Title of ${ruleId}`,
    summary: `Summary at ${path}`,
    severity,
    location: line === undefined ? { path } : { path, line },
    sources: [{ title: "Source", url: "https://example.com/source" }],
  };
}

const scan = (findings: Finding[]): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/machine/specific/root",
  scannedAt: "2026-10-16T00:00:00.000Z",
  findings,
  diagnostics: [],
});

test("a scan without findings is one empty run", () => {
  const sarif = JSON.parse(renderSarif(scan([])));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs.length, 1);
  assert.equal(sarif.runs[0].tool.driver.name, "Evergreen");
  assert.deepEqual(sarif.runs[0].tool.driver.rules, []);
  assert.deepEqual(sarif.runs[0].results, []);
});

test("every finding becomes one result with an exact location, a rule index, and a stable fingerprint", () => {
  const sarif = JSON.parse(renderSarif(scan([
    finding("npm.package.request.deprecated", "package.json", 12, "high"),
    finding("github-actions.checkout.node20", ".github/workflows/ci.yml", 7, "medium"),
    finding("github-actions.checkout.node20", ".github/workflows/ci.yml", 30, "low"),
  ])));
  const run = sarif.runs[0];
  assert.deepEqual(run.tool.driver.rules.map((rule: { id: string }) => rule.id), ["github-actions.checkout.node20", "npm.package.request.deprecated"]);
  assert.equal(run.results.length, 3);
  assert.deepEqual(
    run.results.map((result: { ruleIndex: number; level: string; locations: { physicalLocation: { artifactLocation: { uri: string }; region: { startLine: number } } }[] }) => [
      result.ruleIndex,
      result.level,
      result.locations[0]!.physicalLocation.artifactLocation.uri,
      result.locations[0]!.physicalLocation.region.startLine,
    ]),
    [
      [0, "warning", ".github/workflows/ci.yml", 7],
      [0, "note", ".github/workflows/ci.yml", 30],
      [1, "error", "package.json", 12],
    ],
  );
  assert.equal(run.results[0].partialFingerprints["evergreenFindingId/v1"], "github-actions.checkout.node20:.github/workflows/ci.yml:7");
  assert.equal(run.results[0].locations[0].physicalLocation.artifactLocation.uriBaseId, "%SRCROOT%");
});

test("severity maps to SARIF levels", () => {
  const levels = (["critical", "high", "medium", "low", "info"] as const).map((severity) => {
    const sarif = JSON.parse(renderSarif(scan([finding("npm.package.request.deprecated", "package.json", 1, severity)])));
    return sarif.runs[0].results[0].level;
  });
  assert.deepEqual(levels, ["error", "error", "warning", "note", "note"]);
});

test("a finding without a line has no region", () => {
  const sarif = JSON.parse(renderSarif(scan([finding("python.runtime.eol", ".python-version", undefined)])));
  assert.equal("region" in sarif.runs[0].results[0].locations[0].physicalLocation, false);
});

test("the output does not depend on input order and contains nothing machine-specific", () => {
  const findings = [
    finding("npm.package.request.deprecated", "package.json", 12),
    finding("github-actions.checkout.node20", ".github/workflows/ci.yml", 7),
    finding("github-actions.setup-node.node20", ".github/workflows/ci.yml", 9),
  ];
  const forward = renderSarif(scan(findings));
  assert.equal(renderSarif(scan([...findings].reverse())), forward);
  assert.equal(forward.includes("/machine/specific/root"), false);
  assert.equal(forward.includes("2026-10-16"), false);
});

test("scan --format sarif prints SARIF, and unknown formats are rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-sarif-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n");
    const { stdout } = await execute(process.execPath, [cli, "scan", root, "--format", "sarif"]);
    const sarif = JSON.parse(stdout);
    assert.equal(sarif.runs[0].results[0].ruleId, "github-actions.checkout.node20");
    assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, ".github/workflows/ci.yml");

    await assert.rejects(execute(process.execPath, [cli, "scan", root, "--format", "xml"]), (error: { code: number; stderr: string }) => error.code === 2 && /Unknown format/.test(error.stderr));
    await assert.rejects(execute(process.execPath, [cli, "explain", "x", root, "--format", "sarif"]), (error: { code: number }) => error.code === 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rule help carries the replacement, deadline, migration steps, verification, and sources", async () => {
  const input = JSON.parse(await readFile(resolve("tests/fixtures/sarif-scan.json"), "utf8")) as ScanResult;
  const sarif = JSON.parse(renderSarif(input));
  const rule = sarif.runs[0].tool.driver.rules.find((candidate: { id: string }) => candidate.id === "npm.package.request.deprecated");
  assert.match(rule.help.text, /Replacement: Native fetch or a maintained HTTP client/);
  assert.match(rule.help.text, /Deadline: 2020-02-11/);
  assert.match(rule.help.text, /1\. Rewrite request usages: Translate each reported import/);
  assert.match(rule.help.text, /- npm run test --if-present \(Run the repository tests when defined\.\)/);
  assert.match(rule.help.text, /- request package deprecation notice: https:\/\/www\.npmjs\.com\/package\/request/);
  assert.match(rule.help.markdown, /\*\*Replacement:\*\* Native fetch/);
  assert.match(rule.help.markdown, /- \[request package deprecation notice\]\(https:\/\/www\.npmjs\.com\/package\/request\)/);
  assert.equal(rule.helpUri, "https://www.npmjs.com/package/request");
});

test("a rule without migration steps or sources still has help, and no help URI", async () => {
  const input = JSON.parse(await readFile(resolve("tests/fixtures/sarif-scan.json"), "utf8")) as ScanResult;
  const sarif = JSON.parse(renderSarif(input));
  const rule = sarif.runs[0].tool.driver.rules.find((candidate: { id: string }) => candidate.id === "github-actions.checkout.node20");
  assert.equal(rule.help.text, "Unsupported actions/checkout runtime");
  assert.equal("helpUri" in rule, false);
});

test("the SARIF for the sample scan matches its snapshot", async () => {
  const input = JSON.parse(await readFile(resolve("tests/fixtures/sarif-scan.json"), "utf8")) as ScanResult;
  const expected = await readFile(resolve("tests/fixtures/sarif-scan.expected.json"), "utf8");
  assert.equal(`${renderSarif(input)}\n`, expected);
});
