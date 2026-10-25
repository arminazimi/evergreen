import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import type { Finding } from "../src/domain.js";
import type { Detector } from "../src/sdk.js";
import { addWatched, listWatched, removeWatched, renderWatchText, runWatch } from "../src/watch.js";

const roots: string[] = [];
after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const machine = async () => {
  const home = await mkdtemp(join(tmpdir(), "evergreen-watch-"));
  roots.push(home);
  return { home, env: { ...process.env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, ".config") } };
};

/** A detector that reports whatever `findings` currently holds, so a test can change the world between digests. */
const detectorFor = (findings: Array<{ id: string; deadline?: string }>): Detector =>
  ({
    id: "fake",
    apiVersion: "evergreen.detector.v1",
    scan: async () =>
      findings.map(({ id, deadline }) => ({
        id,
        ruleId: "rule",
        title: `Finding ${id}`,
        summary: "",
        severity: "high",
        location: { path: "package.json" },
        sources: [],
        ...(deadline ? { deadline } : {}),
      }) as Omit<Finding, "detector" | "confidence">),
  }) as unknown as Detector;

test("projects are registered once, sorted, and can be removed", async () => {
  const { env } = await machine();
  assert.equal(await addWatched("/b/project", { env }), true);
  assert.equal(await addWatched("/a/project", { env }), true);
  assert.equal(await addWatched("/a/project", { env }), false);
  assert.deepEqual(await listWatched({ env }), ["/a/project", "/b/project"]);
  assert.equal(await removeWatched("/a/project", { env }), true);
  assert.equal(await removeWatched("/a/project", { env }), false);
  assert.deepEqual(await listWatched({ env }), ["/b/project"]);
});

test("a new end-of-life date appears in the next digest once", async () => {
  const { home, env } = await machine();
  await addWatched(home, { env });
  const findings: Array<{ id: string; deadline?: string }> = [{ id: "a" }];

  const first = await runWatch([detectorFor(findings)], { env });
  assert.deepEqual(first.changes.map((change) => change.finding.id), ["a"]);
  assert.equal((await runWatch([detectorFor(findings)], { env })).changes.length, 0);

  findings[0] = { id: "a", deadline: "2027-03-01" };
  findings.push({ id: "b" });
  const third = await runWatch([detectorFor(findings)], { env });
  assert.deepEqual(third.changes.map((change) => change.finding.id), ["a", "b"]);
  assert.match(renderWatchText(third), /deadline 2027-03-01/);
  assert.equal((await runWatch([detectorFor(findings)], { env })).changes.length, 0);
});

test("--weekly waits a week between digests", async () => {
  const { home, env } = await machine();
  await addWatched(home, { env });
  const detectors = [detectorFor([{ id: "a" }])];
  const start = new Date("2027-01-15T00:00:00Z");
  assert.equal((await runWatch(detectors, { env, now: start, weekly: true })).ran, true);
  assert.equal((await runWatch(detectors, { env, now: new Date("2027-01-20T00:00:00Z"), weekly: true })).ran, false);
  assert.equal((await runWatch(detectors, { env, now: new Date("2027-01-22T00:00:01Z"), weekly: true })).ran, true);
});

test("a project that cannot be scanned is reported and does not lose its history", async () => {
  const { home, env } = await machine();
  await addWatched(home, { env });
  await runWatch([detectorFor([{ id: "a" }])], { env });
  const broken = { id: "broken", apiVersion: "evergreen.detector.v1", scan: async () => { throw new Error("boom"); } } as unknown as Detector;
  const digest = await runWatch([broken], { env });
  assert.equal(digest.failed.length, 1);
  assert.match(renderWatchText(digest), /Could not scan .*: boom/);
  assert.equal((await runWatch([detectorFor([{ id: "a" }])], { env })).changes.length, 0);
});
