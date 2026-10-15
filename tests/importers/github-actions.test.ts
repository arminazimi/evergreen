import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { RegistryV2 } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { ACTION_CANDIDATES } from "../../tools/importers/github-actions-candidates.js";
import { ACTION_NAME, githubActionsRuntimeImporter, RETIRED_RUNTIMES } from "../../tools/importers/github-actions.js";
import { execute, runImporter } from "../../tools/importers/run.js";
import { ImporterError } from "../../tools/importers/types.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/github-actions-runtime.json");

/** Serves `runs.using` per action and major; anything not listed is a 404. `file` picks action.yaml instead of action.yml. */
function actions(table: Record<string, Record<number, string | { using?: string; file?: "action.yaml"; raw?: string } | Error>>, now = "2026-10-15"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/v(\d+)\/(action\.ya?ml)$/.exec(url);
      assert.ok(match, `unexpected URL ${url}`);
      const entry = table[match[1]!]?.[Number(match[2])];
      if (entry instanceof Error) throw entry;
      const spec = typeof entry === "string" ? { using: entry } : entry;
      if (!spec || (spec.file ?? "action.yml") !== match[3]) throw new ImporterError(`GET ${url} failed: HTTP 404`);
      return spec.raw ?? `name: x\nruns:\n  using: ${spec.using}\n  main: dist/index.js\n`;
    },
  };
}

test("drafts a rule for every candidate that still has releases on a retired runtime, from the recording", async () => {
  const drafts = await execute(githubActionsRuntimeImporter, { replay: recording });
  assert.deepEqual(drafts.rules.map((rule) => [rule.id, rule.vers]), [
    ["github-actions.cache.node20", "vers:semver/<5.0.0"],
    ["github-actions.checkout.node20", "vers:semver/<5.0.0"],
    ["github-actions.download-artifact.node20", "vers:semver/<7.0.0"],
    ["github-actions.github-script.node20", "vers:semver/<8.0.0"],
    ["github-actions.labeler.node20", "vers:semver/<6.0.0"],
    ["github-actions.setup-go.node20", "vers:semver/<6.0.0"],
    ["github-actions.setup-java.node20", "vers:semver/<5.0.0"],
    ["github-actions.setup-node.node20", "vers:semver/<5.0.0"],
    ["github-actions.setup-python.node20", "vers:semver/<6.0.0"],
    ["github-actions.stale.node20", "vers:semver/<10.0.0"],
    ["github-actions.upload-artifact.node20", "vers:semver/<6.0.0"],
  ]);
  const checkout = drafts.rules.find((rule) => rule.id === "github-actions.checkout.node20")!;
  assert.equal(checkout.purl, "pkg:github/actions/checkout");
  assert.equal(checkout.event, "end-of-support");
  assert.equal(checkout.title, "Unsupported actions/checkout runtime");
  assert.equal(checkout.summary, "This release predates the action's Node.js 24 runtime. GitHub no longer provides Node.js 20 on Actions runners.");
  assert.equal(checkout.replacement, "actions/checkout@v5 or later");
  assert.equal(checkout.deadline, "2026-09-23");
  assert.deepEqual(checkout["x-github-actions"], { action: "actions/checkout", supportedFromMajor: 5 });
  assert.deepEqual(checkout.sources, [
    { title: "Node 20 is no longer available in GitHub Actions", url: "https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/" },
    { title: "actions/checkout v5 action.yml", url: "https://github.com/actions/checkout/blob/v5/action.yml" },
  ]);
  assert.equal(checkout.migration, undefined, "action-specific guidance is written by a person");
  assert.deepEqual(drafts.notes, []);
});

