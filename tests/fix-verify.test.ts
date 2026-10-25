import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding, ScanResult } from "../src/domain.js";
import { renderVerification, verifyFix } from "../src/fix/verify.js";

function finding(id: string, command?: string): Finding {
  return {
    id,
    ruleId: "rule",
    detector: "detector",
    title: "title",
    summary: "summary",
    severity: "high",
    confidence: "exact",
    location: { path: `${id}.yml`, line: 1 },
    sources: [],
    ...(command ? { migration: { constraints: [], steps: [], verification: [{ command, purpose: `run ${command}` }] } } : {}),
  };
}

const scan = (...findings: Finding[]): ScanResult => ({ findings }) as unknown as ScanResult;

test("verifyFix sorts findings into resolved, remaining, and new", () => {
  const result = verifyFix(scan(finding("a", "npm test"), finding("b")), scan(finding("b"), finding("c", "npm run build")));

  assert.deepEqual(result.resolved.map((item) => item.id), ["a"]);
  assert.deepEqual(result.remaining.map((item) => item.id), ["b"]);
  assert.deepEqual(result.introduced.map((item) => item.id), ["c"]);
  assert.deepEqual(result.commands.map((item) => item.command), ["npm test", "npm run build"]);
});

test("verifyFix lists a shared verification command once", () => {
  const result = verifyFix(scan(finding("a", "npm test"), finding("b", "npm test")), scan());

  assert.equal(result.commands.length, 1);
});

test("renderVerification states the outcome and labels the commands as not run", () => {
  const text = renderVerification(verifyFix(scan(finding("a", "npm test")), scan(finding("n"))));

  assert.match(text, /Re-scan: 1 resolved, 0 remaining, 1 new\./);
  assert.match(text, /new: rule at n\.yml/);
  assert.match(text, /did not run these:\n {2}npm test {2}# run npm test/);
});
