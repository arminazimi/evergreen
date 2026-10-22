import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { npmDetector } from "../src/detectors/npm.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";
import { versContains } from "../src/vers.js";

const fixtures = resolve("tests/fixtures/nextjs");
const SUPPORT_POLICY = "https://nextjs.org/support-policy";
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-nextjs-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/npm.json", "utf8"))).rules;
}

async function nextRules(): Promise<RegistryV2Rule[]> {
  return (await committedRules()).filter((rule) => rule.purl === "pkg:npm/next");
}

const addYears = (date: string, years: number): string => {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year + years, month - 1, day)).toISOString().slice(0, 10);
};

/** The finding the npm detector reports for a `next` declaration, built from the committed rule. */
function expectedFinding(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    confidence: summary.includes("not found in a supported lockfile") ? "range" : "inferred-from-lock",
    location: { path, line },
    replacement: rule.replacement!,
    deadline: rule.deadline!,
    migration: rule.migration!,
    sources: rule.sources,
    usages: [],
    impact: { usageCount: 0, affectedFiles: 0, level: "none" },
  };
}

test("next passes detector conformance on every fixture", async () => {
  const rule = (await nextRules()).find((item) => item.id === "npm.package.next.14.support-end")!;
  await runDetectorConformance({
    detector: npmDetector,
    fixtures: [
      {
        name: "nextjs positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expectedFinding(
            rule,
            "package.json",
            5,
            `next is declared in dependencies as 14.2.15; resolved: 14.2.15. ${rule.summary}`,
          ),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck],
  });
  await runDetectorConformance({
    detector: npmDetector,
    fixtures: [
      { name: "nextjs negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "nextjs zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: npmDetector,
    fixtures: [{ name: "nextjs malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("covers every unsupported and recently retired major, with the dates from the support policy", async () => {
  // Release dates and support windows are from https://nextjs.org/support-policy. Maintenance LTS lasts two years after release.
  const expected = [
    { major: 12, released: "2021-10-26", event: "end-of-support", severity: "high" },
    { major: 13, released: "2022-10-26", event: "end-of-support", severity: "high" },
    { major: 14, released: "2023-10-26", event: "end-of-support", severity: "high" },
    { major: 15, released: "2024-10-21", event: "scheduled-end-of-life", severity: "low" },
  ] as const;
  const rules = await nextRules();

  assert.deepEqual(rules.map((rule) => rule.id), expected.map((item) => `npm.package.next.${item.major}.support-end`));
  for (const item of expected) {
    const rule = rules.find((candidate) => candidate.id === `npm.package.next.${item.major}.support-end`)!;
    const windowEnd = addYears(item.released, 2);
    assert.equal(rule.event, item.event, rule.id);
    assert.equal(rule.severity, item.severity, rule.id);
    assert.equal(rule.deadline, windowEnd, `${rule.id} deadline must be release plus two years`);
    assert.equal(rule.purl, "pkg:npm/next", rule.id);
    assert.equal(rule.replacement, "Next.js 16 (Active LTS)", rule.id);
    assert.ok(versContains(rule.vers, `${item.major}.0.0`), `${rule.id} covers ${item.major}.0.0`);
    assert.ok(versContains(rule.vers, `${item.major}.99.99`), `${rule.id} covers ${item.major}.99.99`);
    assert.equal(versContains(rule.vers, `${item.major - 1}.99.99`), false, `${rule.id} excludes the previous major`);
    assert.equal(versContains(rule.vers, `${item.major + 1}.0.0`), false, `${rule.id} excludes the next major`);
  }
});

test("Next.js 16, the Active LTS major, has no lifecycle rule", async () => {
  for (const rule of await nextRules()) {
    assert.equal(versContains(rule.vers, "16.0.0"), false, rule.id);
    assert.equal(versContains(rule.vers, "16.0.1"), false, rule.id);
  }
});

test("every Next.js rule cites the support policy, has an https source, and carries migration guidance", async () => {
  for (const rule of await nextRules()) {
    assert.ok(rule.sources.some((source) => source.url === SUPPORT_POLICY), `${rule.id} cites the support policy`);
    assert.ok(rule.sources.every((source) => /^https:\/\/\S+$/.test(source.url)), `${rule.id} sources use https`);
    assert.deepEqual(rule["x-npm"], { package: "next" }, rule.id);
    assert.ok(rule.migration && rule.migration.constraints.length >= 1, rule.id);
    assert.ok(rule.migration!.steps.length >= 1, rule.id);
    assert.equal(new Set(rule.migration!.steps.map((step) => step.id)).size, rule.migration!.steps.length, `${rule.id} step ids are unique`);
    assert.ok(rule.migration!.verification.some((check) => check.command === "npm run build --if-present"), rule.id);
  }
});

test("reports each Next.js major a declared range allows, and no supported or non-version declaration", async () => {
  const cases: Array<[string, string[]]> = [
    ["^12.3.4", ["npm.package.next.12.support-end"]],
    ["13.5.6", ["npm.package.next.13.support-end"]],
    ["^14.2.0", ["npm.package.next.14.support-end"]],
    ["15.5.0", ["npm.package.next.15.support-end"]],
    ["^13.0.0 || ^14.0.0", ["npm.package.next.13.support-end", "npm.package.next.14.support-end"]],
    ["*", ["npm.package.next.12.support-end", "npm.package.next.13.support-end", "npm.package.next.14.support-end", "npm.package.next.15.support-end"]],
    ["^16.0.0", []],
    ["latest", []],
    ["canary", []],
    ["workspace:*", []],
  ];
  for (const [range, expectedRules] of cases) {
    const root = await repository({ "package.json": JSON.stringify({ dependencies: { next: range } }) });
    const findings = await npmDetector.scan({ root });
    assert.deepEqual(findings.map((finding) => finding.ruleId).sort(), [...expectedRules].sort(), range);
  }
});

test("a lockfile version decides which Next.js rule applies, even when the declared range is broad", async () => {
  const resolvedTo = async (version: string) =>
    (await npmDetector.scan({
      root: await repository({
        "package.json": JSON.stringify({ dependencies: { next: "^14.0.0 || ^16.0.0" } }),
        "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/next": { version } } }),
      }),
    })).map((finding) => finding.ruleId);

  assert.deepEqual(await resolvedTo("14.2.15"), ["npm.package.next.14.support-end"]);
  assert.deepEqual(await resolvedTo("16.0.1"), []);
});

test("a migration packet for a Next.js finding names the manifest, the steps, and the verification commands", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [npmDetector]);
  const finding = result.findings.find((item) => item.id === "npm.package.next.14.support-end:package.json:5");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("package.json"));
  assert.ok(packet.steps.some((step) => step.id === "set-next-version"));
  assert.ok(packet.steps.some((step) => step.id === "apply-upgrade-guides"));
  assert.ok(packet.verification.some((check) => check.command === "npm run build --if-present"));
  assert.ok(packet.verification.some((check) => check.command === "npm run lint --if-present"));
});
