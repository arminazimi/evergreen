import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { RegistryV2, RegistryV2Rule } from "../../src/registry.js";
import {
  CANDIDATE_MARKER_PREFIX,
  extractCandidateRuleId,
  extractRuleIdFromIssue,
  formatCandidateMarker,
  isCandidateIssue,
  main,
  processCandidateIssues,
  renderCandidateIssue,
  selectCandidatesToOpen,
} from "../../tools/importers/candidate-issues.js";
import type {
  CandidateIssueRunner,
  IssueRecord,
  RenderedCandidateIssue,
} from "../../tools/importers/candidate-issues.js";
import type { DraftRegistry } from "../../tools/importers/types.js";

function sampleRule(id: string, extra: Record<string, unknown> = {}): RegistryV2Rule {
  return {
    id,
    ecosystem: "npm",
    purl: `pkg:npm/${id.replace(/^npm\.package\./, "").replace(/\.deprecated$/, "")}`,
    vers: "vers:npm/*",
    event: "deprecated",
    title: `${id} is deprecated`,
    summary: "This package has been deprecated upstream.",
    severity: "high",
    deadline: "2025-01-01",
    replacement: "Use alternative-package instead.",
    sources: [{ title: "npm package page", url: "https://www.npmjs.com/package/sample" }],
    provenance: { observedAt: "2026-10-01", reviewer: "pending-review" },
    ...extra,
  } as RegistryV2Rule;
}

test("renderCandidateIssue formats the issue title, marker, evidence, and fixture checklist", () => {
  const rule = sampleRule("npm.package.left-pad.deprecated");
  const rendered = renderCandidateIssue({
    rule,
    importer: "npm-deprecated",
    ecosystem: "npm",
  });

  assert.equal(rendered.title, "rule (npm): npm.package.left-pad.deprecated");
  assert.ok(rendered.labels.includes("good first issue"));
  assert.ok(rendered.labels.includes("type: rule"));
  assert.ok(rendered.labels.includes("eco: npm"));

  // Marker for deduplication
  assert.ok(rendered.body.includes(formatCandidateMarker(rule.id)));

  // Candidate details
  assert.ok(rendered.body.includes("**Rule ID**: `npm.package.left-pad.deprecated`"));
  assert.ok(rendered.body.includes("**Package URL (PURL)**: `pkg:npm/left-pad`"));
  assert.ok(rendered.body.includes("**Deadline**: `2025-01-01`"));
  assert.ok(rendered.body.includes("**Replacement**: Use alternative-package instead."));

  // Evidence
  assert.ok(rendered.body.includes("npm-deprecated"));
  assert.ok(rendered.body.includes("[npm package page](https://www.npmjs.com/package/sample)"));

  // Agent brief
  assert.ok(rendered.body.includes("## Agent brief"));
  assert.ok(rendered.body.includes("`registry/npm.json`"));
  assert.ok(rendered.body.includes("`tests/fixtures/npm/`"));
  assert.ok(rendered.body.includes("provenance.reviewer: \"pending-review\""));

  // Fixture checklist
  assert.ok(rendered.body.includes("## Fixture checklist"));
  assert.ok(rendered.body.includes("- [ ] Add a positive fixture exercising the affected version/declaration"));
  assert.ok(rendered.body.includes("- [ ] Add or verify a negative fixture (zero findings)"));

  // Done when
  assert.ok(rendered.body.includes("## Done when"));
  assert.ok(rendered.body.includes("[ ] Rule `npm.package.left-pad.deprecated` is added to `registry/npm.json`"));
  assert.ok(rendered.body.includes("[ ] `npm run check` passes."));
});

test("renderCandidateIssue handles rules without deadline or replacement cleanly", () => {
  const rule = sampleRule("npm.package.simple.deprecated", {
    deadline: undefined,
    replacement: undefined,
  });
  const rendered = renderCandidateIssue({
    rule,
    importer: "npm-deprecated",
    ecosystem: "npm",
  });

  assert.doesNotMatch(rendered.body, /\*\*Deadline\*\*/);
  assert.doesNotMatch(rendered.body, /\*\*Replacement\*\*/);
});

