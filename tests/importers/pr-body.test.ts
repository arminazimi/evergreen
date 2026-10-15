import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { RegistryV2, RegistryV2Rule } from "../../src/registry.js";
import { diffDrafts } from "../../tools/importers/diff.js";
import { MAX_BODY_CHARS, renderPullRequestBody } from "../../tools/importers/pr-body.js";
import type { DraftRegistry } from "../../tools/importers/types.js";

const run = promisify(execFile);
const snapshotPath = resolve("tests/importers/snapshots/pr-body.md");

function rule(id: string, extra: Record<string, unknown> = {}, importer?: string): RegistryV2Rule {
  return {
    id,
    ecosystem: "nodejs",
    purl: "pkg:generic/nodejs",
    vers: "vers:semver/>=18.0.0|<19.0.0",
    event: "end-of-life",
    title: "Node.js 18 is end-of-life",
    summary: "Node.js 18 no longer receives security or bug fixes.",
    severity: "high",
    deadline: "2025-04-30",
    sources: [{ title: "Node.js release schedule", url: "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json" }],
    provenance: { observedAt: "2026-10-01", reviewedAt: "2026-10-02", reviewer: "maintainer", ...(importer ? { importer } : {}) },
    ...extra,
  } as RegistryV2Rule;
}

function scenario(): { drafts: DraftRegistry; registry: RegistryV2 } {
  const registry: RegistryV2 = {
    schemaVersion: "evergreen.registry.v2",
    ecosystem: "nodejs",
    rules: [
      rule("nodejs.runtime.eol-18", {}, "node-schedule"),
      rule("nodejs.runtime.eol-16", { vers: "vers:semver/>=16.0.0|<17.0.0", deadline: "2023-09-11" }, "node-schedule"),
      rule("nodejs.runtime.eol-14", { vers: "vers:semver/>=14.0.0|<15.0.0", deadline: "2023-04-30", sources: [{ title: "Old | page", url: "https://example.com/old" }] }, "node-schedule"),
      rule("nodejs.runtime.eol-20", { vers: "vers:semver/>=20.0.0|<21.0.0", deadline: "2026-04-30" }, "node-schedule"),
      rule("nodejs.runtime.legacy"),
    ],
  };
  const rules = [
    rule("nodejs.runtime.eol-18", { deadline: "2025-05-15", severity: "critical", summary: "Reworded by upstream." }),
    rule("nodejs.runtime.eol-16", { vers: "vers:semver/>=16.0.0|<17.0.0", deadline: "2023-09-11", sources: [{ title: "Node.js release schedule", url: "https://raw.githubusercontent.com/nodejs/Release/main/schedule.json" }, { title: "Node.js EOL list", url: "https://nodejs.org/en/about/eol" }] }),
    rule("nodejs.runtime.eol-20", { vers: "vers:semver/>=20.0.0|<22.0.0", deadline: "2026-04-30" }),
    rule("nodejs.runtime.eol-24", { vers: "vers:semver/>=24.0.0|<25.0.0", deadline: "2028-04-30", event: "end-of-life" }),
  ].map((draft) => ({ ...draft, provenance: { observedAt: "2026-10-15", reviewedAt: "2026-10-15", reviewer: "pending-review", importer: "node-schedule" } }) as RegistryV2Rule);
  return { registry, drafts: { importer: "node-schedule", ecosystem: "nodejs", observedAt: "2026-10-15", rules, notes: ["Skipped v25: no end date has been published yet."] } };
}

test("the pull-request body matches its snapshot", async () => {
  const { drafts, registry } = scenario();
  const body = renderPullRequestBody(diffDrafts(drafts, registry), drafts);
  if (process.env.UPDATE_SNAPSHOTS) await writeFile(snapshotPath, body);
  assert.equal(body, await readFile(snapshotPath, "utf8"));
});

