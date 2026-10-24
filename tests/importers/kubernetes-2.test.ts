import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { KUBERNETES_RELEASES_URL, kubernetesReleasesImporter } from "../../tools/importers/kubernetes-2.js";
import { execute, runImporter } from "../../tools/importers/run.js";

const recording = resolve("tests/importers/recordings/kubernetes-2.json");

test("drafts the five newest end-of-life lines from the real recording, using the end-of-life column", async () => {
  const drafts = await execute(kubernetesReleasesImporter, { replay: recording });
  const ended = { ...drafts, rules: drafts.rules.filter((rule) => rule.event === "end-of-life") };
  assert.deepEqual(ended.rules.map((rule) => rule.id), [
    "kubernetes.release.end-of-life-1.29",
    "kubernetes.release.end-of-life-1.30",
    "kubernetes.release.end-of-life-1.31",
    "kubernetes.release.end-of-life-1.32",
    "kubernetes.release.end-of-life-1.33",
  ]);
  // The table is "Minor | Final patch | End of life": 1.33's final patch is 1.33.13, its end of life 2026-06-28.
  assert.deepEqual(ended.rules.map((rule) => rule.deadline), ["2025-02-28", "2025-07-15", "2025-11-11", "2026-02-28", "2026-06-28"]);
  assert.deepEqual(ended.rules.map((rule) => rule.vers), [
    "vers:semver/>=1.29.0|<1.30.0",
    "vers:semver/>=1.30.0|<1.31.0",
    "vers:semver/>=1.31.0|<1.32.0",
    "vers:semver/>=1.32.0|<1.33.0",
    "vers:semver/>=1.33.0|<1.34.0",
  ]);
  assert.ok(ended.rules.every((rule) => rule.purl === "pkg:generic/kubernetes"));
  assert.ok(ended.rules.every((rule) => rule.replacement === "Kubernetes 1.34 or later"));
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "kubernetes-2" && rule.provenance.observedAt === "2026-10-17"));
  assert.deepEqual(drafts.notes, [
    "Supported release lines: 1.34, 1.35, 1.36, 1.37.",
    "The drafts describe Kubernetes releases, not API versions; no detector reads them yet.",
  ]);
});

test("drafts are additions to the reviewed registry, never changes to its API rules", async () => {
  const registry = JSON.parse(await readFile(resolve("registry/kubernetes.json"), "utf8")) as RegistryV2;
  const drafts = await execute(kubernetesReleasesImporter, { replay: recording });
  const diff = diffDrafts(drafts, registry);
  assert.deepEqual([diff.changed, diff.removed, diff.duplicates], [[], [], []]);
  assert.equal(diff.added.length, 8);
});

const page = (header: string, rows: string, maintained = "<p>1.37 Latest Release: 1.37.1 (released: 2026-09-15 ) End of Life: 2027-10-28</p>") =>
  `${maintained}<table><tr><th>${header}</th></tr>${rows}</table>`;
const HEADER = "Minor Version Final Patch Release End Of Life Date Note";
const rows = "<tr><td>1.33</td><td>1.33.13</td><td>2026-06-28</td></tr><tr><td>1.32</td><td>1.32.13</td><td>2026-02-28</td></tr>";

function release(body: string, now = "2026-10-17T12:00:00Z") {
  return runImporter(kubernetesReleasesImporter, {
    now: new Date(now),
    async fetchText(url, options) {
      assert.equal(url, KUBERNETES_RELEASES_URL);
      assert.equal(options?.accept, "text/html");
      return body;
    },
  });
}

test("time decides which lines have ended", async () => {
  const later = await release(page(HEADER, rows), "2026-10-17T12:00:00Z");
  assert.deepEqual(later.rules.map((rule) => rule.id), ["kubernetes.release.end-of-life-1.32", "kubernetes.release.end-of-life-1.33"]);
  const earlier = await release(page(HEADER, rows), "2026-03-01T12:00:00Z");
  assert.deepEqual(earlier.rules.map((rule) => rule.id), ["kubernetes.release.end-of-life-1.32"]);
});

test("a changed column order produces a review note, not rules", async () => {
  const result = await release(page("Minor Version End Of Life Date Final Patch Release Note", rows));
  assert.deepEqual(result.rules, []);
  assert.deepEqual(result.notes, ["No usable end-of-life table was found in the Kubernetes release history."]);
});

test("a row whose final patch is not on its own line is ignored", async () => {
  const result = await release(page(HEADER, "<tr><td>1.33</td><td>1.32.9</td><td>2026-06-28</td></tr>"));
  assert.deepEqual(result.rules, []);
});

test("without a maintained line the drafts carry no replacement", async () => {
  const result = await release(page(HEADER, rows, ""));
  assert.equal(result.rules.length, 2);
  assert.ok(result.rules.every((rule) => rule.replacement === undefined));
  assert.equal(result.notes[0], "No maintained release lines were found; the drafts have no replacement.");
});

test("a maintained line that ends within twelve months is drafted as a scheduled rule for exactly that line, with the id of its later end-of-life rule", async () => {
  const drafts = await execute(kubernetesReleasesImporter, { replay: recording });
  const scheduled = drafts.rules.filter((rule) => rule.event === "scheduled-end-of-life");
  assert.deepEqual(scheduled.map((rule) => [rule.id, rule.vers, rule.severity, rule.deadline, rule.replacement]), [
    ["kubernetes.release.end-of-life-1.34", "vers:semver/>=1.34.0|<1.35.0", "low", "2026-10-27", "Kubernetes 1.37 or later"],
    ["kubernetes.release.end-of-life-1.35", "vers:semver/>=1.35.0|<1.36.0", "low", "2027-02-28", "Kubernetes 1.37 or later"],
    ["kubernetes.release.end-of-life-1.36", "vers:semver/>=1.36.0|<1.37.0", "low", "2027-06-28", "Kubernetes 1.37 or later"],
  ]);
});
