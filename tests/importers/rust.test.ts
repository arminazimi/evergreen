import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { validateRegistryV2 } from "../../src/registry.js";
import { versContains } from "../../src/vers/index.js";
import { RUST_CRATE_CANDIDATES } from "../../tools/importers/rust-candidates.js";
import { rustToolchainImporter, RUST_RELEASES_URL } from "../../tools/importers/rust-1.js";
import { CRATES_INDEX_URL, indexPath, rustYankedImporter } from "../../tools/importers/rust-2.js";
import { execute } from "../../tools/importers/run.js";
import type { ImporterContext } from "../../tools/importers/types.js";

const releases = resolve("tests/importers/recordings/rust-1.json");
const yanked = resolve("tests/importers/recordings/rust-2.json");

function inline(bodies: Record<string, string>, now = "2026-10-17"): ImporterContext {
  return {
    now: new Date(`${now}T12:00:00Z`),
    async fetchText(url) {
      const body = bodies[url];
      if (body === undefined) throw new Error(`unexpected ${url}`);
      return body;
    },
  };
}

test("rust-1 drafts the unsupported-toolchain rule from the newest stable release, offline", async () => {
  const drafts = await execute(rustToolchainImporter, { replay: releases });
  assert.equal(drafts.rules.length, 1);
  const [rule] = drafts.rules;
  assert.equal(rule!.id, "rust.toolchain.end-of-support-1.98-and-older");
  assert.equal(rule!.vers, "vers:semver/<1.99.0");
  assert.equal(rule!.deadline, "2026-10-01");
  assert.equal(rule!.event, "end-of-support");
  assert.equal(rule!.provenance.reviewer, "pending-review");
  assert.ok(rule!.sources.some((source) => source.url === "https://www.rust-lang.org/policies/security"));
  assert.deepEqual(drafts.notes, ["Newest stable release: 1.99.1."]);
});

test("the committed toolchain rule matches what the importer drafts from the recording", async () => {
  const [draft] = (await execute(rustToolchainImporter, { replay: releases })).rules;
  const registry = validateRegistryV2(JSON.parse(await readFile("registry/rust.json", "utf8")));
  const committed = registry.rules.find((rule) => rule.id === draft!.id);
  assert.ok(committed, "registry/rust.json has the rule the importer drafts");
  for (const field of ["purl", "vers", "event", "title", "summary", "severity", "replacement", "deadline", "sources"] as const) {
    assert.deepEqual(committed[field], draft![field], field);
  }
});

test("rust-1 follows the calendar: a new minor release moves the rule, and a future-dated heading is ignored", async () => {
  const body = (headings: string[]) => headings.join("\n\nbody\n\n") + "\n";
  const at = (now: string, headings: string[]) => rustToolchainImporter.import(inline({ [RUST_RELEASES_URL]: body(headings) }, now));
  const base = ["Version 1.99.1 (2026-10-15)", "Version 1.99.0 (2026-10-01)", "Version 1.98.1 (2026-09-03)", "Version 1.98.0 (2026-08-20)"];
  assert.equal((await at("2026-10-17", base)).rules[0]!.vers, "vers:semver/<1.99.0");
  const next = await at("2026-11-13", ["Version 1.100.0 (2026-11-12)", ...base]);
  assert.equal(next.rules[0]!.vers, "vers:semver/<1.100.0");
  assert.equal(next.rules[0]!.deadline, "2026-11-12");
  const early = await at("2026-10-17", ["Version 1.100.0 (2026-11-12)", ...base]);
  assert.equal(early.rules[0]!.vers, "vers:semver/<1.99.0", "1.100 has not shipped yet");
  assert.match(early.notes.join("\n"), /Ignored 1 release heading dated after 2026-10-17\./);
});

test("rust-1 drafts nothing when the history is unusable, and a failed request stops the run", async () => {
  assert.deepEqual((await rustToolchainImporter.import(inline({ [RUST_RELEASES_URL]: "nothing useful here" }))).rules, []);
  await assert.rejects(rustToolchainImporter.import({ now: new Date(), async fetchText() { throw new Error("HTTP 503"); } }), /HTTP 503/);
});

test("rust-2 drafts one yanked-versions rule per crate that has any, from the recording", async () => {
  const drafts = await execute(rustYankedImporter, { replay: yanked });
  assert.deepEqual(drafts.rules.map((rule) => rule.id), ["rust.crate.bytes.yanked", "rust.crate.memchr.yanked", "rust.crate.once-cell.yanked", "rust.crate.smallvec.yanked", "rust.crate.tempfile.yanked", "rust.crate.tower.yanked"]);
  const bytes = drafts.rules.find((rule) => rule.purl === "pkg:cargo/bytes")!;
  assert.equal(bytes.event, "removed");
  assert.equal(bytes.vers, "vers:cargo/0.5.0|0.5.1|0.5.2|1.6.0");
  assert.ok(versContains(bytes.vers, "1.6.0") && !versContains(bytes.vers, "1.6.1"), "exactly the yanked versions");
  assert.ok(drafts.rules.every((rule) => rule.provenance.importer === "rust-2" && rule.sources[0]!.url.startsWith("https://crates.io/crates/")));
  assert.equal(drafts.rules.find((rule) => rule.purl === "pkg:cargo/once_cell")!.id, "rust.crate.once-cell.yanked", "underscores become hyphens in ids, not in the purl");
});

test("rust-2 builds index paths, orders pre-releases, and says why it drafts nothing for a crate", async () => {
  assert.deepEqual(["a", "ab", "abc", "serde", "Tokio"].map(indexPath), ["1/a", "2/ab", "3/a/abc", "se/rd/serde", "to/ki/tokio"]);
  const line = (vers: string, yankedFlag: boolean) => JSON.stringify({ name: "demo", vers, yanked: yankedFlag });
  const run = (lines: string[]) => {
    const original = RUST_CRATE_CANDIDATES.slice();
    return rustYankedImporter.import({
      now: new Date("2026-10-17T00:00:00Z"),
      async fetchText(url) {
        if (url.endsWith("/bytes")) return lines.join("\n");
        return original.includes(url.split("/").pop()!) ? "" : "";
      },
    });
  };
  const output = await run([line("1.0.0", false), "not json", line("2.0.0-beta.1", true), line("2.0.0", true), line("0.9.0", true)].map((text) => text.replace('"demo"', '"bytes"')));
  const bytes = output.rules.find((rule) => rule.purl === "pkg:cargo/bytes")!;
  assert.equal(bytes.vers, "vers:cargo/0.9.0|2.0.0-beta.1|2.0.0", "ascending, a pre-release before its release; the malformed line is skipped");
  assert.match(output.notes.join("\n"), /memchr: the index has no versions for it/);
  const clean = await run([line("1.0.0", false)].map((text) => text.replace('"demo"', '"bytes"')));
  assert.match(clean.notes.join("\n"), /bytes: none of its 1 versions is yanked/);
});

test("rust-2 reads the sparse index, not the crates.io API", () => {
  assert.equal(CRATES_INDEX_URL, "https://index.crates.io");
});
