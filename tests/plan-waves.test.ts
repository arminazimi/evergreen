import assert from "node:assert/strict";
import { test } from "node:test";

import type { Severity } from "../src/domain.js";
import { scheduleWaves } from "../src/plan-waves.js";

interface Item {
  id: string;
  touches: string[];
  severity: Severity;
}

const SEVERITIES: readonly Severity[] = ["info", "low", "medium", "high", "critical"];
const PATHS = ["app.ts", "package.json", "package-lock.json", "src/a.ts", "src/b.ts"];

/** Mulberry32: a small seeded generator, so every run schedules the same cases. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function generated(seed: number): Item[] {
  const next = random(seed);
  const count = Math.floor(next() * 9);
  const items: Item[] = [];
  for (let index = 0; index < count; index += 1) {
    const touchCount = Math.floor(next() * 4);
    const touches: string[] = [];
    for (let touch = 0; touch < touchCount; touch += 1) {
      touches.push(PATHS[Math.floor(next() * PATHS.length)]!);
    }
    items.push({
      id: `item-${index}`,
      touches,
      severity: SEVERITIES[Math.floor(next() * SEVERITIES.length)]!,
    });
  }
  return items;
}

/** Every item appears once, no wave has two tasks on one path, and the result is stable. */
function assertInvariants(items: Item[]): void {
  const waves = scheduleWaves(items);
  const scheduled = new Map<string, number>();

  for (const [index, wave] of waves.entries()) {
    assert.ok(wave.length > 0, "a wave is never empty");
    const used = new Set<string>();
    for (const id of wave) {
      const item = items.find((candidate) => candidate.id === id);
      assert.ok(item, `${id} comes from the input`);
      assert.equal(scheduled.has(id), false, `${id} appears in exactly one wave`);
      scheduled.set(id, index);
      for (const path of new Set(item.touches)) {
        assert.equal(used.has(path), false, `${id} does not share ${path} within a wave`);
        used.add(path);
      }
    }
  }

  assert.equal(scheduled.size, items.length, "every input item is scheduled");
  assert.deepEqual(scheduleWaves(items), waves, "the same input gives the same waves");
}

test("no tasks produce no waves", () => {
  assert.deepEqual(scheduleWaves([]), []);
});

test("tasks that touch nothing in common share one wave", () => {
  assert.deepEqual(
    scheduleWaves([
      { id: "b", touches: ["package.json"], severity: "high" },
      { id: "a", touches: ["src/a.ts"], severity: "high" },
    ]),
    [["a", "b"]],
  );
});

test("tasks that all touch one path run in separate waves", () => {
  assert.deepEqual(
    scheduleWaves([
      { id: "b", touches: ["package.json"], severity: "low" },
      { id: "a", touches: ["package.json"], severity: "critical" },
      { id: "c", touches: ["package.json"], severity: "medium" },
    ]),
    [["a"], ["c"], ["b"]],
  );
});

test("higher severity is placed before lower severity even with a later id", () => {
  assert.deepEqual(
    scheduleWaves([
      { id: "alpha", touches: ["src/a.ts"], severity: "low" },
      { id: "zulu", touches: ["src/z.ts"], severity: "critical" },
    ]),
    [["zulu", "alpha"]],
  );
});

test("a task joins the first wave it does not conflict with", () => {
  assert.deepEqual(
    scheduleWaves([
      { id: "a", touches: ["src/a.ts"], severity: "high" },
      { id: "b", touches: ["src/b.ts"], severity: "high" },
      { id: "c", touches: ["src/a.ts"], severity: "high" },
      { id: "d", touches: ["src/b.ts"], severity: "high" },
    ]),
    [
      ["a", "b"],
      ["c", "d"],
    ],
  );
});

test("a repeated path inside one task counts once", () => {
  assert.deepEqual(
    scheduleWaves([
      { id: "a", touches: ["package.json", "package.json"], severity: "high" },
      { id: "b", touches: ["src/a.ts"], severity: "high" },
    ]),
    [["a", "b"]],
  );
});

test("the input array is not reordered", () => {
  const items: Item[] = [
    { id: "b", touches: ["src/b.ts"], severity: "low" },
    { id: "a", touches: ["src/a.ts"], severity: "high" },
  ];
  scheduleWaves(items);
  assert.deepEqual(
    items.map((item) => item.id),
    ["b", "a"],
  );
});

test("generated cases keep the invariants", () => {
  for (let seed = 0; seed < 500; seed += 1) {
    assertInvariants(generated(seed));
  }
});