test("marker extraction identifies rule id and rejects non-matching text", () => {
  const marker = formatCandidateMarker("npm.package.request.deprecated");
  assert.ok(marker.startsWith(CANDIDATE_MARKER_PREFIX));
  assert.equal(extractCandidateRuleId(`Some text\n${marker}\nMore text`), "npm.package.request.deprecated");
  assert.equal(extractCandidateRuleId("No marker here"), null);
});

test("isCandidateIssue and extractRuleIdFromIssue identify candidate issues", () => {
  const issueWithMarker: IssueRecord = {
    title: "rule (npm): npm.package.left-pad.deprecated",
    body: `<!-- evergreen-rule-candidate: npm.package.left-pad.deprecated -->\nIssue content`,
    state: "OPEN",
    labels: ["good first issue"],
  };
  assert.equal(isCandidateIssue(issueWithMarker), true);
  assert.equal(extractRuleIdFromIssue(issueWithMarker), "npm.package.left-pad.deprecated");

  const issueWithoutMarker: IssueRecord = {
    title: "rule: npm.package.request.deprecated",
    body: "No marker in body",
    state: "CLOSED",
    labels: ["good first issue", "type: rule"],
  };
  assert.equal(isCandidateIssue(issueWithoutMarker), true);
  assert.equal(extractRuleIdFromIssue(issueWithoutMarker), "npm.package.request.deprecated");

  const nonCandidateIssue: IssueRecord = {
    title: "Bug in parser",
    body: "Fix crash on line 5",
    state: "OPEN",
    labels: ["bug"],
  };
  assert.equal(isCandidateIssue(nonCandidateIssue), false);
  assert.equal(extractRuleIdFromIssue(nonCandidateIssue), null);
});

test("selectCandidatesToOpen never duplicates existing candidate issues (open or closed)", () => {
  const r1 = sampleRule("npm.package.one.deprecated");
  const r2 = sampleRule("npm.package.two.deprecated");
  const r3 = sampleRule("npm.package.three.deprecated");

  const existingIssues: IssueRecord[] = [
    {
      title: "rule (npm): npm.package.one.deprecated",
      body: `<!-- evergreen-rule-candidate: npm.package.one.deprecated -->`,
      state: "OPEN",
      labels: ["good first issue"],
    },
    {
      title: "rule (npm): npm.package.two.deprecated",
      body: `<!-- evergreen-rule-candidate: npm.package.two.deprecated -->`,
      state: "CLOSED",
      labels: ["good first issue"],
    },
  ];

  const selection = selectCandidatesToOpen({
    candidates: [r1, r2, r3],
    existingIssues,
    maxOpen: 10,
  });

  assert.deepEqual(selection.skippedTracked, [r1.id, r2.id]);
  assert.deepEqual(selection.toOpen.map((r) => r.id), [r3.id]);
});

test("selectCandidatesToOpen respects the open issues cap", () => {
  const r1 = sampleRule("npm.package.one.deprecated");
  const r2 = sampleRule("npm.package.two.deprecated");
  const r3 = sampleRule("npm.package.three.deprecated");
  const r4 = sampleRule("npm.package.four.deprecated");

  const existingIssues: IssueRecord[] = [
    {
      title: "rule (npm): npm.package.existing-1.deprecated",
      body: `<!-- evergreen-rule-candidate: npm.package.existing-1.deprecated -->`,
      state: "OPEN",
      labels: ["good first issue"],
    },
    {
      title: "rule (npm): npm.package.existing-2.deprecated",
      body: `<!-- evergreen-rule-candidate: npm.package.existing-2.deprecated -->`,
      state: "OPEN",
      labels: ["good first issue"],
    },
  ];

  // maxOpen = 3, existing open = 2 -> can only open 1 candidate!
  const selection = selectCandidatesToOpen({
    candidates: [r1, r2, r3, r4],
    existingIssues,
    maxOpen: 3,
  });

  assert.equal(selection.openCount, 2);
  assert.equal(selection.maxOpen, 3);
  assert.equal(selection.toOpen.length, 1);
  assert.equal(selection.toOpen[0]!.id, r1.id);
  assert.equal(selection.capped, true);
});

