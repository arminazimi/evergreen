import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { ecosystems } from "../benchmarks/candidates/profiles.js";
import {
  CORPUS_TARGET,
  TARGETS_PATH,
  TARGETS_SCHEMA_VERSION,
  corpusCounts,
  targetDrops,
  targetsFromCounts,
  validateTargets,
} from "../benchmarks/corpus-targets.js";
import type { CorpusTargets } from "../benchmarks/corpus-targets.js";
import { loadPublicCorpus } from "../benchmarks/public-corpus.js";

const corpus = {
  repositories: [{ ecosystem: "node" }, { ecosystem: "node" }, { ecosystem: "python" }, { ecosystem: "deno" }],
};

test("every bucket is counted, including the ones with no entry yet", () => {
  const counts = corpusCounts(corpus);
  assert.deepEqual(Object.keys(counts), [...ecosystems]);
  assert.equal(counts.node, 2);
  assert.equal(counts.python, 1);
  assert.equal(counts.deno, 1);
  assert.equal(counts.elixir, 0);
  assert.equal(counts.scala, 0);
});

test("an entry filed under a bucket that does not exist is an error", () => {
  assert.throws(
    () => corpusCounts({ repositories: [{ ecosystem: "cobol" }] }),
    /"cobol", which is not a corpus bucket/,
  );
});

test("losing a repository is a drop, and growth is not", () => {
  const targets = targetsFromCounts(corpusCounts(corpus));
  assert.deepEqual(targetDrops(corpusCounts(corpus), targets), []);

  const lost = { repositories: corpus.repositories.slice(1) };
  assert.deepEqual(targetDrops(corpusCounts(lost), targets), ["node: 1 repositories, below the minimum of 2"]);

  const grown = { repositories: [...corpus.repositories, { ecosystem: "python" }] };
  assert.deepEqual(targetDrops(corpusCounts(grown), targets), []);
});

test("a targets file names every bucket once and never asks for more than the goal", () => {
  const targets = targetsFromCounts(corpusCounts(corpus));
  assert.equal(targets.schemaVersion, TARGETS_SCHEMA_VERSION);
  assert.equal(targets.target, CORPUS_TARGET);
  validateTargets(targets);

  const missing = { ...targets, minimum: { ...targets.minimum } };
  delete missing.minimum.scala;
  assert.throws(() => validateTargets(missing), /has no minimum for "scala"/);

  const unknown = { ...targets, minimum: { ...targets.minimum, cobol: 0 } };
  assert.throws(() => validateTargets(unknown), /"cobol", which is not a corpus bucket/);

  const negative = { ...targets, minimum: { ...targets.minimum, node: -1 } };
  assert.throws(() => validateTargets(negative), /whole-number minimum for "node"/);

  const wrongSchema = JSON.parse(
    JSON.stringify(targets).replace(TARGETS_SCHEMA_VERSION, "evergreen.corpus-targets.v0"),
  ) as CorpusTargets;
  assert.throws(() => validateTargets(wrongSchema), /schemaVersion/);
});

test("the committed corpus has not fallen below any recorded minimum", async () => {
  const current = corpusCounts(await loadPublicCorpus());
  const committed = JSON.parse(await readFile(resolve(TARGETS_PATH), "utf8")) as CorpusTargets;
  assert.equal(committed.schemaVersion, TARGETS_SCHEMA_VERSION);
  assert.equal(committed.target, CORPUS_TARGET);
  validateTargets(committed);
  assert.deepEqual(targetDrops(current, committed), []);
});
