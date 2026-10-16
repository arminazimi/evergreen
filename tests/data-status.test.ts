import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";
import { Ajv2020 } from "ajv/dist/2020.js";

import { dataStatusFrom, renderDataStatusText, STALE_AFTER_DAYS } from "../src/data-status.js";
import type { ActiveData, DataSourceInfo } from "../src/data-source.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const validator = new Ajv2020({ allErrors: true }).compile(JSON.parse(await readFile(resolve("schemas/data-status.v1.schema.json"), "utf8")) as object);

const data = (info: Partial<DataSourceInfo>): ActiveData => ({
  info: { source: "bundled", version: "0.1.0", createdAt: null, contentDigest: null, reviewedThrough: "2026-10-16", signer: null, warnings: [], ...info },
  read: async () => ({}),
});
const at = (day: string) => new Date(`${day}T12:00:00Z`);

test("bundled data is aged from its newest review date", () => {
  const status = dataStatusFrom(data({}), at("2026-10-26"), "/cache");
  assert.deepEqual([status.source, status.ageBasis, status.ageDays, status.stale, status.createdAt], ["bundled", "reviewedThrough", 10, false, null]);
  assert.equal(validator(status), true, JSON.stringify(validator.errors));
});

test("downloaded data is aged from the time the bundle was built", () => {
  const signer = { identity: "https://github.com/arminazimi/evergreen/.github/workflows/data-release.yml@refs/tags/data-v2026.10.01", issuer: "https://token.actions.githubusercontent.com" };
  const status = dataStatusFrom(
    data({ source: "cache", version: "2026.10.01", createdAt: "2026-10-01T06:00:00Z", contentDigest: `sha256:${"a".repeat(64)}`, signer }),
    at("2026-10-16"),
    "/cache",
  );
  assert.deepEqual([status.source, status.version, status.ageBasis, status.ageDays, status.stale], ["cache", "2026.10.01", "createdAt", 15, false]);
  assert.deepEqual(status.signer, signer);
  assert.equal(validator(status), true, JSON.stringify(validator.errors));
});

test("data becomes stale after 30 days, not before", () => {
  assert.equal(STALE_AFTER_DAYS, 30);
  const info = data({ reviewedThrough: "2026-09-01" });
  assert.equal(dataStatusFrom(info, new Date("2026-10-01T00:00:00Z")).stale, false, "exactly 30 days");
  assert.equal(dataStatusFrom(info, new Date("2026-10-01T23:59:59Z")).ageDays, 30);
  assert.equal(dataStatusFrom(info, new Date("2026-10-02T00:00:00Z")).stale, true, "31 days");
  assert.equal(dataStatusFrom(data({ reviewedThrough: "2099-01-01" }), at("2026-10-16")).ageDays, 0, "a future date is never negative");
});

test("the text output says where the data came from, how old it is, and what went wrong", () => {
  const fresh = renderDataStatusText(dataStatusFrom(data({}), at("2026-10-17"), "/cache"));
  assert.match(fresh, /Source: bundled \(shipped with this Evergreen release\)/);
  assert.match(fresh, /Age: 1 day since the evidence was last reviewed$/m);
  assert.match(fresh, /Cache directory: \/cache/);
  assert.doesNotMatch(fresh, /stale|Update with/);

  const stale = renderDataStatusText(dataStatusFrom(data({ reviewedThrough: "2026-08-01", warnings: ["Ignoring downloaded lifecycle data 2026.09.30: the signature did not verify."] }), at("2026-10-16")));
  assert.match(stale, /76 days since the evidence was last reviewed — older than 30 days, so it is stale/);
  assert.match(stale, /Warning: Ignoring downloaded lifecycle data 2026\.09\.30/);
  assert.match(stale, /Update with: evergreen data update/);

  const downloaded = renderDataStatusText(dataStatusFrom(data({ source: "cache", version: "2026.10.01", createdAt: "2026-10-01T06:00:00Z", contentDigest: `sha256:${"b".repeat(64)}`, signer: { identity: "id", issuer: "iss" } }), at("2026-10-16")));
  assert.match(downloaded, /Source: cache$/m);
  assert.match(downloaded, /Built: 2026-10-01T06:00:00Z/);
  assert.match(downloaded, /Signed by: id\nIssuer: iss/);
  assert.match(downloaded, /Content digest: sha256:b{64}/);
});

async function run(args: string[], cache: string) {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args], { env: { ...process.env, EVERGREEN_DATA_DIR: cache } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

test("evergreen data status prints text and JSON, and reads only the local cache", async () => {
  const cache = await mkdtemp(join(tmpdir(), "evergreen-status-"));
  roots.push(cache);
  const text = await run(["data", "status"], cache);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /Source: bundled/);
  assert.ok(text.stdout.includes(`Cache directory: ${cache}`));

  const json = await run(["data", "status", "--json"], cache);
  const status = JSON.parse(json.stdout) as { source: string; cacheDirectory: string; warnings: string[] };
  assert.equal(validator(status), true, JSON.stringify(validator.errors));
  assert.deepEqual([status.source, status.cacheDirectory, status.warnings], ["bundled", cache, []]);
});

test("a download that does not verify is reported by status, and the bundled data stays active", async () => {
  const cache = await mkdtemp(join(tmpdir(), "evergreen-status-bad-"));
  roots.push(cache);
  await mkdir(join(cache, "data", "2999.01.01"), { recursive: true });
  await writeFile(join(cache, "data", "active.json"), JSON.stringify({ version: "2999.01.01" }));
  await writeFile(join(cache, "data", "2999.01.01", "bundle.json"), "{}\n");
  await writeFile(join(cache, "data", "2999.01.01", "bundle.json.sigstore.json"), "{}");
  const result = await run(["data", "status", "--json"], cache);
  const status = JSON.parse(result.stdout) as { source: string; warnings: string[] };
  assert.equal(status.source, "bundled");
  assert.match(status.warnings[0]!, /Ignoring downloaded lifecycle data 2999\.01\.01/);
});

test("unknown data subcommands are a usage error", async () => {
  const cache = await mkdtemp(join(tmpdir(), "evergreen-status-usage-"));
  roots.push(cache);
  for (const args of [["data"], ["data", "frobnicate"]]) {
    const result = await run(args, cache);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Unknown data command/);
  }
});
