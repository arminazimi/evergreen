import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { RegistryV2, RegistryV2Rule } from "../../src/registry.js";
import { diffDrafts, fingerprint, hasChanges, loadAcknowledged, renderDiffText } from "../../tools/importers/diff.js";
import type { DraftRegistry } from "../../tools/importers/types.js";

const run = promisify(execFile);

function rule(id: string, extra: Record<string, unknown> = {}, importer?: string): RegistryV2Rule {
  return {
    id,
    ecosystem: "nodejs",
    purl: "pkg:generic/nodejs",
    vers: "vers:semver/<18.0.0",
    event: "end-of-life",
    title: `${id} title`,
    summary: `${id} summary`,
    severity: "high",
    deadline: "2025-04-30",
    sources: [{ title: "Node.js releases", url: "https://nodejs.org/en/about/releases" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "maintainer", ...(importer ? { importer } : {}) },
    ...extra,
  } as RegistryV2Rule;
}

const draftOf = (rules: RegistryV2Rule[], importer = "node-schedule"): DraftRegistry => ({
  importer,
  ecosystem: "nodejs",
  observedAt: "2026-10-15",
  rules: rules.map((r) => ({ ...r, provenance: { observedAt: "2026-10-15", reviewedAt: "2026-10-15", reviewer: "pending-review", importer } })),
  notes: [],
});

const registryOf = (rules: RegistryV2Rule[]): RegistryV2 => ({ schemaVersion: "evergreen.registry.v2", ecosystem: "nodejs", rules });

test("classifies additions, changed dates, changed sources, other changes, and removals", () => {
  const registry = registryOf([
    rule("nodejs.same", {}, "node-schedule"),
    rule("nodejs.date", {}, "node-schedule"),
    rule("nodejs.sources", {}, "node-schedule"),
    rule("nodejs.text", {}, "node-schedule"),
    rule("nodejs.gone", {}, "node-schedule"),
    rule("nodejs.hand-written"),
    rule("nodejs.other-importer", {}, "other-importer"),
  ]);
  const drafts = draftOf([
    rule("nodejs.same"),
    rule("nodejs.date", { deadline: "2025-05-15" }),
    rule("nodejs.sources", { sources: [{ title: "Node.js release schedule", url: "https://nodejs.org/en/about/releases" }, { title: "Schedule JSON", url: "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json" }] }),
    rule("nodejs.text", { summary: "Reworded.", severity: "critical", "x-nodejs": { major: 16 } }),
    rule("nodejs.new"),
  ]);

  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(diff.added.map((r) => r.id), ["nodejs.new"]);
  assert.deepEqual(diff.unchanged, ["nodejs.same"]);
  assert.deepEqual(diff.removed.map((r) => r.id), ["nodejs.gone"]);
  assert.deepEqual(diff.changed.map((c) => c.id), ["nodejs.date", "nodejs.sources", "nodejs.text"]);

  const date = diff.changed[0]!;
  assert.deepEqual(date.dates, [{ field: "deadline", before: "2025-04-30", after: "2025-05-15" }]);
  assert.deepEqual([date.sources, date.fields], [null, []]);

  const sources = diff.changed[1]!;
  assert.deepEqual(sources.sources?.added.map((s) => s.url), ["https://raw.githubusercontent.com/nodejs/Release/main/schedule.json"]);
  assert.deepEqual(sources.sources?.retitled, [{ url: "https://nodejs.org/en/about/releases", before: "Node.js releases", after: "Node.js release schedule" }]);
  assert.deepEqual(sources.sources?.removed, []);

  const text = diff.changed[2]!;
  assert.deepEqual(text.fields.map((f) => f.field), ["summary", "severity", "x-nodejs"]);
  assert.deepEqual(text.fields[1], { field: "severity", before: "high", after: "critical" });
  assert.deepEqual(text.fields[2], { field: "x-nodejs", before: null, after: { major: 16 } });
  assert.ok(hasChanges(diff));
});

test("flags an added draft that duplicates an existing rule under another id", () => {
  const registry = registryOf([rule("nodejs.old-name", { vers: "vers:semver/>=18.0.0|<19.0.0" }), rule("nodejs.other", { vers: "vers:semver/>=20.0.0|<21.0.0" })]);
  const drafts = draftOf([
    rule("nodejs.new-name", { vers: "vers:semver/>=18.0.0|<19.0.0" }),
    rule("nodejs.fresh", { vers: "vers:semver/>=22.0.0|<23.0.0" }),
    rule("nodejs.same-purl-other-range", { vers: "vers:semver/>=20.0.0|<22.0.0" }),
  ]);
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual(diff.added.map((added) => added.id), ["nodejs.fresh", "nodejs.new-name", "nodejs.same-purl-other-range"]);
  assert.deepEqual(diff.duplicates, [{ draft: "nodejs.new-name", existing: "nodejs.old-name" }]);
  assert.match(renderDiffText(diff), /\+ nodejs\.new-name .*\n    same component and versions as existing rule nodejs\.old-name\n/);
  assert.deepEqual(diffDrafts(draftOf([rule("nodejs.old-name", { vers: "vers:semver/>=18.0.0|<19.0.0" })]), registry).duplicates, [], "the same id is an update, not a duplicate");
});

test("provenance never counts as a change", () => {
  const diff = diffDrafts(draftOf([rule("nodejs.a")]), registryOf([rule("nodejs.a", {}, "node-schedule")]));
  assert.deepEqual(diff.unchanged, ["nodejs.a"]);
  assert.equal(hasChanges(diff), false);
});

test("fields the importer does not set are left alone", () => {
  const withGuidance = rule("nodejs.a", {
    migration: { constraints: ["c"], steps: [{ id: "s", title: "t", instructions: "i", targets: "all" }], verification: [{ command: "node --version", purpose: "p" }] },
    usage: [{ kind: "config-key", language: "json", key: "engines" }],
    replacement: "Node.js 22",
  });
  const draft = rule("nodejs.a");
  delete (draft as unknown as Record<string, unknown>).replacement;
  const diff = diffDrafts(draftOf([draft]), registryOf([withGuidance]));
  assert.deepEqual(diff.unchanged, ["nodejs.a"]);
});

test("a dropped source and a dropped deadline are reported", () => {
  const registry = registryOf([rule("nodejs.a", { sources: [{ title: "A", url: "https://example.com/a" }, { title: "B", url: "https://example.com/b" }] })]);
  const drafts = draftOf([rule("nodejs.a", { sources: [{ title: "A", url: "https://example.com/a" }] })]);
  assert.deepEqual(diffDrafts(drafts, registry).changed[0]!.sources?.removed.map((s) => s.url), ["https://example.com/b"]);
});

test("output does not depend on input order", () => {
  const rules = ["c", "a", "b"].map((name) => rule(`nodejs.${name}`, { severity: "low" }));
  const registry = registryOf([...rules].reverse().map((r) => ({ ...r, severity: "high" }) as RegistryV2Rule));
  const forward = diffDrafts(draftOf(rules), registry);
  const backward = diffDrafts(draftOf([...rules].reverse()), registryOf([...registry.rules].reverse()));
  assert.equal(JSON.stringify(forward), JSON.stringify(backward));
  assert.deepEqual(forward.changed.map((c) => c.id), ["nodejs.a", "nodejs.b", "nodejs.c"]);
});

test("drafts for another ecosystem are refused", () => {
  assert.throws(() => diffDrafts({ ...draftOf([]), ecosystem: "python" }, registryOf([])), /Drafts are for "python" but the registry is "nodejs"/);
});

test("renders a summary a reviewer can read", () => {
  const registry = registryOf([rule("nodejs.date", {}, "node-schedule"), rule("nodejs.gone", {}, "node-schedule")]);
  const text = renderDiffText(diffDrafts(draftOf([rule("nodejs.date", { deadline: "2025-05-15" }), rule("nodejs.new", { vers: "vers:semver/>=24.0.0|<25.0.0" })]), registry));
  assert.equal(text, [
    "node-schedule → registry/nodejs.json",
    "+ nodejs.new  (end-of-life, pkg:generic/nodejs vers:semver/>=24.0.0|<25.0.0)",
    "~ nodejs.date",
    "    deadline: 2025-04-30 → 2025-05-15",
    "- nodejs.gone",
    "1 added, 1 changed, 1 removed, 0 unchanged",
    "",
  ].join("\n"));
});

test("the command line prints the diff and signals changes through its exit code", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-diff-"));
  try {
    const registryFile = join(directory, "nodejs.json");
    const draftsFile = join(directory, "drafts.json");
    const outFile = join(directory, "diff.json");
    await writeFile(registryFile, JSON.stringify(registryOf([rule("nodejs.a", {}, "node-schedule")])));
    const script = resolve("dist/tools/importers/diff.js");

    await writeFile(draftsFile, JSON.stringify(draftOf([rule("nodejs.a")])));
    const same = await run(process.execPath, [script, draftsFile, registryFile]);
    assert.match(same.stdout, /0 added, 0 changed, 0 removed, 1 unchanged/);

    await writeFile(draftsFile, JSON.stringify(draftOf([rule("nodejs.a", { deadline: "2025-06-01" })])));
    await assert.rejects(run(process.execPath, [script, draftsFile, registryFile, "--out", outFile]), (error: { code: number; stdout: string }) => {
      assert.equal(error.code, 10);
      assert.match(error.stdout, /deadline: 2025-04-30 → 2025-06-01/);
      return true;
    });
    assert.equal(JSON.parse(await readFile(outFile, "utf8")).changed[0].id, "nodejs.a");

    await assert.rejects(run(process.execPath, [script, draftsFile]), /Usage: diff/);
    await writeFile(registryFile, JSON.stringify({ schemaVersion: "evergreen.nodejs-registry.v1", rules: [] }));
    await assert.rejects(run(process.execPath, [script, draftsFile, registryFile]), /schemaVersion must be "evergreen\.registry\.v2"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an acknowledged draft is left out of added and changed, and comes back when the draft changes", () => {
  const registry = registryOf([rule("node.a", { summary: "reviewed text" })]);
  const drafts = draftOf([rule("node.a", { summary: "importer text" }), rule("node.b")]);
  assert.equal(hasChanges(diffDrafts(drafts, registry)), true);

  const acknowledged = {
    [`node-schedule:node.a`]: fingerprint(drafts.rules[0]!),
    [`node-schedule:node.b`]: fingerprint(drafts.rules[1]!),
  };
  const quiet = diffDrafts(drafts, registry, acknowledged);
  assert.deepEqual([quiet.added, quiet.changed], [[], []]);
  assert.deepEqual(quiet.acknowledged, ["node.a", "node.b"]);
  assert.equal(hasChanges(quiet), false);
  assert.match(renderDiffText(quiet), /2 acknowledged/);

  const moved = draftOf([rule("node.a", { summary: "importer text, updated" }), rule("node.b", { vers: "vers:semver/<19.0.0" })]);
  const again = diffDrafts(moved, registry, acknowledged);
  assert.deepEqual(again.added.map((item) => item.id), ["node.b"]);
  assert.deepEqual(again.changed.map((item) => item.id), ["node.a"]);
  assert.deepEqual(again.acknowledged, []);
});

test("an acknowledgement belongs to one importer, and provenance does not change its fingerprint", () => {
  const registry = registryOf([rule("node.a", { summary: "reviewed text" })]);
  const draft = draftOf([rule("node.a", { summary: "importer text" })]);
  const key = fingerprint(draft.rules[0]!);
  assert.equal(diffDrafts(draft, registry, { "other-importer:node.a": key }).changed.length, 1);
  const later = draftOf([rule("node.a", { summary: "importer text" })]);
  later.rules[0]!.provenance.observedAt = "2027-01-01";
  assert.equal(fingerprint(later.rules[0]!), key);
});

test("the committed acknowledgements all name a registered importer and a fingerprint", async () => {
  const { importers } = await import("../../tools/importers/index.js");
  const file = JSON.parse(await readFile(resolve("tools/importers/acknowledged.json"), "utf8")) as { acknowledged: Record<string, string>; reasons: Record<string, string> };
  assert.deepEqual(Object.keys(file.reasons).sort(), Object.keys(file.acknowledged).sort(), "every acknowledgement states why");
  for (const [key, value] of Object.entries(file.acknowledged)) {
    const [importer] = key.split(":");
    assert.ok(importers.some((candidate) => candidate.id === importer), key);
    assert.match(value, /^[0-9a-f]{16}$/, key);
  }
});

test("a missing acknowledgement file means nothing is acknowledged", async () => {
  assert.deepEqual(await loadAcknowledged(join(tmpdir(), "no-such-acknowledged.json")), {});
});
