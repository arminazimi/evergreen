import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { Finding, ScanResult } from "../src/domain.js";
import type { Plan } from "../src/plan.js";
import { buildPlan } from "../src/plan-build.js";

const SOURCE = { title: "Official notice", url: "https://example.com/notice" };

function finding(
  overrides: Partial<Finding> & Pick<Finding, "id" | "ruleId" | "detector" | "title" | "location">,
): Finding {
  return {
    summary: overrides.summary ?? `${overrides.title}.`,
    severity: overrides.severity ?? "high",
    confidence: overrides.confidence ?? "exact",
    sources: overrides.sources ?? [SOURCE],
    ...overrides,
  };
}

function scan(findings: Finding[], coverageFiles?: string[]): ScanResult {
  return {
    schemaVersion: "evergreen.scan.v1",
    root: "/repo",
    scannedAt: "2026-10-30T00:00:00.000Z",
    findings,
    diagnostics: [],
    ...(coverageFiles
      ? { coverage: { ecosystems: ["npm"], filesRead: coverageFiles, unsupportedFiles: [] } }
      : {}),
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

async function assertValidPlan(plan: Plan): Promise<void> {
  const validate = await schemaValidator();
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.deepEqual(crossWaveIssues(plan), []);
}

test("an empty scan produces an empty plan that matches the schema", async () => {
  const plan = buildPlan(scan([]));
  assert.deepEqual(plan, {
    schema: "evergreen.plan.v1",
    waves: [],
    items: [],
    summary: {
      items: 0,
      waves: 0,
      bySeverity: { info: 0, low: 0, medium: 0, high: 0, critical: 0 },
    },
  });
  await assertValidPlan(plan);
});

test("two npm findings that share a lockfile land in different waves", async () => {
  const files = ["package.json", "package-lock.json", "src/a.ts", "src/b.ts"];
  const request = finding({
    id: "npm.request:package.json:3",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    severity: "high",
    location: { path: "package.json", line: 3 },
  });
  const moment = finding({
    id: "npm.moment:package.json:8",
    ruleId: "npm.moment",
    detector: "npm",
    title: "Deprecated moment package",
    severity: "medium",
    location: { path: "package.json", line: 8 },
  });

  const plan = buildPlan(scan([request, moment], files));
  await assertValidPlan(plan);

  assert.equal(plan.summary.items, 2);
  assert.equal(plan.summary.waves, 2);
  assert.equal(plan.waves.length, 2);
  assert.deepEqual(
    plan.waves.map((wave) => wave.itemIds),
    [["npm.request:package.json:3"], ["npm.moment:package.json:8"]],
  );

  const byId = new Map(plan.items.map((item) => [item.id, item]));
  assert.deepEqual(byId.get("npm.request:package.json:3")?.touches, [
    "package-lock.json",
    "package.json",
  ]);
  assert.deepEqual(byId.get("npm.moment:package.json:8")?.touches, [
    "package-lock.json",
    "package.json",
  ]);
  assert.equal(byId.get("npm.request:package.json:3")?.wave, 0);
  assert.equal(byId.get("npm.moment:package.json:8")?.wave, 1);
});

test("branch names are deterministic and sanitised for git", async () => {
  const pin = finding({
    id: "npm.request:package.json:3",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    location: { path: "package.json", line: 3 },
  });
  const action = finding({
    id: "github-actions.checkout:.github/workflows/ci.yml:12",
    ruleId: "github-actions.checkout",
    detector: "github-actions",
    title: "Upgrade actions/checkout",
    severity: "medium",
    location: { path: ".github/workflows/ci.yml", line: 12 },
  });
  const odd = finding({
    id: "weird:rule id/with spaces:1",
    ruleId: "weird:rule id/with spaces",
    detector: "example",
    title: "Odd rule id",
    severity: "low",
    location: { path: "README.md", line: 1 },
  });

  const plan = buildPlan(
    scan([pin, action, odd], ["package.json", "package-lock.json", ".github/workflows/ci.yml", "README.md"]),
  );
  await assertValidPlan(plan);

  const byId = new Map(plan.items.map((item) => [item.id, item]));
  assert.equal(byId.get(pin.id)?.branch, "evergreen/npm.request-npm.requ");
  assert.equal(byId.get(action.id)?.branch, "evergreen/github-actions.checkout-github-a");
  assert.equal(byId.get(odd.id)?.branch, "evergreen/weird-rule-id-with-spaces-weird-ru");
});

test("every finding becomes an item; none is dropped", async () => {
  // A runtime pin has no migration packet, but still appears as a plan item (no note field).
  const pin = finding({
    id: "nodejs.runtime.eol-16:.nvmrc:1",
    ruleId: "nodejs.runtime.eol-16",
    detector: "npm",
    title: "Node.js 16 is end of life",
    severity: "critical",
    location: { path: ".nvmrc", line: 1 },
  });
  const plan = buildPlan(scan([pin], [".nvmrc", "package.json"]));
  await assertValidPlan(plan);

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]!.id, pin.id);
  assert.equal(plan.items[0]!.findingId, pin.id);
  assert.deepEqual(plan.items[0]!.touches, [".nvmrc"]);
  assert.equal("note" in plan.items[0]!, false);
  assert.deepEqual(plan.summary.bySeverity, {
    info: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 1,
  });
});

test("the same scan always yields the same plan", async () => {
  const findings = [
    finding({
      id: "npm.moment:package.json:8",
      ruleId: "npm.moment",
      detector: "npm",
      title: "Deprecated moment package",
      severity: "medium",
      location: { path: "package.json", line: 8 },
    }),
    finding({
      id: "npm.request:package.json:3",
      ruleId: "npm.request",
      detector: "npm",
      title: "Deprecated request package",
      severity: "high",
      location: { path: "package.json", line: 3 },
    }),
  ];
  const files = ["package.json", "package-lock.json"];
  const first = buildPlan(scan(findings, files));
  const second = buildPlan(scan([...findings].reverse(), files));
  assert.deepEqual(second, first);
  await assertValidPlan(first);
});

test("options.files overrides coverage when computing touches", async () => {
  const dependency = finding({
    id: "npm.request:package.json:3",
    ruleId: "npm.request",
    detector: "npm",
    title: "Deprecated request package",
    location: { path: "package.json", line: 3 },
  });
  // Coverage omits the lockfile; options.files includes it.
  const withoutOptions = buildPlan(scan([dependency], ["package.json"]));
  const withOptions = buildPlan(scan([dependency], ["package.json"]), {
    files: ["package.json", "yarn.lock"],
  });

  assert.deepEqual(withoutOptions.items[0]!.touches, ["package.json"]);
  assert.deepEqual(withOptions.items[0]!.touches, ["package.json", "yarn.lock"]);
  await assertValidPlan(withoutOptions);
  await assertValidPlan(withOptions);
});
