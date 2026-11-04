import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  DEFAULT_TEST_FILE_DURATION_MS,
  TEST_FILE_TIMINGS_SCHEMA_VERSION,
  assignFilesByTime,
  mergeLcovReports,
  parseShardEnv,
  parseTestFileTimings,
  selectShardFiles,
  shardLoadsWithinTolerance,
} from "../tools/run-tests-sharding.js";

test("parseShardEnv requires both index and count", () => {
  assert.equal(parseShardEnv({}), undefined);
  assert.deepEqual(parseShardEnv({ EVERGREEN_TEST_SHARD: "1", EVERGREEN_TEST_SHARD_COUNT: "2" }), {
    index: 1,
    count: 2,
  });
  assert.throws(() => parseShardEnv({ EVERGREEN_TEST_SHARD: "0" }), /together/);
  assert.throws(() => parseShardEnv({ EVERGREEN_TEST_SHARD: "2", EVERGREEN_TEST_SHARD_COUNT: "2" }), /out of range/);
});

test("assignFilesByTime balances by measured duration, not by file count", () => {
  const files = ["a.test.js", "b.test.js", "c.test.js", "d.test.js"];
  const ms: Record<string, number> = {
    "a.test.js": 100,
    "b.test.js": 90,
    "c.test.js": 10,
    "d.test.js": 10,
  };
  const { shards, loadsMs } = assignFilesByTime(files, (file) => ms[file]!, 2);
  // The two long files land on opposite shards; the short pair fills the gap.
  assert.equal(shards[0]!.includes("a.test.js"), true);
  assert.equal(shards[1]!.includes("b.test.js"), true);
  assert.ok(Math.abs(loadsMs[0]! - loadsMs[1]!) <= 10);
  assert.ok(shardLoadsWithinTolerance(loadsMs, 0.2));
  // Equal file counts here would also happen with round-robin; the load check is what proves time balance.
  assert.deepEqual(loadsMs, [110, 100]);
});

test("selectShardFiles returns one shard and reports all loads", () => {
  const files = ["slow.test.js", "fast.test.js"];
  const assignment = selectShardFiles(files, (file) => (file.startsWith("slow") ? 5_000 : 100), 0, 2);
  assert.equal(assignment.shardIndex, 0);
  assert.equal(assignment.shardCount, 2);
  assert.equal(assignment.files.length, 1);
  assert.equal(assignment.loadsMs.length, 2);
  assert.ok(assignment.loadMs > 0);
});

test("the committed timings file is valid and shards within 20%", async () => {
  const text = await readFile(resolve("benchmarks/test-file-timings.json"), "utf8");
  const timings = parseTestFileTimings(text);
  assert.equal(timings.schemaVersion, TEST_FILE_TIMINGS_SCHEMA_VERSION);
  const files = Object.keys(timings.durations);
  assert.ok(files.length > 100);
  const { loadsMs } = assignFilesByTime(files, (file) => timings.durations[file] ?? DEFAULT_TEST_FILE_DURATION_MS, 2);
  assert.ok(shardLoadsWithinTolerance(loadsMs, 0.2), `shard loads ${loadsMs.join(", ")} must stay within 20%`);
});

test("mergeLcovReports sums hit counts for the same source file", () => {
  const left = `SF:dist/src/a.js
DA:1,1
DA:2,0
LF:2
LH:1
end_of_record
`;
  const right = `SF:dist/src/a.js
DA:1,0
DA:2,3
LF:2
LH:1
end_of_record
SF:dist/src/b.js
DA:1,1
LF:1
LH:1
end_of_record
`;
  const merged = mergeLcovReports([left, right]);
  assert.match(merged, /SF:dist\/src\/a\.js/);
  assert.match(merged, /DA:1,1/);
  assert.match(merged, /DA:2,3/);
  assert.match(merged, /SF:dist\/src\/b\.js/);
  assert.match(merged, /LH:2/);
});

test("mergeLcovReports unions branches of the same file across shards", () => {
  // Shard A took branch 0 only; shard B took branch 1 only. Block ids differ the way V8
  // renumbers them per process — matching must ignore block and still count each branch once.
  const shardA = `SF:dist/src/branches.js
BRDA:10,0,0,3
BRDA:10,0,1,-
BRF:2
BRH:1
end_of_record
`;
  const shardB = `SF:dist/src/branches.js
BRDA:10,7,0,-
BRDA:10,7,1,5
BRF:2
BRH:1
end_of_record
`;
  const merged = mergeLcovReports([shardA, shardB]);
  const brda = [...merged.matchAll(/^BRDA:10,(\d+),(\d+),(.+)$/gm)].map((match) => ({
    block: match[1],
    branch: match[2],
    hits: match[3],
  }));
  assert.equal(brda.length, 2, "union must keep two branches, not four");
  assert.equal(brda[0]?.branch, "0");
  assert.equal(brda[1]?.branch, "1");
  assert.notEqual(brda[0]?.hits, "-");
  assert.notEqual(brda[1]?.hits, "-");
  assert.match(merged, /^BRF:2$/m);
  assert.match(merged, /^BRH:2$/m);
});

test("run-tests.mjs re-exports the sharding helpers", async () => {
  const exported = await import(pathToFileURL(resolve("tools/run-tests.mjs")).href);
  assert.equal(typeof exported.parseShardEnv, "function");
  assert.equal(typeof exported.mergeLcovReports, "function");
  assert.equal(typeof exported.selectShardFiles, "function");
  assert.equal(typeof exported.shardLoadsWithinTolerance, "function");
});
