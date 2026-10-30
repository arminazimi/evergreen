import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { Plan } from "../src/plan.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const fixture = resolve("tests/fixtures/plan/monorepo");
const SHARED_LOCKFILE = "package-lock.json";

async function schemaValidator() {
  const schema = JSON.parse(await readFile(resolve("schemas/plan.v1.schema.json"), "utf8")) as object;
  return new Ajv2020({ allErrors: true }).compile(schema);
}

async function planJson(): Promise<Plan> {
  const { stdout } = await execute(process.execPath, [cli, "plan", fixture, "--json"]);
  return JSON.parse(stdout) as Plan;
}

test("plan --json on the monorepo fixture is schema-valid with at least eight tasks", async () => {
  const validate = await schemaValidator();
  const plan = await planJson();

  assert.equal(plan.schema, "evergreen.plan.v1");
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.ok(plan.summary.items >= 8, `expected at least 8 tasks, got ${plan.summary.items}`);
  assert.equal(plan.items.length, plan.summary.items);
  assert.equal(plan.waves.length, plan.summary.waves);
  assert.ok(plan.summary.waves >= 1);
});

test("tasks that share the root lockfile land in different waves", async () => {
  const plan = await planJson();
  const sharingLockfile = plan.items.filter((item) => item.touches.includes(SHARED_LOCKFILE));

  assert.ok(
    sharingLockfile.length >= 2,
    `expected several tasks to touch ${SHARED_LOCKFILE}, got ${sharingLockfile.length}`,
  );

  const waves = new Set(sharingLockfile.map((item) => item.wave));
  assert.equal(
    waves.size,
    sharingLockfile.length,
    `shared-lockfile tasks must each get their own wave; got ${sharingLockfile.length} tasks across ${waves.size} waves`,
  );
});

test("disjoint tasks share a wave, and every wave stays conflict-free", async () => {
  const plan = await planJson();
  const multiTaskWaves = plan.waves.filter((wave) => wave.itemIds.length > 1);
  assert.ok(multiTaskWaves.length >= 1, "at least one wave must hold disjoint tasks together");

  const byId = new Map(plan.items.map((item) => [item.id, item]));
  for (const wave of plan.waves) {
    const used = new Set<string>();
    for (const itemId of wave.itemIds) {
      const item = byId.get(itemId);
      assert.ok(item, `${itemId} is listed in the plan`);
      assert.equal(item.wave, wave.index);
      for (const path of item.touches) {
        assert.equal(
          used.has(path),
          false,
          `wave ${wave.index} must not reuse ${path} (also touched by another task in the same wave)`,
        );
        used.add(path);
      }
    }
  }
});

test("the monorepo plan is stable across runs", async () => {
  const first = await planJson();
  const second = await planJson();
  assert.deepEqual(second, first);
});
