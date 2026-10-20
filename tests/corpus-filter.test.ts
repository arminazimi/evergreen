import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseCorpusFilter, readFailedRepositories, selectCorpusEntries } from "../benchmarks/corpus-filter.js";
import type { CorpusRepositoryEntry } from "../benchmarks/corpus-harness.js";

const entries: CorpusRepositoryEntry[] = [
  { repository: "a/one", commit: "1".repeat(40), ecosystem: "php", expected: [] },
  { repository: "b/two", commit: "2".repeat(40), ecosystem: "node", expected: [] },
  { repository: "c/three", commit: "3".repeat(40), ecosystem: "php", expected: [] },
  { repository: "d/four", commit: "4".repeat(40), ecosystem: "go", expected: [] },
];

test("flags are repeatable and accept both spellings", () => {
  assert.deepEqual(
    parseCorpusFilter(["node", "x", "--ecosystem", "php", "--ecosystem=go", "--repo", "b/two"]),
    { ecosystems: ["php", "go"], repositories: ["b/two"] },
  );
  assert.throws(() => parseCorpusFilter(["--ecosystem"]), /needs a value/);
});

test("no filter selects the whole corpus as a full run", () => {
  const selection = selectCorpusEntries(entries, { ecosystems: [], repositories: [] });
  assert.equal(selection.full, true);
  assert.equal(selection.entries.length, 4);
  assert.equal(selection.description, undefined);
});

test("an ecosystem filter selects only its entries, in corpus order, and is labeled", () => {
  const selection = selectCorpusEntries(entries, { ecosystems: ["php"], repositories: [] });
  assert.deepEqual(selection.entries.map((entry) => entry.repository), ["a/one", "c/three"]);
  assert.equal(selection.full, false);
  assert.match(selection.description ?? "", /not a full run/);
});

test("ecosystems and repositories combine as a union", () => {
  const selection = selectCorpusEntries(entries, { ecosystems: ["go"], repositories: ["B/Two"] });
  assert.deepEqual(selection.entries.map((entry) => entry.repository), ["b/two", "d/four"]);
});

test("an unknown name is an error that lists the valid ones", () => {
  assert.throws(
    () => selectCorpusEntries(entries, { ecosystems: ["perl"], repositories: [] }),
    /Unknown ecosystem "perl"\. Valid ecosystems: go, node, php\./,
  );
  assert.throws(
    () => selectCorpusEntries(entries, { ecosystems: [], repositories: ["x/y"] }),
    /Unknown repository "x\/y"[\s\S]*a\/one/,
  );
});

test("--ecosystem php selects exactly the PHP entries of the real corpus", async () => {
  const corpus = JSON.parse(await readFile("benchmarks/public-repositories.json", "utf8")) as { repositories: CorpusRepositoryEntry[] };
  const selection = selectCorpusEntries(corpus.repositories, { ecosystems: ["php"], repositories: [] });
  assert.ok(selection.entries.length > 0);
  assert.ok(selection.entries.every((entry) => entry.ecosystem === "php"));
  assert.equal(selection.entries.length, corpus.repositories.filter((entry) => entry.ecosystem === "php").length);
});

test("--failed-from reads only the repositories with a mismatch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-failed-"));
  try {
    const report = join(dir, "report.json");
    await writeFile(report, JSON.stringify({
      repositories: [
        { repository: "a/one", unexpected: [], missing: [] },
        { repository: "b/two", unexpected: ["npm.x:package.json:1"], missing: [] },
        { repository: "d/four", unexpected: [], missing: ["go.y:go.mod:2"] },
        { repository: "gone/repo", unexpected: ["z"], missing: [] },
      ],
    }));
    assert.deepEqual(parseCorpusFilter(["--failed-from", report]), { ecosystems: [], repositories: [], failedFrom: report });
    const failed = await readFailedRepositories(report);
    assert.deepEqual(failed, ["b/two", "d/four", "gone/repo"]);
    const selection = selectCorpusEntries(entries, { ecosystems: [], repositories: [], failedFrom: report }, failed);
    assert.deepEqual(selection.entries.map((entry) => entry.repository), ["b/two", "d/four"]);
    assert.equal(selection.full, false);
    assert.match(selection.description ?? "", /mismatches in .*report\.json.*not a full run/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a report without mismatches selects nothing and is still labeled filtered", async () => {
  const selection = selectCorpusEntries(entries, { ecosystems: [], repositories: [], failedFrom: "r.json" }, []);
  assert.deepEqual(selection.entries, []);
  assert.equal(selection.full, false);
});

test("a file that is not a corpus report is an error", async () => {
  await assert.rejects(readFailedRepositories("does-not-exist.json"), /Cannot read the report/);
  const dir = await mkdtemp(join(tmpdir(), "evergreen-failed-"));
  try {
    await writeFile(join(dir, "x.json"), "{}");
    await assert.rejects(readFailedRepositories(join(dir, "x.json")), /not a corpus report/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