test("reproduces the hand-written rules for checkout, setup-node, and cache", async () => {
  const existing = JSON.parse(await readFile(resolve("registry/github-actions.json"), "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(githubActionsRuntimeImporter, { replay: recording }), existing);
  for (const id of ["github-actions.checkout.node20", "github-actions.setup-node.node20"]) {
    const change = diff.changed.find((entry) => entry.id === id)!;
    assert.deepEqual([change.dates, change.fields], [[], []], `${id}: only its sources differ`);
  }
  const cache = diff.changed.find((entry) => entry.id === "github-actions.cache.node20")!;
  assert.deepEqual(cache.fields.map((field) => field.field), ["summary"], "the hand-written cache rule also mentions a retired cache service");
  assert.equal(cache.dates.length, 0);
});

test("shows where the registry and the actions' own metadata disagree", async () => {
  const existing = JSON.parse(await readFile(resolve("registry/github-actions.json"), "utf8")) as RegistryV2;
  const diff = diffDrafts(await execute(githubActionsRuntimeImporter, { replay: recording }), existing);
  // download-artifact has the same component and versions under another id; upload-artifact moved to Node 24 a major earlier than the registry says.
  assert.deepEqual(diff.duplicates, [{ draft: "github-actions.download-artifact.node20", existing: "github-actions.download-artifact.retired" }]);
  const upload = diff.added.find((rule) => rule.id === "github-actions.upload-artifact.node20")!;
  assert.equal(upload.vers, "vers:semver/<6.0.0");
  assert.equal(existing.rules.find((rule) => rule.id === "github-actions.upload-artifact.retired")!.vers, "vers:semver/<7.0.0");
});

test("a runtime counts as retired on the day GitHub removed it, and the rule follows the calendar", async () => {
  const cycle = { "actions/checkout": { 2: "node12", 3: "node16", 4: "node20", 5: "node24" } };
  const only = (now: string) => runImporter(githubActionsRuntimeImporter, actions(Object.fromEntries(ACTION_CANDIDATES.map((name) => [name, cycle["actions/checkout"]])), now));

  const before = await only("2026-09-22");
  const checkoutBefore = before.rules.find((rule) => rule.id === "github-actions.checkout.node16")!;
  assert.equal(checkoutBefore.vers, "vers:semver/<4.0.0", "Node 20 still works the day before, so v4 is supported");
  assert.equal(checkoutBefore.deadline, "2024-11-12");
  assert.equal(checkoutBefore.summary, "This release predates the action's Node.js 20 runtime. GitHub no longer provides Node.js 16 on Actions runners.");
  assert.equal(checkoutBefore["x-github-actions"]!.supportedFromMajor, 4);

  const onTheDay = await only("2026-09-23");
  assert.equal(onTheDay.rules.find((rule) => rule.id === "github-actions.checkout.node20")!.vers, "vers:semver/<5.0.0");

  const early = await only("2023-08-13");
  assert.deepEqual(early.rules.map((rule) => rule.id).filter((id) => id.startsWith("github-actions.checkout")), [], "nothing was retired yet");
  const afterNode12 = await only("2023-08-14");
  assert.equal(afterNode12.rules.find((rule) => rule.id === "github-actions.checkout.node12")!.vers, "vers:semver/<3.0.0");
});

test("keeps the retired runtimes table to confirmed, dated, sourced facts", () => {
  assert.deepEqual(Object.keys(RETIRED_RUNTIMES), ["node12", "node16", "node20"]);
  for (const [runtime, entry] of Object.entries(RETIRED_RUNTIMES)) {
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, runtime);
    assert.match(entry.source.url, /^https:\/\/github\.blog\/changelog\//, runtime);
    assert.ok(entry.source.title.length > 5);
  }
  assert.ok(RETIRED_RUNTIMES.node12!.date < RETIRED_RUNTIMES.node16!.date && RETIRED_RUNTIMES.node16!.date < RETIRED_RUNTIMES.node20!.date);
});

test("handles actions that are not plain JavaScript actions or have nothing to report", async () => {
  const names = ACTION_CANDIDATES;
  const table: Record<string, Record<number, string>> = {};
  table[names[0]!] = { 1: "composite", 2: "composite" };
  table[names[1]!] = { 1: "node20", 2: "node24", 3: "node24" }; // an old major on a retired runtime: gets a rule
  table[names[2]!] = { 1: "node24", 2: "node24" }; // nothing retired
  table[names[3]!] = { 1: "node20", 2: "node20" }; // nothing supported yet
  const result = await runImporter(githubActionsRuntimeImporter, actions(table));
  assert.ok(result.notes.includes(`Skipped ${names[0]}: not a JavaScript action (runs.using is composite).`));
  assert.ok(result.notes.includes(`Skipped ${names[3]}: no release runs on a supported runtime yet (the latest, v2, uses node20).`));
  assert.ok(result.notes.some((note) => note.startsWith("No release uses a retired runtime, so no rule") && note.includes(names[2]!)));
  assert.ok(result.rules.some((rule) => rule.id.endsWith(".node20") && rule.purl === `pkg:github/${names[1]}`));
  assert.ok(names.slice(4).every((name) => result.notes.includes(`Skipped ${name}: no action.yml was found at any major tag.`)));
});

test("reads action.yaml when an action has no action.yml, and tolerates a missing first major", async () => {
  const table = Object.fromEntries(ACTION_CANDIDATES.map((name) => [name, { 2: { using: "node20", file: "action.yaml" as const }, 3: { using: "node24", file: "action.yaml" as const } }]));
  const result = await runImporter(githubActionsRuntimeImporter, actions(table));
  const rule = result.rules.find((candidate) => candidate.id === "github-actions.checkout.node20")!;
  assert.equal(rule.vers, "vers:semver/<3.0.0");
  assert.equal(rule.sources[1]!.url, "https://github.com/actions/checkout/blob/v3/action.yaml");
});

test("an action's metadata that cannot be read does not decide anything", async () => {
  const table = Object.fromEntries(ACTION_CANDIDATES.map((name) => [name, {
    1: { raw: ": : not yaml : [" },
    2: { raw: "name: no runs section\n" },
    3: "node20",
    4: "node24",
  }]));
  const result = await runImporter(githubActionsRuntimeImporter, actions(table));
  assert.equal(result.rules.find((rule) => rule.id === "github-actions.checkout.node20")!.vers, "vers:semver/<4.0.0");
});

test("any failure other than a missing file stops the run", async () => {
  const table = Object.fromEntries(ACTION_CANDIDATES.map((name) => [name, { 1: "node20", 2: "node24" }]));
  table["actions/checkout"] = { 1: new ImporterError("GET x failed: HTTP 503") } as never;
  await assert.rejects(runImporter(githubActionsRuntimeImporter, actions(table)), /HTTP 503/);
});

test("the candidate list holds valid, sorted, distinct owner/repo names", () => {
  assert.deepEqual([...ACTION_CANDIDATES], [...ACTION_CANDIDATES].sort());
  assert.equal(new Set(ACTION_CANDIDATES.map((name) => name.toLowerCase())).size, ACTION_CANDIDATES.length);
  for (const name of ACTION_CANDIDATES) assert.match(name, ACTION_NAME, name);
  for (const name of ["", "actions", "actions/", "/checkout", "github/codeql-action/init", "a b/c"]) assert.doesNotMatch(name, ACTION_NAME, name);
});
