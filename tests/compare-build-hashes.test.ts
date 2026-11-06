import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const SCRIPT = resolve("tools/compare-build-hashes.mjs");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

interface RecordFile {
  name: string;
  body: unknown;
}

async function compare(records: readonly RecordFile[]) {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-hashes-"));
  try {
    for (const record of records) {
      await writeFile(join(directory, record.name), JSON.stringify(record.body), "utf8");
    }
    return spawnSync(process.execPath, [SCRIPT, directory], { encoding: "utf8" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("matching records from different runners pass and name the shared hash", async () => {
  const result = await compare([
    { name: "linux.json", body: { label: "Linux", sha256: HASH_A, tarball: "evergreen-deprecation-0.0.0.tgz" } },
    { name: "windows.json", body: { label: "Windows", sha256: HASH_A, tarball: "evergreen-deprecation-0.0.0.tgz" } },
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /2 builds \(Linux, Windows\) pack to byte-identical tarballs/);
  assert.match(result.stdout, new RegExp(HASH_A));
});

test("a hash from another runner that differs fails with every record named", async () => {
  const result = await compare([
    { name: "linux.json", body: { label: "Linux", sha256: HASH_A, tarball: "linux.tgz" } },
    { name: "macos.json", body: { label: "macOS", sha256: HASH_B, tarball: "macos.tgz" } },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /the builds are not reproducible/);
  assert.match(result.stderr, new RegExp(`Linux: sha256 ${HASH_A}`));
  assert.match(result.stderr, new RegExp(`macOS: sha256 ${HASH_B}`));
});

test("one record fails instead of passing a comparison that never happened", async () => {
  const result = await compare([{ name: "linux.json", body: { label: "Linux", sha256: HASH_A } }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs at least two records; found 1/);
});

test("a record without a valid hash fails instead of being skipped", async () => {
  const result = await compare([
    { name: "linux.json", body: { label: "Linux", sha256: HASH_A } },
    { name: "windows.json", body: { label: "Windows", sha256: "not-a-hash" } },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /windows\.json has no sha256/);
});

test("no directory is a usage error", () => {
  const result = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: node tools\/compare-build-hashes\.mjs/);
});
