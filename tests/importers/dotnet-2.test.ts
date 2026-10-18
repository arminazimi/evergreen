import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateRegistryV2 } from "../../src/registry.js";
import { NUGET_CANDIDATES } from "../../tools/importers/dotnet-candidates.js";
import { nugetDeprecationImporter, obsoleteDate, registrationUrl } from "../../tools/importers/dotnet-2.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const recording = resolve("tests/importers/recordings/dotnet-2.json");

function inline(packages: Record<string, unknown>, now = "2026-10-18"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      const body = packages[url];
      if (body === undefined) throw new Error(`unexpected ${url}`);
      return JSON.stringify(body);
    },
  };
}

const leaf = (version: string, deprecation?: object, listed = true) => ({ catalogEntry: { version, listed, ...(deprecation ? { deprecation } : {}) } });
const registration = (...items: object[]) => ({ items: [{ items }] });
const legacy = { reasons: ["Legacy"], message: "Please note, this package is obsolete as of 3/31/2023.", alternatePackage: { id: "Azure.Storage.Common" } };

test("dotnet-2 drafts a rule for each candidate whose every version is deprecated as legacy, offline", async () => {
  const drafts = await execute(nugetDeprecationImporter, { replay: recording });
  assert.deepEqual(drafts.rules.map((rule) => rule.id), [
    "dotnet.package.microsoft-azure-documentdb.deprecated",
    "dotnet.package.microsoft-azure-servicebus.deprecated",
    "dotnet.package.microsoft-azure-storage-blob.deprecated",
    "dotnet.package.windowsazure-storage.deprecated",
  ]);
  const storage = drafts.rules.find((rule) => rule.purl === "pkg:nuget/WindowsAzure.Storage")!;
  assert.equal(storage.vers, "vers:nuget/*");
  assert.equal(storage.event, "deprecated");
  assert.equal(storage.deadline, "2023-03-31");
  assert.equal(storage.replacement, "Azure.Storage.Common");
  assert.equal(storage.provenance.importer, "dotnet-2");
  assert.equal(storage.provenance.reviewer, "pending-review");
  assert.equal(drafts.rules.find((rule) => rule.purl === "pkg:nuget/Microsoft.Azure.ServiceBus")!.deadline, "2026-09-30");
  assert.match(drafts.notes.join("\n"), /System\.Data\.SqlClient: only 2 of \d+ versions are deprecated/);
});

test("the committed package rule matches what the importer drafts from the recording", async () => {
  const drafts = (await execute(nugetDeprecationImporter, { replay: recording })).rules;
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/dotnet.json", "utf8")));
  const committed = registry.rules.filter((rule) => rule.purl.startsWith("pkg:nuget/"));
  assert.ok(committed.length >= 1);
  for (const rule of committed) {
    const draft = drafts.find((candidate) => candidate.id === rule.id);
    assert.ok(draft, `${rule.id} is drafted by the importer`);
    for (const field of ["purl", "vers", "event", "deadline"] as const) assert.deepEqual(rule[field], draft[field], `${rule.id} ${field}`);
  }
});

test("dotnet-2 drafts nothing for a partly deprecated package, a non-legacy reason, or an unlisted package, and says why", async () => {
  const id = (name: string) => registrationUrl(name);
  const candidates = NUGET_CANDIDATES.slice(0, 4);
  const responses: Record<string, unknown> = {
    [id(candidates[0]!)]: registration(leaf("1.0.0", legacy), leaf("2.0.0")),
    [id(candidates[1]!)]: registration(leaf("1.0.0", { reasons: ["CriticalBugs"], message: "bug" })),
    [id(candidates[2]!)]: registration(leaf("1.0.0", legacy, false)),
    [id(candidates[3]!)]: registration(leaf("1.0.0")),
    [id(NUGET_CANDIDATES[4]!)]: registration(leaf("1.0.0", legacy)),
  };
  const out = await nugetDeprecationImporter.import(inline(responses));
  assert.deepEqual(out.rules.map((rule) => rule.purl), [`pkg:nuget/${NUGET_CANDIDATES[4]}`]);
  const notes = out.notes.join("\n");
  assert.match(notes, /only 1 of 2 versions are deprecated/);
  assert.match(notes, /deprecated for CriticalBugs, not as legacy/);
  assert.match(notes, /NuGet lists no versions/);
  assert.match(notes, /none of its 1 versions is deprecated/);
});

test("dotnet-2 follows linked pages and stops the run on a failed request", async () => {
  const linked = (name: string) => ({ items: [{ "@id": `https://example.test/${name}/page0.json` }] });
  const responses: Record<string, unknown> = {};
  for (const name of NUGET_CANDIDATES) {
    responses[registrationUrl(name)] = linked(name);
    responses[`https://example.test/${name}/page0.json`] = { items: [leaf("1.0.0", legacy)] };
  }
  assert.equal((await nugetDeprecationImporter.import(inline(responses))).rules.length, NUGET_CANDIDATES.length);
  await assert.rejects(nugetDeprecationImporter.import({ now: new Date(), async fetchText() { throw new Error("HTTP 503"); } }), /HTTP 503/);
});

test("obsoleteDate reads the Azure SDK wording and nothing else", () => {
  assert.equal(obsoleteDate("this package is obsolete as of 3/31/2023 and"), "2023-03-31");
  assert.equal(obsoleteDate("Obsolete as of 9/30/2026."), "2026-09-30");
  assert.equal(obsoleteDate("obsolete as of 13/45/2023"), undefined);
  assert.equal(obsoleteDate("use something else"), undefined);
});
