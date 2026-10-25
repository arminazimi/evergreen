import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { renderCodeQuality } from "../src/reporters.js";

function finding(ruleId: string, path: string, line: number | undefined, severity: Severity = "high"): Finding {
  return {
    id: `${ruleId}:${path}:${line ?? ""}`,
    ruleId,
    detector: ruleId.split(".")[0]!,
    title: `Title of ${ruleId}`,
    summary: `Summary at ${path}`,
    severity,
    confidence: "exact",
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

const severities = ["info", "minor", "major", "critical", "blocker"];

// GitLab's documented Code Quality format: an array of issues with these required fields.
function assertValidIssue(issue: Record<string, any>) {
  assert.equal(typeof issue.description, "string");
  assert.equal(typeof issue.check_name, "string");
  assert.match(issue.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(severities.includes(issue.severity), `unknown severity ${issue.severity}`);
  assert.equal(typeof issue.location.path, "string");
  assert.ok(Number.isInteger(issue.location.lines.begin) && issue.location.lines.begin >= 1);
}

test("a scan without findings is an empty array", () => {
  assert.deepEqual(JSON.parse(renderCodeQuality(scan([]))), []);
});

test("each finding becomes one valid issue, sorted, with a line of at least 1", () => {
  const issues = JSON.parse(renderCodeQuality(scan([
    finding("npm.package.request.deprecated", "package.json", 12, "high"),
    finding("python.runtime.eol", ".python-version", undefined, "info"),
  ])));
  assert.equal(issues.length, 2);
  for (const issue of issues) assertValidIssue(issue);
  assert.deepEqual(issues.map((issue: { location: { path: string; lines: { begin: number } } }) => [issue.location.path, issue.location.lines.begin]), [[".python-version", 1], ["package.json", 12]]);
});

test("severity maps to Code Quality severities", () => {
  const mapped = (["critical", "high", "medium", "low", "info"] as const).map((severity) => JSON.parse(renderCodeQuality(scan([finding("npm.package.request.deprecated", "package.json", 1, severity)])))[0].severity);
  assert.deepEqual(mapped, ["blocker", "critical", "major", "minor", "info"]);
});

test("fingerprints are stable, distinct per finding, and the output is deterministic", () => {
  const findings = [finding("npm.package.request.deprecated", "package.json", 12), finding("github-actions.checkout.node20", ".github/workflows/ci.yml", 7)];
  const forward = renderCodeQuality(scan(findings));
  assert.equal(renderCodeQuality(scan([...findings].reverse())), forward);
  const prints = JSON.parse(forward).map((issue: { fingerprint: string }) => issue.fingerprint);
  assert.equal(new Set(prints).size, 2);
  assert.equal(forward.includes("/machine/specific/root"), false);
  assert.equal(forward.includes("2026-10-16"), false);
});
