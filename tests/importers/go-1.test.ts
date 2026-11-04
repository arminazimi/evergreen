import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { GO_RELEASE_HISTORY_URL, goReleasePolicyImporter } from "../../tools/importers/go-1.js";
import { execute, runImporter } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/go-1.json");

test("drafts the five newest unsupported Go release lines from the real recording", async () => {
  const drafts = await execute(goReleasePolicyImporter, { replay: recording });
  assert.deepEqual(
    drafts.rules.map((rule) => rule.id),
    [
      "go.runtime.end-of-support-1.21",
      "go.runtime.end-of-support-1.22",
      "go.runtime.end-of-support-1.23",
      "go.runtime.end-of-support-1.24",
      "go.runtime.end-of-support-1.25",
    ],
  );
  assert.deepEqual(
    drafts.rules.map((rule) => rule.deadline),
    ["2024-08-13", "2025-02-11", "2025-08-12", "2026-02-10", "2026-08-19"],
  );
  assert.ok(
    drafts.rules.every((rule) => rule.provenance.importer === "go-1" && rule.provenance.observedAt === "2026-10-16"),
  );
  assert.deepEqual(drafts.notes, [
    "Supported release lines: Go 1.26 and Go 1.27.",
    "No scheduled rule was drafted: Go announces no end date for Go 1.26 or Go 1.27; each ends when a release two majors newer ships.",
  ]);
});

test("recorded drafts match the reviewed Go registry", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/go.json"), "utf8")) as RegistryV2;
  const drafts = await execute(goReleasePolicyImporter, { replay: recording });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual([diff.added, diff.changed, diff.removed], [[], [], []]);
});

test("a release line inside a script block is ignored, even when its closing tag has whitespace", async () => {
  const result = await runImporter(goReleasePolicyImporter, {
    now: new Date("2026-10-16T12:00:00Z"),
    async fetchText() {
      return [
        "<script>go1.99.0 (released 2099-01-01)</script >",
        "<h2>go1.25.0 (released 2026-08-19)</h2>",
        "<h2>go1.26.0 (released 2027-02-10)</h2>",
        "<h2>go1.27.0 (released 2027-08-11)</h2>",
      ].join("\n");
    },
  });
  assert.deepEqual(
    result.rules.map((rule) => rule.id),
    ["go.runtime.end-of-support-1.25"],
  );
  assert.equal(result.rules[0]!.deadline, "2027-08-11");
});

test("missing or incomplete release history produces a review note, not guessed rules", async () => {
  const result = await runImporter(goReleasePolicyImporter, {
    now: new Date("2026-10-16T12:00:00Z"),
    async fetchText(url, options) {
      assert.equal(url, GO_RELEASE_HISTORY_URL);
      assert.equal(options?.accept, "text/html");
      return "<h2>go1.27.0 (released 2026-08-19)</h2>";
    },
  });
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable Go release history was found."]);
});
