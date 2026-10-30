import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import {
  DART_PACKAGE_CANDIDATES,
  dartDiscontinuedImporter,
  packageUrl,
  PUB_ACCEPT,
  PUB_PACKAGE_NAME,
} from "../../tools/importers/dart-1.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/dart-1.json");

function pub(detail: object | Error | "missing", now = "2026-10-21"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url, options) {
      assert.equal(url, packageUrl(DART_PACKAGE_CANDIDATES[0]));
      assert.equal(options?.accept, PUB_ACCEPT);
      if (detail === "missing") throw new ImporterError(`GET ${url} failed: HTTP 404`);
      if (detail instanceof Error) throw detail;
      return JSON.stringify(detail);
    },
  };
}

test("drafts a discontinued-package rule from the real pub.dev recording", async () => {
  const drafts = await execute(dartDiscontinuedImporter, { replay: recording });
  assert.equal(drafts.rules.length, 1);
  const rule = drafts.rules[0]!;
  assert.equal(rule.id, "dart.package.analysis-server-client.discontinued");
  assert.equal(rule.purl, "pkg:pub/analysis_server_client");
  assert.equal(rule.vers, "vers:semver/*");
  assert.equal(rule.event, "deprecated");
  assert.equal(rule.severity, "medium");
  assert.deepEqual(rule["x-dart"], { kind: "package", package: "analysis_server_client" });
  assert.equal(rule.provenance.importer, "dart-1");
  assert.equal(rule.provenance.observedAt, "2026-10-21");
  assert.deepEqual(drafts.notes, []);
});

test("recorded drafts match the curated registry line and leave nothing to add", async () => {
  const registry = JSON.parse(await readFile("registry/dart.json", "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(dartDiscontinuedImporter, { replay: recording }), registry);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.removed, []);
  const id = "dart.package.analysis-server-client.discontinued";
  assert.ok(diff.unchanged.includes(id) || diff.changed.some((entry) => entry.id === id));
});

test("carries a valid pub.dev replacement into the draft", async () => {
  const result = await runImporter(dartDiscontinuedImporter, pub({
    name: "analysis_server_client",
    isDiscontinued: true,
    replacedBy: "language_server_client",
  }));
  assert.equal(result.rules[0]!.replacement, "language_server_client");
  assert.match(result.rules[0]!.summary, /recommends language_server_client instead/);
});

test("an omitted or false discontinued flag produces no rule", async () => {
  for (const detail of [
    { name: "analysis_server_client" },
    { name: "analysis_server_client", isDiscontinued: false },
  ]) {
    const result = await runImporter(dartDiscontinuedImporter, pub(detail));
    assert.deepEqual(result.rules, []);
    assert.deepEqual(result.notes, ["Not discontinued on pub.dev: analysis_server_client."]);
  }
});

test("invalid replacement metadata cannot become migration guidance", async () => {
  for (const replacedBy of ["Bad Name", "analysis_server_client", 42]) {
    const result = await runImporter(dartDiscontinuedImporter, pub({ name: "analysis_server_client", isDiscontinued: true, replacedBy }));
    assert.equal(result.rules[0]!.replacement, undefined);
    assert.match(result.notes[0]!, /^Ignored invalid replacement/);
  }
});

test("a missing candidate is a note, while other source failures stop the run", async () => {
  const missing = await runImporter(dartDiscontinuedImporter, pub("missing"));
  assert.deepEqual(missing.rules, []);
  assert.deepEqual(missing.notes, ["Skipped analysis_server_client: not found on pub.dev."]);
  await assert.rejects(runImporter(dartDiscontinuedImporter, pub(new ImporterError("GET x failed: HTTP 503"))), /HTTP 503/);
});

test("fails closed when the endpoint answers for another package", async () => {
  await assert.rejects(
    runImporter(dartDiscontinuedImporter, pub({ name: "other", isDiscontinued: true })),
    /returned package name "other", expected "analysis_server_client"/,
  );
});

test("the candidate list is sorted, unique, and contains valid pub names", () => {
  assert.deepEqual([...DART_PACKAGE_CANDIDATES], [...new Set(DART_PACKAGE_CANDIDATES)].sort());
  for (const name of DART_PACKAGE_CANDIDATES) assert.match(name, PUB_PACKAGE_NAME);
});
