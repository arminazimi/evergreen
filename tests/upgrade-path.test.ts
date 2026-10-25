import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding } from "../src/domain.js";
import { planUpgradePath } from "../src/migration-packet.js";
import type { RegistryV2Rule } from "../src/registry.js";

function rule(line: string, event: RegistryV2Rule["event"], deadline?: string): RegistryV2Rule {
  return {
    id: `dotnet.runtime.${line}`,
    ecosystem: "dotnet",
    purl: "pkg:generic/dotnet",
    vers: `vers:semver/>=${line}.0.0|<${line}.1.0`,
    event,
    title: `.NET ${line}`,
    summary: "summary",
    severity: "low",
    replacement: ".NET 10 (LTS)",
    ...(deadline ? { deadline } : {}),
    sources: [{ title: "Policy", url: "https://example.com/policy" }],
    provenance: { observedAt: "2026-10-18", reviewedAt: "2026-10-18", reviewer: "test" },
  };
}

function findingFor(ruleId: string): Finding {
  return {
    id: `${ruleId}:global.json:1`,
    ruleId,
    detector: "dotnet",
    title: ruleId,
    summary: "summary",
    severity: "low",
    confidence: "exact",
    location: { path: "global.json", line: 1 },
    sources: [{ title: "Policy", url: "https://example.com/policy" }],
  };
}

const today = "2026-10-25";
const rules = [
  rule("6", "end-of-support", "2024-11-12"),
  rule("7", "end-of-support", "2024-05-14"),
  rule("8", "scheduled-end-of-life", "2026-11-10"),
  rule("9", "scheduled-end-of-life", "2026-11-10"),
  rule("11", "scheduled-end-of-life", "2029-11-10"),
];

test("skips ended and soon-ending lines and lands on the first supported one", () => {
  const path = planUpgradePath(findingFor("dotnet.runtime.6"), rules, today);
  assert.deepEqual(path?.skipped.map((line) => [line.title, line.status]), [
    [".NET 7", "ended"],
    [".NET 8", "ending-soon"],
    [".NET 9", "ending-soon"],
  ]);
  assert.equal(path?.target.title, ".NET 11");
  assert.equal(path?.target.endsOn, "2029-11-10");
});

test("falls back to the replacement when no later line is supported", () => {
  const path = planUpgradePath(findingFor("dotnet.runtime.8"), rules.slice(0, 4), today);
  assert.deepEqual(path?.skipped.map((line) => line.title), [".NET 9"]);
  assert.deepEqual(path?.target, { replacement: ".NET 10 (LTS)" });
});

test("is independent of the order the rules are listed in", () => {
  const forward = planUpgradePath(findingFor("dotnet.runtime.6"), rules, today);
  const backward = planUpgradePath(findingFor("dotnet.runtime.6"), [...rules].reverse(), today);
  assert.deepEqual(backward, forward);
});

test("has no path for the newest known line, an unknown rule, or another product", () => {
  assert.equal(planUpgradePath(findingFor("dotnet.runtime.11"), rules, today), undefined);
  assert.equal(planUpgradePath(findingFor("missing"), rules, today), undefined);
  const other = { ...rule("7", "end-of-life", "2020-01-01"), purl: "pkg:generic/other" };
  assert.equal(planUpgradePath(findingFor("dotnet.runtime.6"), [rules[0]!, other], today), undefined);
});
