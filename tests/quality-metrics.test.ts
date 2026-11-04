import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  SCHEMA_VERSION,
  buildQualitySnapshot,
  collectQualityMetrics,
  countsFromAllowlist,
  formatQualityChange,
  rowsFromSnapshots,
  renderQualitySection,
} from "../tools/quality-metrics.js";
import type { Allowlist } from "../tools/check-quality.js";
import type { QualitySnapshot } from "../tools/quality-metrics.js";

function emptyAllowlist(): Allowlist {
  return {
    schemaVersion: "evergreen.quality-allowlist.v2",
    fileSize: [],
    functionLength: [],
    complexity: [],
    asUnknownAs: [],
    nonNull: [],
    boundaries: [],
    audit: [],
  };
}

test("countsFromAllowlist sums each debt section", () => {
  const allowlist = emptyAllowlist();
  allowlist.fileSize.push({
    file: "src/a.ts",
    lines: 900,
    owner: "#1",
    expires: "2027-01-26",
    reason: "test",
  });
  allowlist.complexity.push({
    file: "src/a.ts",
    function: "f",
    complexity: 20,
    owner: "#1",
    expires: "2027-01-26",
    reason: "test",
  });
  allowlist.asUnknownAs.push({
    file: "src/a.ts",
    count: 2,
    owner: "#1",
    expires: "2027-01-26",
    reason: "test",
  });
  allowlist.nonNull.push({
    file: "src/a.ts",
    count: 3,
    owner: "#1",
    expires: "2027-01-26",
    reason: "test",
  });
  allowlist.boundaries.push({
    file: "src/a.ts",
    rule: "adapters-no-detectors",
    count: 1,
    owner: "#1",
    expires: "2027-01-26",
    reason: "test",
  });
  allowlist.audit.push({
    advisory: "GHSA-1",
    package: "x",
    owner: "#1",
    expires: "2027-01-26",
    reason: "test",
  });

  assert.deepEqual(countsFromAllowlist(allowlist), {
    filesOverWarn: 1,
    functionsOverComplexity: 1,
    asUnknownAsFiles: 1,
    asUnknownAsCount: 2,
    nonNullAssertions: 3,
    boundaryViolations: 1,
    auditAdvisories: 1,
  });
});

