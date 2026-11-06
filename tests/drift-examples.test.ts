import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { after, test } from "node:test";

import { driftCollectors } from "../src/drift/index.js";
import type { DriftReport } from "../src/drift/index.js";
import { materializeExample } from "../tools/examples.js";
import { runCli } from "./cli-runner.js";
import { copyFixtureTree } from "./fixture-copies.js";

// Exit criteria of the drift epic that span every collector: the examples drift, the consistent fixtures do not,
// and `--json` is byte-identical on every platform CI runs (`check` on Linux, `check-cross-os` on Windows and macOS).

const GOLDEN = resolve("tests/fixtures/drift-golden/examples.json");
const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Collectors that share a repository with another runtime: Erlang/OTP pins sit beside Elixir's. */
const SAME_FIXTURE: Record<string, string> = { erlang: "elixir" };

test("drift examples/drift --check exits 1 and reports a drift for each of the ten runtimes", async () => {
  const root = await materializeExample("drift");
  roots.push(dirname(root));
  const result = await runCli(["drift", root, "--check", "--json"]);
  assert.equal(result.code, 1, result.stderr);
  const report = JSON.parse(result.stdout) as DriftReport;
  const drifted = new Set(report.runtimes.filter((runtime) => runtime.drifted).map((runtime) => runtime.runtime));
  assert.deepEqual([...drifted].sort(), [
    "dotnet",
    "elixir",
    "erlang",
    "go",
    "java",
    "nodejs",
    "php",
    "python",
    "ruby",
    "rust",
    "terraform",
  ]);
});

test("every consistent fixture reports no drift for its runtime", async () => {
  for (const collector of driftCollectors) {
    const name = SAME_FIXTURE[collector.runtime] ?? collector.runtime;
    const root = await copyFixtureTree(resolve("tests/fixtures/drift", name, "consistent"), roots);
    const result = await runCli(["drift", root, "--runtime", collector.runtime, "--json"]);
    assert.equal(result.code, 0, `${collector.runtime}: ${result.stderr}`);
    const report = JSON.parse(result.stdout) as DriftReport;
    assert.ok(report.runtimes.length > 0, `${collector.runtime}: the consistent fixture has no pins`);
    for (const runtime of report.runtimes) {
      assert.equal(runtime.drifted, false, `${collector.runtime}: ${runtime.runtime} drifts in the consistent fixture`);
      assert.deepEqual(runtime.floorConflicts, [], `${collector.runtime}: floor conflict in the consistent fixture`);
    }
  }
});

test("drift --json over the examples is byte-identical to the committed output, with forward-slash paths", async () => {
  const root = await materializeExample("drift");
  roots.push(dirname(root));
  const result = await runCli(["drift", root, "--json"]);
  assert.ok(!result.stdout.includes("\\\\"), "a path uses a backslash");
  if (process.env.UPDATE_GOLDEN === "1") await writeFile(GOLDEN, result.stdout);
  assert.equal(result.stdout, await readFile(GOLDEN, "utf8"));
});