test("the evidence table has one row per added, changed, or removed rule, with the source beside it", () => {
  const { drafts, registry } = scenario();
  const body = renderPullRequestBody(diffDrafts(drafts, registry), drafts);
  const rows = body.split("\n").filter((line) => line.startsWith("| `"));
  assert.equal(rows.length, 5);
  // Every row has exactly five cells: pipes inside values must be escaped.
  for (const row of rows) assert.equal(row.replace(/\\\|/g, "").split("|").length, 7, row);
  assert.match(rows[0]!, /^\| `nodejs\.runtime\.eol-24` \| added: end-of-life, `pkg:generic\/nodejs` `vers:semver\/>=24\.0\.0\\\|<25\.0\.0` \| 2028-04-30 \| \[Node\.js release schedule\]\(https:\/\/raw\.githubusercontent\.com\/nodejs\/Release\/main\/schedule\.json\) \| 2026-10-15 \|$/);
  assert.match(rows[1]!, /^\| `nodejs\.runtime\.eol-16` \| source added: nodejs\.org \|/);
  assert.match(rows[2]!, /^\| `nodejs\.runtime\.eol-18` \| deadline: 2025-04-30 → 2025-05-15<br>summary changed<br>severity: high → critical \|/);
  assert.match(rows[3]!, /^\| `nodejs\.runtime\.eol-20` \| vers: `vers:semver\/>=20\.0\.0\\\|<21\.0\.0` → `vers:semver\/>=20\.0\.0\\\|<22\.0\.0` \|/);
  assert.match(rows[4]!, /no longer drafted by this importer.*Old \\\| page.*2026-10-01/);
  assert.ok(body.includes("- Skipped v25: no end date has been published yet."));
  assert.match(body, /\*\*drafts\*\*/);
  assert.match(body, /`pending-review` must not be merged/);
});

test("a draft that duplicates an existing rule says which one", () => {
  const { drafts, registry } = scenario();
  const duplicate = { ...registry.rules.find((candidate) => candidate.id === "nodejs.runtime.eol-18")!, id: "nodejs.runtime.eol-18-renamed" };
  const withDuplicate: DraftRegistry = { ...drafts, rules: [...drafts.rules, { ...duplicate, provenance: { observedAt: "2026-10-15", reviewedAt: "2026-10-15", reviewer: "pending-review", importer: "node-schedule" } }] };
  const body = renderPullRequestBody(diffDrafts(withDuplicate, registry), withDuplicate);
  assert.match(body, /`nodejs\.runtime\.eol-18-renamed` \| added: .*<br>\*\*same component and versions as existing rule\*\* `nodejs\.runtime\.eol-18`: keep one id/);
});

test("an empty diff says so instead of printing an empty table", () => {
  const { drafts, registry } = scenario();
  const same: DraftRegistry = { ...drafts, rules: [], notes: [] };
  const body = renderPullRequestBody(diffDrafts(same, { ...registry, rules: registry.rules.filter((candidate) => candidate.id === "nodejs.runtime.legacy") }), same);
  assert.match(body, /0 added, 0 changed, 0 removed, 0 unchanged/);
  assert.match(body, /No rules were added, changed, or removed\./);
  assert.doesNotMatch(body, /\| Rule \|/);
});

test("a large diff stays under GitHub's limit and says how many rows it left out", () => {
  const rules = Array.from({ length: 800 }, (_, index) => rule(`nodejs.runtime.generated-${String(index).padStart(4, "0")}`, {
    sources: [{ title: "A long source title that takes up space in the table row", url: `https://example.com/${"path/".repeat(10)}${index}` }],
  }));
  const drafts: DraftRegistry = { importer: "node-schedule", ecosystem: "nodejs", observedAt: "2026-10-15", rules, notes: [] };
  const body = renderPullRequestBody(diffDrafts(drafts, { schemaVersion: "evergreen.registry.v2", ecosystem: "nodejs", rules: [] }), drafts);
  assert.ok(body.length <= MAX_BODY_CHARS, `body is ${body.length} characters`);
  assert.match(body, /… and \d+ more rows?; run the commands below/);
  assert.match(body, /## Review checklist/);
});

test("the command line writes the same body", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-pr-body-"));
  try {
    const { drafts, registry } = scenario();
    const draftsFile = join(directory, "drafts.json");
    const registryFile = join(directory, "nodejs.json");
    const outFile = join(directory, "body.md");
    await writeFile(draftsFile, JSON.stringify(drafts));
    await writeFile(registryFile, JSON.stringify(registry));
    const script = resolve("dist/tools/importers/pr-body.js");

    await run(process.execPath, [script, draftsFile, registryFile, "--out", outFile]);
    assert.equal(await readFile(outFile, "utf8"), await readFile(snapshotPath, "utf8"));
    assert.equal((await run(process.execPath, [script, draftsFile, registryFile])).stdout, await readFile(snapshotPath, "utf8"));
    await assert.rejects(run(process.execPath, [script, draftsFile]), /Usage: pr-body/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