test("rowsFromSnapshots list every QUALITY.md target and never invent a previous value", () => {
  const current: QualitySnapshot = {
    schemaVersion: SCHEMA_VERSION,
    date: "2026-11-03",
    targets: {
      medianLines: 300,
      warnLines: 800,
      ceilingLines: 1000,
      complexity: 15,
      coverageLines: 93,
      coverageBranches: 87,
      coverageFunctions: 93,
      mutationBreak: 60,
      mutationHigh: 80,
      scorecardFloor: 6,
      explicitAny: 0,
      tsDirectives: 0,
    },
    counts: {
      filesOverWarn: 1,
      functionsOverComplexity: 187,
      asUnknownAsFiles: 3,
      asUnknownAsCount: 4,
      nonNullAssertions: 573,
      boundaryViolations: 0,
      auditAdvisories: 5,
      coverageLines: 94.7,
      coverageBranches: 87.1,
      coverageFunctions: 94.7,
      mutationScore: null,
      scorecardScore: 3.1,
      docsStatus: "partial",
    },
    sources: {
      allowlist: "benchmarks/quality-allowlist.json",
      coverage: "lcov.info",
      mutation: null,
      scorecard: "metrics/adoption/2026-10-28.json",
      docs: "docs/QUALITY.md §8",
    },
  };

  const rows = rowsFromSnapshots(current, null);
  assert.equal(rows.length, 9);
  assert.deepEqual(
    rows.map((row) => row.criterion),
    [
      "File size",
      "Complexity",
      "Type safety",
      "Boundaries",
      "Coverage",
      "Mutation score",
      "Docs",
      "Security",
      "Remaining debt",
    ],
  );
  assert.equal(formatQualityChange(rows[0]!), "—");
  assert.equal(rows[5]!.current, "not measured");
  assert.match(renderQualitySection({ snapshotDate: current.date, rows }).join("\n"), /## Reference quality/);
});

test("collectQualityMetrics compares the newest snapshots of this month and the previous month", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-quality-metrics-"));
  try {
    const prev: QualitySnapshot = {
      schemaVersion: SCHEMA_VERSION,
      date: "2026-10-15",
      targets: {
        medianLines: 300,
        warnLines: 800,
        ceilingLines: 1000,
        complexity: 15,
        coverageLines: 93,
        coverageBranches: 87,
        coverageFunctions: 93,
        mutationBreak: 60,
        mutationHigh: 80,
        scorecardFloor: 6,
        explicitAny: 0,
        tsDirectives: 0,
      },
      counts: {
        filesOverWarn: 2,
        functionsOverComplexity: 191,
        asUnknownAsFiles: 9,
        asUnknownAsCount: 9,
        nonNullAssertions: 589,
        boundaryViolations: 1,
        auditAdvisories: 5,
        coverageLines: 94.7,
        coverageBranches: 87,
        coverageFunctions: 94.6,
        mutationScore: null,
        scorecardScore: 3.1,
        docsStatus: "partial",
      },
      sources: {
        allowlist: "benchmarks/quality-allowlist.json",
        coverage: null,
        mutation: null,
        scorecard: null,
        docs: "docs/QUALITY.md §8",
      },
    };
    const curr = {
      ...prev,
      date: "2026-11-03",
      counts: {
        ...prev.counts,
        filesOverWarn: 1,
        functionsOverComplexity: 187,
        nonNullAssertions: 573,
        boundaryViolations: 0,
      },
    };
    await writeFile(join(tempDir, "2026-10-15.json"), `${JSON.stringify(prev)}\n`);
    await writeFile(join(tempDir, "2026-11-03.json"), `${JSON.stringify(curr)}\n`);

    const metrics = await collectQualityMetrics({ qualityDir: tempDir, month: "2026-11" });
    assert.equal(metrics.snapshotDate, "2026-11-03");
    const fileSize = metrics.rows.find((row) => row.criterion === "File size");
    assert.equal(fileSize?.value, 1);
    assert.equal(fileSize?.previous, 2);
    assert.equal(formatQualityChange(fileSize!), "-1");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("buildQualitySnapshot reads the allowlist and optional local coverage", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "evergreen-quality-build-"));
  try {
    const allowlistPath = join(tempDir, "allowlist.json");
    const lcovPath = join(tempDir, "lcov.info");
    const adoptionDir = join(tempDir, "adoption");
    await mkdir(adoptionDir);
    const allowlist = emptyAllowlist();
    allowlist.fileSize.push({
      file: "src/a.ts",
      lines: 900,
      owner: "#1",
      expires: "2027-01-26",
      reason: "test",
    });
    await writeFile(allowlistPath, `${JSON.stringify(allowlist)}\n`);
    await writeFile(
      lcovPath,
      ["TN:", "SF:src/a.ts", "LF:10", "LH:9", "BRF:4", "BRH:3", "FNF:2", "FNH:2", "end_of_record"].join("\n"),
    );
    await writeFile(
      join(adoptionDir, "2026-10-28.json"),
      `${JSON.stringify({
        schemaVersion: "evergreen.adoption-snapshot.v1",
        date: "2026-10-28",
        metrics: {
          scorecardScore: { status: "ok", value: 3.1, source: "https://example.test" },
        },
      })}\n`,
    );

    const snapshot = await buildQualitySnapshot({
      date: "2026-11-03",
      allowlistPath,
      lcovPath,
      adoptionDir,
      mutationPath: join(tempDir, "missing-mutation.json"),
    });
    assert.equal(snapshot.schemaVersion, SCHEMA_VERSION);
    assert.equal(snapshot.counts.filesOverWarn, 1);
    assert.equal(snapshot.counts.coverageLines, 90);
    assert.equal(snapshot.counts.scorecardScore, 3.1);
    assert.equal(snapshot.counts.mutationScore, null);
    assert.equal(snapshot.counts.docsStatus, "partial");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
