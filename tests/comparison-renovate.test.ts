import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildResult, compareRecord, median, summarizeTiming } from "../benchmarks/comparison/renovate/aggregate.js";
import { main as build } from "../benchmarks/comparison/renovate/build.js";
import { renderJson, renderMarkdown } from "../benchmarks/comparison/renovate/report.js";
import { checkoutDirName, rawFileName, selectRepositories } from "../benchmarks/comparison/renovate/select.js";
import { RAW_SCHEMA_VERSION, type RawRecord } from "../benchmarks/comparison/renovate/types.js";
import type { CorpusRepositoryEntry } from "../benchmarks/corpus-harness.js";

function record(overrides: Partial<RawRecord> & Pick<RawRecord, "repository">): RawRecord {
  return {
    schemaVersion: RAW_SCHEMA_VERSION,
    commit: "a".repeat(40),
    ecosystem: "container",
    selection: "blind",
    continuity: false,
    concurrency: 4,
    evergreen: {
      version: "0.7.3",
      commit: "b".repeat(40),
      durationMs: 100,
      findings: [
        { ruleId: "container.node.eol-21-and-older", path: "Dockerfile", line: 1 },
        { ruleId: "npm.package.request.deprecated", path: "package.json", line: 4 },
        { ruleId: "nodejs.runtime.node-18", path: ".nvmrc", line: 1 },
      ],
    },
    renovate: {
      version: "44.164.10",
      durationMs: 2000,
      status: "ok",
      dependencies: [
        {
          manager: "dockerfile",
          path: "Dockerfile",
          name: "node",
          deprecated: false,
          majorUpdate: true,
          anyUpdate: true,
        },
        {
          manager: "npm",
          path: "package.json",
          name: "left-pad",
          deprecated: true,
          majorUpdate: false,
          anyUpdate: false,
        },
      ],
    },
    ...overrides,
  };
}

test("a finished run compares by family and counts what has no Renovate model as not comparable", () => {
  const { comparisons, notComparable } = compareRecord(record({ repository: "o/a" }));
  assert.deepEqual(
    comparisons.map((item) => [item.name, item.outcome]),
    [
      ["node", "agree"],
      ["left-pad", "renovate-only"],
      ["request", "evergreen-only"],
    ],
  );
  assert.equal(notComparable, 1);
});

test("an unfinished Renovate run contributes no comparison and is listed", () => {
  const failed = record({
    repository: "o/failed",
    renovate: { version: "44.164.10", durationMs: 10, status: "timeout", detail: "killed", dependencies: [] },
  });
  assert.deepEqual(compareRecord(failed).comparisons, []);
  const result = buildResult([failed, record({ repository: "o/ok" })]);
  assert.deepEqual(result.groups[0]!.renovateUnfinished, ["o/failed"]);
  assert.equal(result.groups[0]!.outcomes.agree, 1);
});

test("blind and targeted repositories stay in separate groups and never blend", () => {
  const result = buildResult([
    record({ repository: "o/blind" }),
    record({ repository: "o/targeted", selection: "targeted", continuity: true }),
  ]);
  assert.deepEqual(
    result.groups.map((group) => [group.selection, group.repositories, group.outcomes.agree]),
    [
      ["blind", 1, 1],
      ["targeted", 1, 1],
    ],
  );
  assert.deepEqual(result.continuity, ["o/targeted"]);
  assert.deepEqual(result.renovateVersions, ["44.164.10"]);
  assert.deepEqual(result.notComparableRules, [{ family: "nodejs.runtime", findings: 2 }]);
});

test("every disagreement becomes a row and agreements do not", () => {
  const result = buildResult([record({ repository: "o/a" })]);
  assert.deepEqual(
    result.disagreements.map((row) => [row.outcome, row.name]),
    [
      ["evergreen-only", "request"],
      ["renovate-only", "left-pad"],
    ],
  );
});

test("median and timing summaries handle empty, odd, and even inputs", () => {
  assert.equal(median([]), 0);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3);
  assert.deepEqual(summarizeTiming([5, 1, 9]), { totalMs: 15, medianMs: 5, maxMs: 9 });
});

test("the subset is the blind half plus the continuity repositories", () => {
  const entry = (repository: string, selection?: "blind" | "targeted"): CorpusRepositoryEntry =>
    ({
      repository,
      commit: "c",
      ecosystem: "container",
      expected: [],
      ...(selection ? { selection } : {}),
    }) as CorpusRepositoryEntry;
  const selected = selectRepositories(
    [entry("z/blind", "blind"), entry("a/targeted", "targeted"), entry("m/continuity", "targeted"), entry("n/none")],
    new Set(["m/continuity"]),
  );
  assert.deepEqual(
    selected.map((item) => [item.entry.repository, item.selection, item.continuity]),
    [
      ["m/continuity", "targeted", true],
      ["z/blind", "blind", false],
    ],
  );
  assert.equal(rawFileName("o/n"), "o__n.json");
  assert.equal(checkoutDirName({ repository: "o/n", commit: "abc" }), "o__n@abc");
});

test("the report shows each disagreement with a link to the pinned declaration", () => {
  const markdown = renderMarkdown(buildResult([record({ repository: "o/a" })]));
  assert.match(markdown, /### Renovate only \(1\)/);
  assert.match(markdown, /### Evergreen only \(1\)/);
  assert.match(markdown, /### Inconclusive \(0\)\n\nNone\./);
  assert.ok(markdown.includes(`https://github.com/o/a/blob/${"a".repeat(40)}/package.json`));
  assert.match(renderJson(buildResult([])), /"groups": \[\]/);
});

test("build writes the result and --check detects staleness", async () => {
  const root = await mkdtemp(join(tmpdir(), "renovate-comparison-test-"));
  try {
    const dir = join(root, "benchmarks/comparison/renovate");
    await mkdir(join(dir, "raw"), { recursive: true });
    await writeFile(join(dir, "raw/o__a.json"), JSON.stringify(record({ repository: "o/a" })));
    assert.equal(await build(["--check"], root), 1);
    assert.equal(await build([], root), 0);
    assert.equal(await build(["--check"], root), 0);
    await writeFile(join(dir, "renovate.md"), "stale\n");
    assert.equal(await build(["--check"], root), 1);
    const written = JSON.parse(await readFile(join(dir, "renovate.json"), "utf8")) as { groups: unknown[] };
    assert.equal(written.groups.length, 1);
    await writeFile(
      join(dir, "raw/o__b.json"),
      JSON.stringify({ ...record({ repository: "o/b" }), schemaVersion: "x" }),
    );
    await assert.rejects(build([], root), /unexpected schemaVersion/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
