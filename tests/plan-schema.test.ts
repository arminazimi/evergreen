import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { Plan, PlanSummary } from "../src/plan.js";

function samplePlan(): Plan {
  return {
    schema: "evergreen.plan.v1",
    waves: [
      { index: 0, itemIds: ["item-request", "item-node-16"] },
      { index: 1, itemIds: ["item-checkout"] },
    ],
    items: [
      {
        id: "item-request",
        findingId: "npm.request:package.json:3",
        title: "Replace request with fetch",
        severity: "high",
        touches: ["package.json", "src/client.ts"],
        branch: "evergreen/npm-request-1a2b3c4d",
        wave: 0,
      },
      {
        id: "item-node-16",
        findingId: "nodejs.end-of-life:.nvmrc:1",
        title: "Upgrade Node.js 16 to a supported line",
        severity: "critical",
        touches: [".nvmrc"],
        branch: "evergreen/nodejs-16-5e6f7a8b",
        wave: 0,
      },
      {
        id: "item-checkout",
        findingId: "github-actions.checkout:.github/workflows/ci.yml:12",
        title: "Upgrade actions/checkout",
        severity: "medium",
        touches: [".github/workflows/ci.yml"],
        branch: "evergreen/github-actions-checkout-9c0d1e2f",
        wave: 1,
      },
    ],
    summary: {
      items: 3,
      waves: 2,
      bySeverity: { info: 0, low: 0, medium: 1, high: 1, critical: 1 },
    },
  };
}

async function schemaValidator() {
  const schema = JSON.parse(await readFile(resolve("schemas/plan.v1.schema.json"), "utf8")) as object;
  return new Ajv2020({ allErrors: true }).compile(schema);
}

function crossWaveIssues(plan: Plan): string[] {
  const waveOf = new Map<string, number>();
  const issues: string[] = [];
  for (const wave of plan.waves) {
    for (const itemId of wave.itemIds) {
      const previous = waveOf.get(itemId);
      if (previous === undefined) waveOf.set(itemId, wave.index);
      else issues.push(`${itemId} appears in waves ${previous} and ${wave.index}`);
    }
  }
  return issues;
}

async function planValidator() {
  const validate = await schemaValidator();
  return {
    check: (plan: Plan) => validate(plan) && crossWaveIssues(plan).length === 0,
    errors: () => validate.errors,
  };
}

type Mutation = (value: Plan) => void;

const mutations: Array<[string, Mutation]> = [
  ["wrong schema value", (value) => { (value as { schema: string }).schema = "evergreen.plan.v2"; }],
  ["missing waves", (value) => { delete (value as Partial<Plan>).waves; }],
  ["missing items", (value) => { delete (value as Partial<Plan>).items; }],
  ["missing summary", (value) => { delete (value as Partial<Plan>).summary; }],
  ["unknown top-level field", (value) => { (value as unknown as Record<string, unknown>).generatedAt = "2026-10-30T00:00:00Z"; }],
  ["negative wave index", (value) => { value.waves[0]!.index = -1; }],
  ["empty wave", (value) => { value.waves[0]!.itemIds = []; }],
  ["duplicate id in one wave", (value) => { value.waves[0]!.itemIds.push(value.waves[0]!.itemIds[0]!); }],
  ["missing item field", (value) => { delete (value.items[0] as Partial<Plan["items"][number]>).branch; }],
  ["unknown item field", (value) => { (value.items[0] as unknown as Record<string, unknown>).note = "not in the contract"; }],
  ["unknown severity", (value) => { (value.items[0] as { severity: string }).severity = "urgent"; }],
  ["negative item wave", (value) => { value.items[0]!.wave = -1; }],
  ["item without touched files", (value) => { value.items[0]!.touches = []; }],
  ["absolute touch path", (value) => { value.items[0]!.touches = ["/etc/passwd"]; }],
  ["touch path with a parent segment", (value) => { value.items[0]!.touches = ["../package.json"]; }],
  ["touch path with a backslash", (value) => { value.items[0]!.touches = ["src\\client.ts"]; }],
  ["duplicate touch path", (value) => { value.items[0]!.touches = ["package.json", "package.json"]; }],
  ["missing severity count", (value) => { delete (value.summary.bySeverity as Partial<PlanSummary["bySeverity"]>).high; }],
  ["unknown summary field", (value) => { (value.summary as unknown as Record<string, unknown>).files = 4; }],
];

test("the sample plan matches the schema", async () => {
  const { check, errors } = await planValidator();
  const plan = samplePlan();
  assert.equal(check(plan), true, JSON.stringify(errors()));
});

test("the schema rejects malformed plans", async () => {
  const { check } = await planValidator();
  for (const [name, mutate] of mutations) {
    const value = structuredClone(samplePlan());
    mutate(value);
    assert.equal(check(value), false, name);
  }
});

test("an item id may belong to only one wave", async () => {
  const { check } = await planValidator();
  const plan = samplePlan();
  plan.waves[1]!.itemIds.push(plan.waves[0]!.itemIds[0]!);
  assert.deepEqual(crossWaveIssues(plan), ["item-request appears in waves 0 and 1"]);
  assert.equal(check(plan), false);
});

test("an empty plan is valid", async () => {
  const { check, errors } = await planValidator();
  const plan: Plan = {
    schema: "evergreen.plan.v1",
    waves: [],
    items: [],
    summary: { items: 0, waves: 0, bySeverity: { info: 0, low: 0, medium: 0, high: 0, critical: 0 } },
  };
  assert.equal(check(plan), true, JSON.stringify(errors()));
});
