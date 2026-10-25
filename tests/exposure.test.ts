import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { exposureTimeline } from "../src/exposure.js";

function git(cwd: string, args: string[], date?: string): void {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (date !== undefined) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, env, stdio: "ignore" });
}

function repository(): string {
  const root = mkdtempSync(join(tmpdir(), "evergreen-exposure-"));
  git(root, ["init", "-q"]);
  writeFileSync(join(root, "package.json"), '{\n  "name": "x",\n  "engines": { "node": "18" }\n}\n');
  git(root, ["add", "."]);
  git(root, ["commit", "-q", "-m", "init"], "2024-01-10T12:00:00Z");
  writeFileSync(join(root, "package.json"), '{\n  "name": "y",\n  "engines": { "node": "18" }\n}\n');
  git(root, ["commit", "-qam", "rename"], "2025-06-01T12:00:00Z");
  return root;
}

test("reports when the declaration line was introduced and how long it has been past end of life", () => {
  const root = repository();
  try {
    const timeline = exposureTimeline({ deadline: "2025-04-30", location: { path: "package.json", line: 3 } }, root, "2026-04-30");
    assert.deepEqual(timeline, {
      introduced: "2024-01-10",
      endOfLife: "2025-04-30",
      daysDeclared: 841,
      daysPastEndOfLife: 365,
      daysExposed: 365,
      unknown: [],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("exposure counts from introduction when the declaration came after end of life", () => {
  const root = repository();
  try {
    const timeline = exposureTimeline({ deadline: "2023-01-01", location: { path: "package.json", line: 3 } }, root, "2024-01-20");
    assert.equal(timeline.daysPastEndOfLife, 384);
    assert.equal(timeline.daysExposed, 10);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a file without a line falls back to when the file first appeared", () => {
  const root = repository();
  try {
    assert.equal(exposureTimeline({ location: { path: "package.json" } }, root, "2026-01-01").introduced, "2024-01-10");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a finding with no deadline names the missing end-of-life date", () => {
  const root = repository();
  try {
    const timeline = exposureTimeline({ location: { path: "package.json", line: 3 } }, root, "2026-04-30");
    assert.equal(timeline.endOfLife, undefined);
    assert.equal(timeline.introduced, "2024-01-10");
    assert.deepEqual(timeline.unknown, ["end-of-life date unknown: the rule has no deadline"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a shallow clone reports the introduction date as unknown instead of guessing", () => {
  const source = repository();
  const clones = mkdtempSync(join(tmpdir(), "evergreen-exposure-clone-"));
  try {
    const clone = join(clones, "shallow");
    execFileSync("git", ["clone", "-q", "--depth", "1", `file://${source}`, clone], { stdio: "ignore" });
    const timeline = exposureTimeline({ deadline: "2025-04-30", location: { path: "package.json", line: 3 } }, clone, "2026-04-30");
    assert.equal(timeline.introduced, undefined);
    assert.equal(timeline.daysPastEndOfLife, 365);
    assert.deepEqual(timeline.unknown, ["introduction date unknown: shallow clone has no full history"]);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(clones, { recursive: true, force: true });
  }
});

test("a directory that is not a git repository reports the introduction date as unknown", () => {
  const root = mkdtempSync(join(tmpdir(), "evergreen-exposure-plain-"));
  try {
    mkdirSync(join(root, "sub"));
    const timeline = exposureTimeline({ deadline: "2025-04-30", location: { path: "package.json", line: 1 } }, root, "2026-04-30");
    assert.deepEqual(timeline.unknown, ["introduction date unknown: not a git repository"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an invalid day is rejected", () => {
  assert.throws(() => exposureTimeline({ location: { path: "a" } }, ".", "soon"), /not a date/);
});
