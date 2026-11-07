import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  type BuiltComparison,
  type ComparisonBuilder,
  main,
  RECORD_SCHEMA_VERSION,
  recordComparisons,
  renderRecord,
  REPRODUCE_PATH,
  sha256,
} from "../benchmarks/comparison/reproduce.js";

function comparison(overrides: Partial<BuiltComparison> = {}): BuiltComparison {
  return {
    name: "example",
    pins: { tool: "1.2.3" },
    inputs: { rawRecords: 2 },
    known: { blind: { repositories: 2, outcomes: { agree: 1, miss: 1 } } },
    files: [
      { path: "benchmarks/comparison/example/result.json", contents: '{"ok":true}\n' },
      { path: "benchmarks/comparison/example/result.md", contents: "# Result\n" },
    ],
    ...overrides,
  };
}

function builder(value: BuiltComparison): ComparisonBuilder {
  return async () => value;
}

async function temporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "comparison-reproduce-test-"));
}

test("the record keeps a hash per file and no generated table copy", () => {
  const record = recordComparisons([comparison()]);
  assert.equal(record.schemaVersion, RECORD_SCHEMA_VERSION);
  assert.equal(record.command, "npm run comparison:reproduce");
  assert.equal(record.node, ">=22");
  assert.equal(record.comparisons.length, 1);
  const files = record.comparisons[0]?.files ?? [];
  assert.deepEqual(files, [
    {
      path: "benchmarks/comparison/example/result.json",
      sha256: sha256('{"ok":true}\n'),
    },
    {
      path: "benchmarks/comparison/example/result.md",
      sha256: sha256("# Result\n"),
    },
  ]);
  assert.equal("contents" in (files[0] as object), false);
  assert.match(renderRecord(record), /"known": \{\n\s+"blind": \{/);
});

test("record writes the tables and the known result, and the next run verifies them", async () => {
  const root = await temporaryRoot();
  try {
    const lines: string[] = [];
    const log = (line: string) => lines.push(line);
    const options = { root, builders: [builder(comparison())], log, error: log };

    assert.equal(await main(["--record"], options), 0);
    assert.equal(await readFile(join(root, "benchmarks/comparison/example/result.json"), "utf8"), '{"ok":true}\n');
    assert.equal(await readFile(join(root, "benchmarks/comparison/example/result.md"), "utf8"), "# Result\n");
    const record = JSON.parse(await readFile(join(root, REPRODUCE_PATH), "utf8")) as ReturnType<
      typeof recordComparisons
    >;
    assert.equal(record.comparisons[0]?.pins.tool, "1.2.3");

    lines.length = 0;
    assert.equal(await main([], options), 0);
    assert.match(lines.join("\n"), /example: tool 1\.2\.3/);
    assert.match(lines.join("\n"), /2 files match benchmarks\/comparison\/reproduce\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a table that no longer matches the known result fails and names the file", async () => {
  const root = await temporaryRoot();
  try {
    const lines: string[] = [];
    const options = {
      root,
      builders: [builder(comparison())],
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
    assert.equal(await main(["--record"], options), 0);
    await writeFile(join(root, "benchmarks/comparison/example/result.md"), "# Changed\n");

    lines.length = 0;
    assert.equal(await main([], options), 1);
    assert.match(lines.join("\n"), /benchmarks\/comparison\/example\/result\.md does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a changed pin, input count, or known count fails through the known result", async () => {
  const root = await temporaryRoot();
  try {
    const lines: string[] = [];
    const options = {
      root,
      builders: [builder(comparison())],
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
    assert.equal(await main(["--record"], options), 0);
    const path = join(root, REPRODUCE_PATH);
    const record = JSON.parse(await readFile(path, "utf8")) as { comparisons: Array<{ pins: { tool: string } }> };
    assert.ok(record.comparisons[0]);
    record.comparisons[0].pins.tool = "1.2.4";
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`);

    lines.length = 0;
    assert.equal(await main([], options), 1);
    assert.match(lines.join("\n"), /does not match the pinned versions, inputs, or known result/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a missing table or missing known result fails instead of being skipped", async () => {
  const root = await temporaryRoot();
  try {
    const lines: string[] = [];
    const options = {
      root,
      builders: [builder(comparison())],
      log: (line: string) => lines.push(line),
      error: (line: string) => lines.push(line),
    };
    assert.equal(await main([], options), 1);
    assert.match(lines.join("\n"), /benchmarks\/comparison\/example\/result\.json is missing/);
    assert.match(lines.join("\n"), /benchmarks\/comparison\/reproduce\.json is missing/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("--record and --check together is a usage error", async () => {
  const root = await temporaryRoot();
  try {
    const errors: string[] = [];
    const code = await main(["--record", "--check"], {
      root,
      builders: [builder(comparison())],
      log: () => undefined,
      error: (line: string) => errors.push(line),
    });
    assert.equal(code, 2);
    assert.match(errors.join("\n"), /choose one/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the committed known result hashes exactly the committed tables", async () => {
  const record = JSON.parse(await readFile(resolve(REPRODUCE_PATH), "utf8")) as ReturnType<typeof recordComparisons>;
  assert.equal(record.schemaVersion, RECORD_SCHEMA_VERSION);
  assert.equal(record.command, "npm run comparison:reproduce");
  assert.deepEqual(
    record.comparisons.map((entry) => entry.name),
    ["renovate", "dependabot", "endoflife-date"],
  );
  for (const entry of record.comparisons) {
    assert.ok(Object.keys(entry.pins).length > 0, `${entry.name} pins at least one input`);
    assert.ok(Object.keys(entry.inputs).length > 0, `${entry.name} records its inputs`);
    for (const file of entry.files) {
      assert.equal(sha256(await readFile(resolve(file.path), "utf8")), file.sha256, file.path);
    }
  }
  const renovate = record.comparisons[0];
  const dependabot = record.comparisons[1];
  const endoflife = record.comparisons[2];
  assert.match(String(renovate?.pins.renovate), /^\d+\.\d+\.\d+/);
  assert.equal(dependabot?.pins.dependabot, "not-run");
  assert.match(String(endoflife?.pins.snapshot), /^\d{4}-\d{2}-\d{2}$/);
});
