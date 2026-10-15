import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { PYPI_CANDIDATES } from "../../tools/importers/pypi-candidates.js";
import { normalizeProject, PYPI_NAME, pypiStatusImporter, simpleUrl } from "../../tools/importers/pypi.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/pypi-status.json");
const ACCEPT = "application/vnd.pypi.simple.v1+json";

type Status = { status?: string; reason?: string } | undefined;

function pypi(statuses: Record<string, Status | Error | "missing">, defaultStatus: Status = { status: "active" }): ImporterContext {
  return {
    now: new Date("2026-10-15T12:00:00Z"),
    async fetchText(url, options) {
      assert.equal(options?.accept, ACCEPT, "the JSON simple API must be requested explicitly");
      const name = candidateFor(url);
      const status = name in statuses ? statuses[name] : defaultStatus;
      if (status === "missing") throw new ImporterError(`GET ${url} failed: HTTP 404`);
      if (status instanceof Error) throw status;
      return JSON.stringify({ meta: { "api-version": "1.4" }, name: normalizeProject(name), files: [], ...(status ? { "project-status": status } : {}) });
    },
  };
}

const candidateFor = (url: string) => PYPI_CANDIDATES.find((name) => simpleUrl(name) === url) ?? url;

test("drafts a rule for each archived project in the recorded PyPI responses", async () => {
  const drafts = await execute(pypiStatusImporter, { replay: recording });
  assert.deepEqual(drafts.rules.map((rule) => rule.id), [
    "python.package.argparse.archived",
    "python.package.enum.archived",
    "python.package.google-cloud.archived",
    "python.package.pathlib.archived",
    "python.package.pil.archived",
    "python.package.typing.archived",
  ]);
  const typing = drafts.rules.find((rule) => rule.id === "python.package.typing.archived")!;
  assert.equal(typing.purl, "pkg:pypi/typing");
  assert.equal(typing.vers, "vers:pypi/*");
  assert.equal(typing.event, "end-of-life");
  assert.equal(typing.severity, "medium");
  assert.equal(typing.title, "typing is archived on PyPI");
  assert.equal(typing.summary, "PyPI marks typing as archived: the project does not expect to be updated in the future.");
  assert.deepEqual(typing["x-python"], { kind: "package", package: "typing" });
  assert.deepEqual(typing.sources.map((source) => source.url), [
    "https://pypi.org/project/typing/",
    "https://pypi.org/simple/typing/",
    "https://packaging.python.org/specifications/project-status-markers/",
  ]);
  assert.deepEqual(drafts.notes, []);
});

test("keeps the project name as published in the detector hint but normalizes everything else", async () => {
  const { rules } = await execute(pypiStatusImporter, { replay: recording });
  const pil = rules.find((rule) => rule["x-python"]?.package === "PIL")!;
  assert.equal(pil.id, "python.package.pil.archived");
  assert.equal(pil.purl, "pkg:pypi/pil");
  assert.equal(pil.title, "PIL is archived on PyPI");
  assert.equal(simpleUrl("Zope.Interface_X"), "https://pypi.org/simple/zope-interface-x/");
  assert.equal(normalizeProject("A__b..C--d"), "a-b-c-d");
});

test("maps each status in the specification to a lifecycle event", async () => {
  const result = await runImporter(pypiStatusImporter, pypi({
    argparse: { status: "archived", reason: "Part of the standard library since Python 2.7 and 3.2." },
    enum: { status: "deprecated" },
    "google-cloud": { status: "quarantined", reason: "Contained   malware\nupload." },
  }));
  const byProject = Object.fromEntries(result.rules.map((rule) => [rule["x-python"]?.package, rule]));
  assert.deepEqual([byProject.argparse!.event, byProject.argparse!.severity], ["end-of-life", "medium"]);
  assert.match(byProject.argparse!.summary, /does not expect to be updated in the future\. Reason given: "Part of the standard library since Python 2\.7 and 3\.2\."$/);
  assert.deepEqual([byProject.enum!.event, byProject.enum!.severity, byProject.enum!.id], ["deprecated", "medium", "python.package.enum.deprecated"]);
  assert.match(byProject.enum!.summary, /considered obsolete and may have been superseded by another project\.$/);
  assert.deepEqual([byProject["google-cloud"]!.event, byProject["google-cloud"]!.severity, byProject["google-cloud"]!.id], ["removed", "critical", "python.package.google-cloud.quarantined"]);
  assert.match(byProject["google-cloud"]!.summary, /generally unsafe for use, and the index no longer offers its files\. Reason given: "Contained malware upload\."$/);
});

test("active projects produce no rule and are listed so they can be removed from the candidates", async () => {
  const result = await runImporter(pypiStatusImporter, pypi({ typing: { status: "archived" } }));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["python.package.typing.archived"]);
  assert.equal(result.notes.length, 1);
  assert.match(result.notes[0]!, /^Active, so no rule \(remove them from PYPI_CANDIDATES if they stay active\): PIL, argparse, enum, google-cloud, pathlib\.$/);
});

test("says so when PyPI reports no status, or one this importer does not know", async () => {
  const result = await runImporter(pypiStatusImporter, pypi({ typing: undefined, enum: { status: "yanked" }, pathlib: { status: "archived" } }));
  assert.deepEqual(result.rules.map((rule) => rule.id), ["python.package.pathlib.archived"]);
  assert.ok(result.notes.includes('Skipped enum: unknown project status "yanked".'));
  assert.ok(result.notes.includes("PyPI reported no project status for: typing."));
});

test("a removed project is noted, but any other failure stops the run", async () => {
  const result = await runImporter(pypiStatusImporter, pypi({ typing: "missing" }));
  assert.ok(result.notes.includes("Skipped typing: not found on PyPI."));
  await assert.rejects(runImporter(pypiStatusImporter, pypi({ typing: new ImporterError("GET x failed: HTTP 503") })), /HTTP 503/);
});

test("a very long reason is shortened", async () => {
  const reason = "x".repeat(500);
  const [rule] = (await runImporter(pypiStatusImporter, pypi({ typing: { status: "archived", reason } }))).rules;
  assert.ok(rule!.summary.includes(`${"x".repeat(199)}…"`));
  assert.ok(rule!.summary.length < 400);
});

test("the candidate list holds valid, sorted projects with distinct normalized names", () => {
  assert.deepEqual([...PYPI_CANDIDATES], [...PYPI_CANDIDATES].sort());
  for (const name of PYPI_CANDIDATES) assert.match(name, PYPI_NAME, name);
  assert.equal(new Set(PYPI_CANDIDATES.map(normalizeProject)).size, PYPI_CANDIDATES.length);
  for (const name of ["", "-x", "x-", "has space", "a/b"]) assert.doesNotMatch(name, PYPI_NAME, name);
});

test("none of today's drafts duplicates or overlaps a rule already in the registry", async () => {
  const existing = JSON.parse(await readFile(resolve("registry/python.json"), "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(pypiStatusImporter, { replay: recording }), existing);
  assert.equal(diff.added.length, 6);
  assert.deepEqual([diff.changed, diff.removed, diff.duplicates], [[], [], []]);
});

test("a response that is not JSON is reported with its URL", async () => {
  await assert.rejects(runImporter(pypiStatusImporter, { now: new Date("2026-10-15T12:00:00Z"), fetchText: async () => "<html>" }), /not valid JSON/);
});
