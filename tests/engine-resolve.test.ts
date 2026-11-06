import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";

import { configureActiveData } from "../src/data-source.js";
import type { ScanResult } from "../src/domain.js";
import { applyScanSelection, scanRepository, scanSelectorMatches } from "../src/engine/index.js";
import { advisoryIdsByRuleId } from "../src/osv-advisories.js";
import { cleanupScratch, detectorFinding, detectorOf, findingOf, scratch } from "./engine-helpers.js";

after(cleanupScratch);
beforeEach(() => configureActiveData({ pinnedVersion: "bundled" }));
afterEach(() => configureActiveData());

test("scan selectors match an ecosystem, a full rule id, or a dotted prefix", () => {
  assert.equal(scanSelectorMatches("npm", "npm", "npm.package.eol"), true);
  assert.equal(scanSelectorMatches("npm.package", "npm", "npm.package.eol"), true);
  assert.equal(scanSelectorMatches("npm.package.eol", "go", "npm.package.eol"), true);
  assert.equal(scanSelectorMatches("npm", "npm", "weird.rule"), true);
  assert.equal(scanSelectorMatches("np", "npm", "npm.package.eol"), false);
  assert.equal(scanSelectorMatches("npm.package.eo", "npm", "npm.package.eol"), false);
  assert.equal(scanSelectorMatches("npm.package.eolx", "npm", "npm.package.eol"), false);
  assert.equal(scanSelectorMatches("go", "npm", "npm.package.eol"), false);
});

test("applying a scan selection keeps the selected findings and references", () => {
  const npmEol = findingOf();
  const npmDeprecated = findingOf({ id: "npm:two", ruleId: "npm.package.deprecated" });
  const goEol = findingOf({ id: "go:one", detector: "go", ruleId: "go.module.eol", location: { path: "go.mod" } });
  const references = [
    {
      detector: "npm",
      component: "left-pad",
      reference: "1.0.0",
      reason: "unmatched",
      location: { path: "package.json" },
    },
    {
      detector: "go",
      component: "example.com/x",
      reference: "v1.0.0",
      reason: "unmatched",
      location: { path: "go.mod" },
    },
  ];
  const base: ScanResult = {
    schemaVersion: "evergreen.scan.v1",
    root: "/repo",
    scannedAt: "2026-01-01T00:00:00.000Z",
    findings: [npmEol, npmDeprecated, goEol],
    unclassified: { count: 2, references },
    diagnostics: [],
  };

  const unfiltered = applyScanSelection(base, {});
  assert.deepEqual(
    unfiltered.findings.map((finding) => finding.id),
    ["npm:one", "npm:two", "go:one"],
  );
  assert.equal(unfiltered.unclassified?.count, 2);
  assert.equal("selection" in unfiltered, false);

  const byEcosystem = applyScanSelection(base, { only: ["npm"] });
  assert.deepEqual(
    byEcosystem.findings.map((finding) => finding.id),
    ["npm:one", "npm:two"],
  );
  assert.deepEqual(
    byEcosystem.unclassified?.references.map((reference) => reference.component),
    ["left-pad"],
  );
  assert.equal(byEcosystem.unclassified?.count, 1);
  assert.deepEqual(byEcosystem.selection, { only: ["npm"] });
  assert.equal(byEcosystem.root, "/repo");

  const byRule = applyScanSelection(base, { only: ["npm.package.eol"] });
  assert.deepEqual(
    byRule.findings.map((finding) => finding.id),
    ["npm:one"],
  );
  assert.equal(byRule.unclassified?.count, 0);

  const byPrefix = applyScanSelection(base, { only: ["npm.package"] });
  assert.deepEqual(
    byPrefix.findings.map((finding) => finding.id),
    ["npm:one", "npm:two"],
  );

  const excluded = applyScanSelection(base, { exclude: ["npm"] });
  assert.deepEqual(
    excluded.findings.map((finding) => finding.id),
    ["go:one"],
  );
  assert.deepEqual(
    excluded.unclassified?.references.map((reference) => reference.component),
    ["example.com/x"],
  );
  assert.deepEqual(excluded.selection, { exclude: ["npm"] });

  const excludedRule = applyScanSelection(base, { exclude: ["npm.package.eol"] });
  assert.deepEqual(
    excludedRule.findings.map((finding) => finding.id),
    ["npm:two", "go:one"],
  );

  const both = applyScanSelection(base, { only: ["npm"], exclude: ["npm.package.eol"] });
  assert.deepEqual(
    both.findings.map((finding) => finding.id),
    ["npm:two"],
  );
  assert.deepEqual(
    both.unclassified?.references.map((reference) => reference.component),
    ["left-pad"],
  );

  const multiSelector = applyScanSelection(base, { only: ["npm", "zzz"] });
  assert.deepEqual(
    multiSelector.findings.map((finding) => finding.id),
    ["npm:one", "npm:two"],
  );
  assert.deepEqual(
    multiSelector.unclassified?.references.map((reference) => reference.component),
    ["left-pad"],
  );

  const excludedTwo = applyScanSelection(base, { exclude: ["npm", "go"] });
  assert.deepEqual(excludedTwo.findings, []);
  assert.equal(excludedTwo.unclassified?.count, 0);

  const emptySelectors = applyScanSelection(base, { only: [], exclude: [] });
  assert.equal("selection" in emptySelectors, false);
  assert.equal(emptySelectors.findings.length, 3);

  const { unclassified: _unclassified, ...baseWithoutReferences } = base;
  const withoutReferences = applyScanSelection(baseWithoutReferences, { only: ["npm"] });
  assert.equal("unclassified" in withoutReferences, false);
  assert.equal("unclassified" in applyScanSelection(baseWithoutReferences, {}), false);
});

