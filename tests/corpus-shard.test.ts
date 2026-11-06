import assert from "node:assert/strict";
import { test } from "node:test";

import { describeShard, parseShard, shardCoversEverything, shardEntries } from "../benchmarks/corpus-shard.js";

test("--shard reads <index>/<count> in both spellings", () => {
  assert.deepEqual(parseShard(["node", "script"]), undefined);
  assert.deepEqual(parseShard(["node", "script", "--shard", "2/4"]), { index: 2, count: 4 });
  assert.deepEqual(parseShard(["node", "script", "--shard=3/8"]), { index: 3, count: 8 });
});

test("a malformed shard is an error, not a silent whole-corpus run", () => {
  assert.throws(() => parseShard(["--shard"]), /needs <index>\/<count>/);
  assert.throws(() => parseShard(["--shard", "--offline"]), /needs <index>\/<count>/);
  assert.throws(() => parseShard(["--shard", "2"]), /use <index>\/<count>/);
  assert.throws(() => parseShard(["--shard", "0/4"]), /Invalid shard/);
  assert.throws(() => parseShard(["--shard", "5/4"]), /at most count/);
  assert.throws(() => parseShard(["--shard", "1/0"]), /Invalid shard/);
  assert.throws(() => parseShard(["--shard", "1.5/4"]), /use <index>\/<count>/);
});

test("every entry lands in exactly one shard, in corpus order", () => {
  const entries = Array.from({ length: 11 }, (_, index) => `entry-${index}`);
  const seen: string[] = [];
  for (let index = 1; index <= 4; index += 1) {
    const shard = shardEntries(entries, { index, count: 4 });
    seen.push(...shard);
    // A shard keeps the corpus order of its entries.
    assert.deepEqual(
      shard,
      [...shard].sort((left, right) => entries.indexOf(left) - entries.indexOf(right)),
    );
  }
  assert.deepEqual(seen.sort(), [...entries].sort());
  assert.deepEqual(shardEntries(entries, { index: 1, count: 4 }), ["entry-0", "entry-4", "entry-8"]);
});

test("only a single shard covers everything; a sharded run is not a full run", () => {
  assert.equal(shardCoversEverything(undefined), true);
  assert.equal(shardCoversEverything({ index: 1, count: 1 }), true);
  assert.equal(shardCoversEverything({ index: 1, count: 2 }), false);
  assert.match(describeShard({ index: 2, count: 8 }, 70, 557), /SHARD 2\/8: 70 of 557 entries/);
});
