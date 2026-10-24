import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { checkDependency } from "../src/check-dependency.js";
import { renderUsageText, summarizeUsage, usageLogPath } from "../src/usage-log.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const scratch = async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-usage-"));
  roots.push(root);
  return root;
};

test("logging is off unless EVERGREEN_USAGE_LOG is set", () => {
  for (const value of [undefined, "", "0", "false", "off"]) assert.equal(usageLogPath({ EVERGREEN_USAGE_LOG: value }), undefined);
  assert.equal(usageLogPath({ EVERGREEN_USAGE_LOG: "/tmp/x.jsonl" }), "/tmp/x.jsonl");
  assert.match(usageLogPath({ EVERGREEN_USAGE_LOG: "1", EVERGREEN_DATA_DIR: "/cache" }) ?? "", /[\\/]cache[\\/]usage\.jsonl$/);
});

test("a check writes nothing while disabled and one line without repository details while enabled", async () => {
  const dir = await scratch();
  const file = join(dir, "usage.jsonl");
  const saved = process.env.EVERGREEN_USAGE_LOG;
  try {
    delete process.env.EVERGREEN_USAGE_LOG;
    await checkDependency("pkg:npm/request@2.88.2");
    await assert.rejects(readFile(file, "utf8"));

    process.env.EVERGREEN_USAGE_LOG = file;
    await checkDependency("pkg:npm/request@2.88.2");
    await checkDependency("pkg:npm/left-pad-does-not-exist-xyz");
  } finally {
    if (saved === undefined) delete process.env.EVERGREEN_USAGE_LOG;
    else process.env.EVERGREEN_USAGE_LOG = saved;
  }
  const lines = (await readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.deepEqual(Object.keys(lines[0]).sort(), ["at", "purl", "ruleIds", "severity", "status", "version"]);
  assert.equal(lines[0].status, "affected");
  assert.equal(lines[1].status, "no-data");
});

test("an unwritable log never fails the check", async () => {
  const dir = await scratch();
  const blocker = join(dir, "file");
  await writeFile(blocker, "");
  const saved = process.env.EVERGREEN_USAGE_LOG;
  process.env.EVERGREEN_USAGE_LOG = join(blocker, "nested", "usage.jsonl");
  try {
    assert.equal((await checkDependency("pkg:npm/request@2.88.2")).status, "affected");
  } finally {
    if (saved === undefined) delete process.env.EVERGREEN_USAGE_LOG;
    else process.env.EVERGREEN_USAGE_LOG = saved;
  }
});

test("the summary lists checks and blocks, skips bad lines, and treats a missing file as empty", async () => {
  const dir = await scratch();
  const file = join(dir, "usage.jsonl");
  const entry = (purl: string, status: string, at: string, extra = {}) => JSON.stringify({ at, purl, status, ruleIds: [], ...extra });
  await writeFile(file, [
    entry("pkg:npm/request", "affected", "2026-10-01T00:00:00.000Z", { severity: "high", ruleIds: ["npm.package.request.deprecated"] }),
    entry("pkg:npm/request", "affected", "2026-10-02T00:00:00.000Z", { severity: "high", ruleIds: ["npm.package.request.deprecated"] }),
    entry("pkg:pypi/nose", "affected", "2026-10-03T00:00:00.000Z", { severity: "medium", ruleIds: ["python.package.nose.unmaintained"] }),
    entry("pkg:npm/express", "no-data", "2026-10-04T00:00:00.000Z"),
    "not json",
    '{"at":1}',
  ].join("\n"));

  const summary = await summarizeUsage(file);
  assert.equal(summary.checks, 4);
  assert.equal(summary.skipped, 2);
  assert.deepEqual(summary.byStatus, { affected: 3, "version-dependent": 0, "not-affected": 0, "no-data": 1 });
  assert.deepEqual(summary.blocked.map((item) => [item.purl, item.count]), [["pkg:npm/request", 2], ["pkg:pypi/nose", 1]]);
  assert.equal(summary.firstAt, "2026-10-01T00:00:00.000Z");
  const text = renderUsageText(summary);
  assert.match(text, /blocked \(affected\): 3/);
  assert.match(text, /pkg:npm\/request x2 \(high\)/);

  const empty = await summarizeUsage(join(dir, "missing.jsonl"));
  assert.equal(empty.checks, 0);
  assert.match(renderUsageText(empty), /EVERGREEN_USAGE_LOG/);
});

test("the command reports that logging is off, and summarizes a file once it is on", async () => {
  const dir = await scratch();
  const file = join(dir, "usage.jsonl");
  const run = (env: Record<string, string>, ...args: string[]) =>
    spawnSync(process.execPath, [resolve("dist/src/cli.js"), ...args], { encoding: "utf8", env: { ...process.env, EVERGREEN_USAGE_LOG: "", ...env } });

  const off = run({}, "usage");
  assert.equal(off.status, 0, off.stderr);
  assert.match(off.stdout, /Usage logging is off/);

  assert.equal(run({ EVERGREEN_USAGE_LOG: file }, "check", "pkg:npm/request@2.88.2", "--fail-on", "none").status, 0);
  const on = run({ EVERGREEN_USAGE_LOG: file }, "usage", "--json");
  assert.equal(on.status, 0, on.stderr);
  const summary = JSON.parse(on.stdout);
  assert.equal(summary.schemaVersion, "evergreen.usage.v1");
  assert.equal(summary.byStatus.affected, 1);
  assert.equal(run({}, "usage", "--bogus").status, 2);
});
