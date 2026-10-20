import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parseCorpusFilter, selectCorpusEntries } from "../benchmarks/corpus-filter.js";
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
