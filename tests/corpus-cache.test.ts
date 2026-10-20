import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  assertSafeCacheDir,
  corpusCacheKey,
  describeMissingEntries,
  ensureCorpusCacheEntry,
  isCorpusEntryCached,
  listCorpusCache,
  missingCorpusEntries,
  planPrune,
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

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);
const commitC = "c".repeat(40);

async function seed(dir: string, name: string, bytes: number, ageSeconds: number): Promise<void> {
  await mkdir(join(dir, name), { recursive: true });
  await writeFile(join(dir, name, "file"), "x".repeat(bytes));
  const when = new Date(Date.now() - ageSeconds * 1000);
  await utimes(join(dir, name), when, when);
}

test("listCorpusCache and status inputs match the files on disk and ignore foreign names", async () => {
  await withCache(async (dir) => {
    await seed(dir, `o__old@${commitA}`, 100, 300);
    await seed(dir, `o__new@${commitB}`, 200, 100);
    await mkdir(join(dir, "not-a-cache-entry"));
    await writeFile(join(dir, "notes.txt"), "keep");
    const listings = await listCorpusCache(dir);
    assert.deepEqual(listings.map((entry) => [entry.name, entry.bytes]), [[`o__old@${commitA}`, 100], [`o__new@${commitB}`, 200]]);
    assert.deepEqual(await listCorpusCache(join(dir, "missing")), []);
  });
});

test("prune plans: stale only, least recently used to fit a size, or everything", async () => {
  await withCache(async (dir) => {
    await seed(dir, `o__a@${commitA}`, 1_000_000, 300);
    await seed(dir, `o__b@${commitB}`, 1_000_000, 200);
    await seed(dir, `o__c@${commitC}`, 1_000_000, 100);
    const listings = await listCorpusCache(dir);
    const current = new Set([`o__b@${commitB}`, `o__c@${commitC}`]);
    assert.deepEqual(planPrune(listings, current, {}).map((entry) => entry.name), [`o__a@${commitA}`]);
    assert.deepEqual(planPrune(listings, current, { maxSizeMb: 2 }).map((entry) => entry.name), [`o__a@${commitA}`]);
    assert.deepEqual(planPrune(listings, current, { maxSizeMb: 1 }).map((entry) => entry.name), [`o__a@${commitA}`, `o__b@${commitB}`]);
    assert.equal(planPrune(listings, current, { all: true }).length, 3);
    assert.throws(() => planPrune(listings, current, { all: true, maxSizeMb: 1 }), /either --all or --max-size/);
  });
});

test("a cache hit refreshes the entry's last-used time", async () => {
  await withCache(async (dir) => {
    await seed(dir, `owner__repo@${entry.commit}`, 10, 1000);
    const before = (await listCorpusCache(dir))[0]!.lastUsedMs;
    await ensureCorpusCacheEntry(dir, entry, async () => {});
    assert.ok((await listCorpusCache(dir))[0]!.lastUsedMs > before + 500_000);
  });
});

test("empty and root-like cache paths are refused", () => {
  for (const bad of ["", "  ", "/", "/Users", homedir()]) {
    assert.throws(() => assertSafeCacheDir(bad), /Refusing to use/, bad);
  }
  assert.equal(assertSafeCacheDir("/var/cache/evergreen-corpus"), resolve("/var/cache/evergreen-corpus"));
});

test("missingCorpusEntries and the offline message name every missing repository@commit", async () => {
  await withCache(async (dir) => {
    const present = { repository: "o/present", commit: commitA };
    const absentOne = { repository: "o/absent", commit: commitB };
    const absentTwo = { repository: "p/gone", commit: commitC };
    await seed(dir, corpusCacheKey(present), 5, 10);
    const missing = await missingCorpusEntries(dir, [present, absentOne, absentTwo]);
    assert.deepEqual(missing, [absentOne, absentTwo]);
    const message = describeMissingEntries(missing);
    assert.match(message, /2 corpus entries are not in the cache/);
    assert.ok(message.includes(`o/absent@${commitB}`) && message.includes(`p/gone@${commitC}`));
    assert.deepEqual(await missingCorpusEntries(dir, [present]), []);
  });
});

test("an entry the caller rejects is removed and fetched again", async () => {
  await withCache(async (dir) => {
    await seed(dir, `owner__repo@${entry.commit}`, 10, 10);
    let populated = 0;
    const result = await ensureCorpusCacheEntry(
      dir,
      entry,
      async (target) => {
        populated++;
        await writeFile(join(target, "fresh"), "x");
      },
      async () => false,
    );
    assert.equal(result.cached, false);
    assert.equal(populated, 1);
    assert.deepEqual(await readdir(result.path), ["fresh"]);
    const missing = await missingCorpusEntries(dir, [entry], async () => false);
    assert.equal(missing.length, 1, "an unusable entry counts as missing for an offline run");
  });
});
