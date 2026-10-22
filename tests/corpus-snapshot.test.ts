import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { CORPUS_PATH, SNAPSHOT_PATH, snapshotDrops, snapshotFrom } from "../benchmarks/corpus-snapshot.js";
import type { CorpusSnapshot } from "../benchmarks/corpus-snapshot.js";

const corpus = {
  repositories: [
    { repository: "a/one", expected: [{ ruleId: "npm.package.request.deprecated" }, { ruleId: "nodejs.runtime.eol-18" }] },
    { repository: "b/two", expected: [{ ruleId: "npm.package.left-pad.deprecated" }] },
  ],
};

test("expected findings are counted per detector by the first segment of the rule id", () => {
  assert.deepEqual(snapshotFrom(corpus).detectors, {
    nodejs: { findings: 1, repositories: 1 },
    npm: { findings: 2, repositories: 2 },
  });
});

test("losing an expected finding is a drop, and growth is not", () => {
  const committed = snapshotFrom(corpus);
  const lost = { repositories: [{ repository: "a/one", expected: [{ ruleId: "npm.package.request.deprecated" }] }, corpus.repositories[1]!] };
  assert.deepEqual(snapshotDrops(snapshotFrom(lost), committed), [
    "nodejs: the corpus expects 0 findings, the snapshot records 1",
  ]);
  const grown = { repositories: [...corpus.repositories, { repository: "c/three", expected: [{ ruleId: "npm.package.x.deprecated" }] }] };
  assert.deepEqual(snapshotDrops(snapshotFrom(grown), committed), []);
});

test("the committed corpus has not lost any finding the snapshot records", async () => {
  const current = snapshotFrom(JSON.parse(await readFile(resolve(CORPUS_PATH), "utf8")));
  const committed = JSON.parse(await readFile(resolve(SNAPSHOT_PATH), "utf8")) as CorpusSnapshot;
  assert.equal(committed.schemaVersion, "evergreen.corpus-snapshot.v1");
  assert.deepEqual(snapshotDrops(current, committed), []);
});