test("findings gain the OSV advisory ids declared for their rule", async () => {
  const advisories = await advisoryIdsByRuleId();
  const [ruleId, ids] = [...advisories.entries()].sort(([left], [right]) => left.localeCompare(right))[0]!;
  const root = await scratch("advisories");
  const detector = detectorOf("fixture", {
    scan: async () => [
      detectorFinding("package.json", { ruleId }),
      detectorFinding("other.json", { ruleId: "fixture.none" }),
    ],
  });
  const result = await scanRepository(root, [detector], { noCache: true });
  const withAdvisories = result.findings.find((finding) => finding.ruleId === ruleId);
  const withoutAdvisories = result.findings.find((finding) => finding.ruleId === "fixture.none");
  assert.deepEqual(withAdvisories?.advisoryIds, ids);
  assert.equal(withoutAdvisories !== undefined && "advisoryIds" in withoutAdvisories, false);
});

test("unclassified references are sorted by detector, component, path, line, and reference", async () => {
  const root = await scratch("references");
  const detector = detectorOf("fixture", {
    analyze: async () => ({
      findings: [],
      unclassified: [
        { component: "b", reference: "2", reason: "why", location: { path: "a.json", line: 2 } },
        { component: "b", reference: "1", reason: "why", location: { path: "a.json", line: 2 } },
        { component: "b", reference: "1", reason: "why", location: { path: "a.json" } },
        { component: "a", reference: "z", reason: "why", location: { path: "z.json" } },
        { component: "b", reference: "1", reason: "why", location: { path: "a.json", line: 1 } },
      ],
    }),
  });
  const result = await scanRepository(root, [detector], { noCache: true });
  assert.deepEqual(
    result.unclassified?.references.map((reference) => [
      reference.component,
      reference.location.path,
      reference.location.line ?? "none",
      reference.reference,
    ]),
    [
      ["a", "z.json", "none", "z"],
      ["b", "a.json", "none", "1"],
      ["b", "a.json", 1, "1"],
      ["b", "a.json", 2, "1"],
      ["b", "a.json", 2, "2"],
    ],
  );
});