test("selectCandidatesToOpen skips duplicate component rules", () => {
  const r1 = sampleRule("npm.package.one.deprecated");
  const r2 = sampleRule("npm.package.two.deprecated");

  const selection = selectCandidatesToOpen({
    candidates: [r1, r2],
    existingIssues: [],
    maxOpen: 10,
    duplicates: [{ draft: r1.id, existing: "npm.package.legacy-one.deprecated" }],
  });

  assert.deepEqual(selection.skippedDuplicates, [r1.id]);
  assert.deepEqual(selection.toOpen.map((r) => r.id), [r2.id]);
});

test("processCandidateIssues opens issues through runner and supports dry-run with outDir", async () => {
  const rule = sampleRule("npm.package.new.deprecated");
  const drafts: DraftRegistry = {
    importer: "npm-deprecated",
    ecosystem: "npm",
    observedAt: "2026-10-15",
    rules: [rule],
    notes: [],
  };
  const registry: RegistryV2 = {
    schemaVersion: "evergreen.registry.v2",
    ecosystem: "npm",
    rules: [],
  };

  const created: RenderedCandidateIssue[] = [];
  const fakeRunner: CandidateIssueRunner = {
    async listExistingIssues(): Promise<IssueRecord[]> {
      return [];
    },
    async createIssue(issue: RenderedCandidateIssue): Promise<{ number: number; url: string }> {
      created.push(issue);
      return { number: 42, url: "https://github.com/arminazimi/evergreen/issues/42" };
    },
  };

  // Run with real runner (not dry run)
  const result = await processCandidateIssues({
    drafts,
    registry,
    runner: fakeRunner,
  });

  assert.equal(result.opened.length, 1);
  assert.equal(created.length, 1);
  assert.equal(created[0]!.ruleId, rule.id);

  // Test dry run with outDir
  const tempDir = await mkdtemp(join(tmpdir(), "candidate-issues-test-"));
  try {
    const dryResult = await processCandidateIssues({
      drafts,
      registry,
      dryRun: true,
      outDir: tempDir,
      runner: fakeRunner,
    });

    assert.equal(dryResult.opened.length, 1);
    // Did not create any additional issue
    assert.equal(created.length, 1);

    const writtenFile = await readFile(join(tempDir, `${rule.id}.md`), "utf8");
    assert.ok(writtenFile.includes(rule.id));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("main CLI executes cleanly and prints expected summary", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "candidate-cli-test-"));
  try {
    const rule = sampleRule("npm.package.cli-test.deprecated");
    const drafts: DraftRegistry = {
      importer: "npm-deprecated",
      ecosystem: "npm",
      observedAt: "2026-10-15",
      rules: [rule],
      notes: [],
    };
    const draftsPath = join(tempDir, "drafts.json");
    const registryPath = join(tempDir, "registry.json");
    const registry: RegistryV2 = {
      schemaVersion: "evergreen.registry.v2",
      ecosystem: "npm",
      rules: [],
    };

    await readFile(draftsPath, "utf8").catch(() => {});
    const { writeFile } = await import("node:fs/promises");
    await writeFile(draftsPath, JSON.stringify(drafts));
    await writeFile(registryPath, JSON.stringify(registry));

    const fakeRunner: CandidateIssueRunner = {
      async listExistingIssues(): Promise<IssueRecord[]> {
        return [];
      },
      async createIssue(): Promise<{ number: number; url: string }> {
        return { number: 1, url: "https://example.com/1" };
      },
    };

    let stdout = "";
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk: string | Uint8Array) => {
      stdout += String(chunk);
      return true;
    };

    try {
      const exitCode = await main([draftsPath, registryPath, "--dry-run", "--max-open", "5"], fakeRunner);
      assert.equal(exitCode, 0);
      assert.ok(stdout.includes("Evaluated 1 candidate rule(s) from npm-deprecated"));
      assert.ok(stdout.includes("[dry-run]"));
      assert.ok(stdout.includes(rule.id));
    } finally {
      process.stdout.write = originalWrite;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
