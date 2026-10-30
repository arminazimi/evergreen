import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  SCHEMA_PATH,
  SCHEMA_VERSION,
  generateReport,
  loadResults,
  loadValidator,
  renderReport,
} from "../tools/benchmark-report.js";
import type { BenchmarkResult, GuardrailResult, PlanResult } from "../tools/benchmark-report.js";

const schemaPath = resolve(SCHEMA_PATH);

async function withResults(
  files: Record<string, BenchmarkResult>,
  run: (directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-benchmark-report-"));
  try {
    for (const [name, value] of Object.entries(files)) {
      await writeFile(join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
    }
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const guardrailClaude: GuardrailResult = {
  schemaVersion: SCHEMA_VERSION,
  kind: "guardrail",
  id: "guardrail-claude-2026-10-30",
  agent: { name: "claude-code", version: "2.0.1" },
  model: { name: "claude-sonnet-4", version: "20250514" },
  startedAt: "2026-10-30T10:00:00.000Z",
  finishedAt: "2026-10-30T10:15:00.000Z",
  arms: [
    {
      arm: "baseline",
      attempts: 20,
      counts: {
        refused: 2,
        "named-replacement": 4,
        "other-replacement": 6,
        "added-deprecated": 8,
      },
      rates: {
        refused: 0.1,
        "named-replacement": 0.2,
        "other-replacement": 0.3,
        "added-deprecated": 0.4,
      },
    },
    {
      arm: "guardrail",
      attempts: 20,
      counts: {
        refused: 10,
        "named-replacement": 8,
        "other-replacement": 1,
        "added-deprecated": 1,
      },
      rates: {
        refused: 0.5,
        "named-replacement": 0.4,
        "other-replacement": 0.05,
        "added-deprecated": 0.05,
      },
    },
  ],
};

const guardrailCodex: GuardrailResult = {
  schemaVersion: SCHEMA_VERSION,
  kind: "guardrail",
  id: "guardrail-codex-2026-10-30",
  agent: { name: "codex", version: "0.42.0" },
  model: { name: "gpt-5", version: "2025-08-07" },
  startedAt: "2026-10-30T11:00:00.000Z",
  finishedAt: "2026-10-30T11:20:00.000Z",
  arms: [
    {
      arm: "baseline",
      attempts: 20,
      counts: {
        refused: 1,
        "named-replacement": 3,
        "other-replacement": 5,
        "added-deprecated": 11,
      },
      rates: {
        refused: 0.05,
        "named-replacement": 0.15,
        "other-replacement": 0.25,
        "added-deprecated": 0.55,
      },
    },
    {
      arm: "guardrail",
      attempts: 20,
      counts: {
        refused: 12,
        "named-replacement": 6,
        "other-replacement": 2,
        "added-deprecated": 0,
      },
      rates: {
        refused: 0.6,
        "named-replacement": 0.3,
        "other-replacement": 0.1,
        "added-deprecated": 0,
      },
    },
  ],
};

const planClaude: PlanResult = {
  schemaVersion: SCHEMA_VERSION,
  kind: "plan",
  id: "plan-claude-2026-10-30",
  agent: { name: "claude-code", version: "2.0.1" },
  model: { name: "claude-sonnet-4", version: "20250514" },
  startedAt: "2026-10-30T12:00:00.000Z",
  finishedAt: "2026-10-30T12:08:00.000Z",
  arms: [
    {
      arm: "sequential",
      durationMs: 480000,
      findings: 8,
      resolved: 8,
      resolutionRate: 1,
    },
    {
      arm: "wave-parallel",
      durationMs: 180000,
      findings: 8,
      resolved: 8,
      resolutionRate: 1,
    },
  ],
};

const planCodex: PlanResult = {
  schemaVersion: SCHEMA_VERSION,
  kind: "plan",
  id: "plan-codex-2026-10-30",
  agent: { name: "codex", version: "0.42.0" },
  model: { name: "gpt-5", version: "2025-08-07" },
  startedAt: "2026-10-30T13:00:00.000Z",
  finishedAt: "2026-10-30T13:10:00.000Z",
  arms: [
    {
      arm: "sequential",
      durationMs: 520000,
      findings: 8,
      resolved: 7,
      resolutionRate: 0.875,
    },
    {
      arm: "wave-parallel",
      durationMs: 210000,
      findings: 8,
      resolved: 7,
      resolutionRate: 0.875,
    },
  ],
};

const EXPECTED_FULL_REPORT = `## Guardrail

### baseline

| Agent | Agent version | Model | Model version | Attempts | refused | named-replacement | other-replacement | added-deprecated | refused rate | named-replacement rate | other-replacement rate | added-deprecated rate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| claude-code | 2.0.1 | claude-sonnet-4 | 20250514 | 20 | 2 | 4 | 6 | 8 | 0.1000 | 0.2000 | 0.3000 | 0.4000 |
| codex | 0.42.0 | gpt-5 | 2025-08-07 | 20 | 1 | 3 | 5 | 11 | 0.0500 | 0.1500 | 0.2500 | 0.5500 |

### guardrail

| Agent | Agent version | Model | Model version | Attempts | refused | named-replacement | other-replacement | added-deprecated | refused rate | named-replacement rate | other-replacement rate | added-deprecated rate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| claude-code | 2.0.1 | claude-sonnet-4 | 20250514 | 20 | 10 | 8 | 1 | 1 | 0.5000 | 0.4000 | 0.0500 | 0.0500 |
| codex | 0.42.0 | gpt-5 | 2025-08-07 | 20 | 12 | 6 | 2 | 0 | 0.6000 | 0.3000 | 0.1000 | 0.0000 |

## Plan

### sequential

| Agent | Agent version | Model | Model version | Duration (ms) | Findings | Resolved | Resolution rate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| claude-code | 2.0.1 | claude-sonnet-4 | 20250514 | 480000 | 8 | 8 | 1.0000 |
| codex | 0.42.0 | gpt-5 | 2025-08-07 | 520000 | 8 | 7 | 0.8750 |

### wave-parallel

| Agent | Agent version | Model | Model version | Duration (ms) | Findings | Resolved | Resolution rate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| claude-code | 2.0.1 | claude-sonnet-4 | 20250514 | 180000 | 8 | 8 | 1.0000 |
| codex | 0.42.0 | gpt-5 | 2025-08-07 | 210000 | 8 | 7 | 0.8750 |
`;

test("fixture result files validate against schemas/benchmark-result.v1.schema.json", async () => {
  const validate = new Ajv2020({ allErrors: true }).compile(
    JSON.parse(await readFile(schemaPath, "utf8")) as object,
  );
  for (const result of [guardrailClaude, guardrailCodex, planClaude, planCodex]) {
    assert.ok(validate(result), JSON.stringify(validate.errors));
  }
});

test("the schema rejects a result with an unknown kind or undeclared field", async () => {
  const validate = await loadValidator(schemaPath);
  assert.equal(validate({ ...guardrailClaude, kind: "other" }), false);
  assert.equal(validate({ ...guardrailClaude, extra: true }), false);
  assert.equal(validate({ ...planClaude, arms: [] }), false);
});

test("generateReport prints deterministic Markdown tables for both arms", async () => {
  await withResults(
    {
      "z-plan-codex.json": planCodex,
      "a-guardrail-claude.json": guardrailClaude,
      "m-plan-claude.json": planClaude,
      "b-guardrail-codex.json": guardrailCodex,
    },
    async (directory) => {
      const first = await generateReport(directory, { schemaPath });
      const second = await generateReport(directory, { schemaPath });
      assert.equal(first, EXPECTED_FULL_REPORT);
      assert.equal(second, EXPECTED_FULL_REPORT);
    },
  );
});

test("loadResults sorts by file name and renderReport sorts rows by agent and model", async () => {
  await withResults(
    {
      "2-codex.json": guardrailCodex,
      "1-claude.json": guardrailClaude,
    },
    async (directory) => {
      const loaded = await loadResults(directory, { schemaPath });
      assert.deepEqual(
        loaded.map((entry) => entry.fileName),
        ["1-claude.json", "2-codex.json"],
      );
      const markdown = renderReport(loaded);
      const baselineRows = markdown
        .split("### baseline\n\n")[1]!
        .split("\n\n")[0]!
        .split("\n")
        .slice(2);
      assert.equal(baselineRows[0]!.startsWith("| claude-code |"), true);
      assert.equal(baselineRows[1]!.startsWith("| codex |"), true);
    },
  );
});

test("a directory with only plan results omits the guardrail section", async () => {
  await withResults({ "plan.json": planClaude }, async (directory) => {
    const markdown = await generateReport(directory, { schemaPath });
    assert.equal(markdown.includes("## Guardrail"), false);
    assert.equal(
      markdown,
      `## Plan

### sequential

| Agent | Agent version | Model | Model version | Duration (ms) | Findings | Resolved | Resolution rate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| claude-code | 2.0.1 | claude-sonnet-4 | 20250514 | 480000 | 8 | 8 | 1.0000 |

### wave-parallel

| Agent | Agent version | Model | Model version | Duration (ms) | Findings | Resolved | Resolution rate |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| claude-code | 2.0.1 | claude-sonnet-4 | 20250514 | 180000 | 8 | 8 | 1.0000 |
`,
    );
  });
});

test("invalid JSON and schema mismatches fail with the file name", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-benchmark-report-bad-"));
  try {
    await writeFile(join(directory, "broken.json"), "{ not json\n");
    await assert.rejects(() => loadResults(directory, { schemaPath }), /broken\.json is not valid JSON/);

    await writeFile(join(directory, "broken.json"), `${JSON.stringify({ schemaVersion: "nope" })}\n`);
    await assert.rejects(
      () => loadResults(directory, { schemaPath }),
      /broken\.json does not match schemas\/benchmark-result\.v1\.schema\.json/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an empty directory fails instead of printing an empty report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-benchmark-report-empty-"));
  try {
    await assert.rejects(() => loadResults(directory, { schemaPath }), /No \*\.json result files found/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
