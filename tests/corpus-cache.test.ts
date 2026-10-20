import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  corpusCacheKey,
  ensureCorpusCacheEntry,
  isCorpusEntryCached,
  resolveCorpusCacheDir,
} from "../benchmarks/corpus-cache.js";

const entry = { repository: "owner/repo", commit: "a".repeat(40) };

async function withCache(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "evergreen-cache-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the cache key joins owner, repository, and commit", () => {
  assert.equal(corpusCacheKey(entry), `owner__repo@${"a".repeat(40)}`);
});

test("an unset or blank cache variable means no cache", () => {
  assert.equal(resolveCorpusCacheDir({}), undefined);
  assert.equal(resolveCorpusCacheDir({ EVERGREEN_CORPUS_CACHE: "  " }), undefined);
  assert.equal(resolveCorpusCacheDir({ EVERGREEN_CORPUS_CACHE: "/x/cache" }), "/x/cache");
});

test("a miss populates the entry without .git and a hit skips populate", async () => {
  await withCache(async (dir) => {
    let calls = 0;
    const populate = async (target: string) => {
      calls++;
      await mkdir(join(target, ".git"));
      await writeFile(join(target, ".git", "HEAD"), "ref");
      await writeFile(join(target, "package.json"), "{}");
    };
    const first = await ensureCorpusCacheEntry(dir, entry, populate);
    assert.equal(first.cached, false);
    assert.equal(await readFile(join(first.path, "package.json"), "utf8"), "{}");
    assert.deepEqual((await readdir(first.path)).sort(), ["package.json"]);
    assert.deepEqual(await readdir(dir), [corpusCacheKey(entry)]);
    assert.equal(await isCorpusEntryCached(dir, entry), true);

    const second = await ensureCorpusCacheEntry(dir, entry, populate);
    assert.equal(second.cached, true);
    assert.equal(second.path, first.path);
    assert.equal(calls, 1);
  });
});

test("a failed populate leaves no entry and no staging directory", async () => {
  await withCache(async (dir) => {
    await assert.rejects(
      ensureCorpusCacheEntry(dir, entry, async () => {
        throw new Error("network down");
      }),
      /network down/,
    );
    assert.equal(await isCorpusEntryCached(dir, entry), false);
    assert.deepEqual(await readdir(dir), []);
  });
});
