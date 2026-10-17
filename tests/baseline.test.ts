import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { applyBaseline, createBaseline, findingFingerprint, readBaseline, suppressionIssues } from "../src/baseline.js";
import type { Finding, ScanResult } from "../src/domain.js";

const finding: Finding = {
  id: "example:file:1",
  ruleId: "example",
  detector: "fixture",
  title: "Example",
  summary: "A stable finding summary",
  severity: "high",
  location: { path: "package.json", line: 1 },
  sources: [{ title: "Source", url: "https://example.com" }],
};

const result: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/fixture",
  scannedAt: "2026-10-13T00:00:00.000Z",
  findings: [finding],
  diagnostics: [],
};

test("fingerprints ignore line movement but include material finding content", () => {
  assert.equal(
    findingFingerprint(finding),
    findingFingerprint({ ...finding, location: { ...finding.location, line: 99 } }),
  );
  assert.notEqual(
    findingFingerprint(finding),
    findingFingerprint({ ...finding, summary: "The dependency version changed" }),
  );
  assert.notEqual(
    findingFingerprint(finding),
    findingFingerprint({
      ...finding,
      usages: [
        {
          kind: "call",
          language: "typescript",
          symbol: "example.run",
          location: { path: "src/index.ts", line: 2, column: 1 },
          excerpt: "example.run();",
        },
      ],
    }),
  );
  const usageFinding = {
    ...finding,
    usages: [
      {
        kind: "call" as const,
        language: "typescript" as const,
        symbol: "example.run",
        location: { path: "src/index.ts", line: 2, column: 1 },
        excerpt: "example.run();",
      },
    ],
  };
  assert.equal(
    findingFingerprint(usageFinding),
    findingFingerprint({
      ...usageFinding,
      usages: [{ ...usageFinding.usages[0]!, location: { path: "src/index.ts", line: 20 } }],
    }),
  );
});

test("a baseline suppresses matching findings and reports the count", () => {
  const filtered = applyBaseline(result, createBaseline(result));

  assert.deepEqual(filtered.findings, []);
  assert.deepEqual(filtered.diagnostics, ["Suppressed 1 finding from the baseline."]);
});


async function baselineValidator() {
  const schema = JSON.parse(await readFile(resolve("schemas/baseline.v1.schema.json"), "utf8"));
  return new Ajv2020({ allErrors: true, strict: false }).compile(schema);
}

const fingerprint = "a".repeat(64);
const entry = { fingerprint, ruleId: "r", path: "package.json" };
const file = (findings: object[]) => ({ schemaVersion: "evergreen.baseline.v1", createdAt: "2026-10-17T00:00:00.000Z", findings });

test("the schema accepts a baseline with and without suppression fields", async () => {
  const validate = await baselineValidator();
  assert.ok(validate(file([entry])), JSON.stringify(validate.errors));
  assert.ok(validate(file([{ ...entry, owner: "platform-team", reason: "Migration tracked in PLAT-12", created: "2026-10-17", expires: "2027-01-31" }])), JSON.stringify(validate.errors));
  assert.ok(validate(file([{ ...entry, owner: "me" }])), "each field is optional on its own");
});

test("the schema rejects empty text, malformed dates, and unknown fields", async () => {
  const validate = await baselineValidator();
  for (const bad of [{ owner: "" }, { owner: "   " }, { reason: "x".repeat(501) }, { created: "17/10/2026" }, { expires: "2027-13-40x" }, { expires: 20270131 }, { colour: "red" }]) {
    assert.equal(validate(file([{ ...entry, ...bad }])), false, JSON.stringify(bad));
  }
});

test("suppression fields are checked for text, real calendar dates, and order", () => {
  assert.deepEqual(suppressionIssues({}), []);
  assert.deepEqual(suppressionIssues({ owner: "a", reason: "b", created: "2026-10-17", expires: "2026-10-17" }), []);
  assert.deepEqual(suppressionIssues({ owner: " " }), ["owner must be a non-empty string of at most 500 characters"]);
  assert.deepEqual(suppressionIssues({ expires: "2026-02-30" }), ["expires must be a valid date (YYYY-MM-DD)"]);
  assert.deepEqual(suppressionIssues({ created: "2026-10-17", expires: "2026-10-16" }), ["expires must not be before created"]);
});

test("createBaseline records the suppression on every entry and leaves fingerprints alone", () => {
  const plain = createBaseline(result);
  const withReason = createBaseline(result, { owner: "platform", reason: "tracked", created: "2026-10-17", expires: "2027-01-31" });
  assert.deepEqual(plain.findings.map(({ fingerprint }) => fingerprint), withReason.findings.map(({ fingerprint }) => fingerprint));
  assert.deepEqual(Object.keys(plain.findings[0]!), ["fingerprint", "ruleId", "path"], "no new fields unless asked for");
  assert.deepEqual(withReason.findings[0], { fingerprint: findingFingerprint(finding), ruleId: "example", path: "package.json", owner: "platform", reason: "tracked", created: "2026-10-17", expires: "2027-01-31" });
  assert.throws(() => createBaseline(result, { expires: "soon" }), /Invalid suppression: expires must be a valid date/);
});

test("a baseline with suppression fields still suppresses, and a baseline without them still loads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-baseline-"));
  try {
    const oldPath = join(directory, "old.json");
    await writeFile(oldPath, JSON.stringify(file([entry])));
    assert.equal((await readBaseline(oldPath)).findings.length, 1);

    const newPath = join(directory, "new.json");
    await writeFile(newPath, JSON.stringify(createBaseline(result, { owner: "platform", reason: "tracked", expires: "2027-01-31" })));
    const loaded = await readBaseline(newPath);
    assert.equal(applyBaseline(result, loaded).findings.length, 0);

    const badPath = join(directory, "bad.json");
    await writeFile(badPath, JSON.stringify(file([entry, { ...entry, expires: "tomorrow" }])));
    await assert.rejects(readBaseline(badPath), /findings\[1\]: expires must be a valid date/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const smoke = resolve("tests/fixtures/smoke");

test("a baseline written by Evergreen 0.1.0 loads, matches today's fingerprints, and still suppresses its findings", async () => {
  const old = await readBaseline(resolve("tests/fixtures/baselines/v0.1.0.json"));
  assert.equal(old.schemaVersion, "evergreen.baseline.v1");
  assert.deepEqual(old.findings.map((entry) => Object.keys(entry).sort()), Array(3).fill(["fingerprint", "path", "ruleId"]), "no suppression fields");

  const { builtInDetectors } = await import("../src/detectors/index.js");
  const { scanRepository } = await import("../src/engine.js");
  const scan = await scanRepository(smoke, builtInDetectors);
  const remaining = applyBaseline(scan, old).findings.map((finding) => finding.ruleId).sort();
  // Everything 0.1.0 recorded is still suppressed; only rules that did not exist then appear (Node.js 19 was added in 0.2.0).
  assert.deepEqual(remaining, ["nodejs.runtime.eol-19"]);
  assert.equal(scan.findings.length - remaining.length, old.findings.length);
});

test("the schema accepts the baseline Evergreen 0.1.0 wrote", async () => {
  const validate = await baselineValidator();
  const old = JSON.parse(await readFile(resolve("tests/fixtures/baselines/v0.1.0.json"), "utf8"));
  assert.ok(validate(old), JSON.stringify(validate.errors));
});

test("the CLI scans with a 0.1.0 baseline and reports only what the baseline does not cover", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)(process.execPath, [resolve("dist/src/cli.js"), "scan", smoke, "--baseline", resolve("tests/fixtures/baselines/v0.1.0.json"), "--json"]);
  const output = JSON.parse(stdout) as { findings: Array<{ ruleId: string }>; diagnostics: string[] };
  assert.deepEqual(output.findings.map((finding) => finding.ruleId), ["nodejs.runtime.eol-19"]);
  assert.ok(output.diagnostics.includes("Suppressed 3 findings from the baseline."));
});

import { DEFAULT_WARN_DAYS, daysBetween, expiringSuppressions } from "../src/baseline.js";

const entryFor = (overrides: object) => ({ fingerprint: findingFingerprint(finding), ruleId: "example", path: "package.json", ...overrides });
const baselineWith = (...entries: object[]) => ({ schemaVersion: "evergreen.baseline.v1" as const, createdAt: "2026-10-17T00:00:00.000Z", findings: entries as never[] });

test("daysBetween counts whole calendar days across month and year ends", () => {
  assert.equal(daysBetween("2026-10-17", "2026-10-17"), 0);
  assert.equal(daysBetween("2026-10-17", "2026-10-31"), 14);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2, "leap year");
  assert.equal(daysBetween("2026-10-17", "2026-10-10"), -7);
});

test("a suppression is reported when it expires within the window, using only the day it is given", () => {
  const today = "2026-10-17";
  const lines = (expires: string | undefined, options = {}) =>
    applyBaseline(result, baselineWith(entryFor(expires === undefined ? {} : { expires, owner: "platform", reason: "tracked" })), { today, ...options }).diagnostics.filter((line) => line.startsWith("Baseline suppression"));
  assert.deepEqual(lines("2026-10-31"), ["Baseline suppression expires in 14 days (2026-10-31): example at package.json (owner: platform; reason: tracked)."]);
  assert.deepEqual(lines("2026-10-17"), ["Baseline suppression expires today (2026-10-17): example at package.json (owner: platform; reason: tracked)."]);
  assert.deepEqual(lines("2026-10-18"), ["Baseline suppression expires in 1 day (2026-10-18): example at package.json (owner: platform; reason: tracked)."]);
  assert.deepEqual(lines("2026-11-01"), [], "one day past the default window");
  assert.deepEqual(lines("2026-11-01", { warnWithinDays: 30 }).length, 1, "a wider window");
  assert.deepEqual(lines("2026-10-16"), [], "already expired: the policy for that is separate");
  assert.deepEqual(lines(undefined), [], "no expiry, no warning");
  assert.equal(DEFAULT_WARN_DAYS, 14);
});

test("without a reference day nothing is compared, and an unmatched or unrelated entry never warns", () => {
  const near = entryFor({ expires: "2026-10-18" });
  assert.deepEqual(applyBaseline(result, baselineWith(near)).diagnostics.filter((line) => line.startsWith("Baseline suppression")), []);
  const gone = { ...near, fingerprint: "b".repeat(64) };
  assert.deepEqual(applyBaseline(result, baselineWith(gone), { today: "2026-10-17" }).diagnostics, ["Suppressed 0 findings from the baseline."]);
});

test("warnings are listed soonest first, one per distinct suppression", () => {
  const sorted = expiringSuppressions([entryFor({ expires: "2026-10-30" }), entryFor({ expires: "2026-10-20", ruleId: "b" }), entryFor({ expires: "2026-10-20", ruleId: "a" })] as never[], "2026-10-17", 14);
  assert.deepEqual(sorted.map((entry) => [entry.expires, entry.ruleId, entry.daysLeft]), [["2026-10-20", "a", 3], ["2026-10-20", "b", 3], ["2026-10-30", "example", 13]]);
  const duplicated = applyBaseline(result, baselineWith(entryFor({ expires: "2026-10-20" }), entryFor({ expires: "2026-10-20" })), { today: "2026-10-17" });
  assert.equal(duplicated.diagnostics.filter((line) => line.startsWith("Baseline suppression")).length, 1);
});

test("the CLI warns about a suppression that is about to expire, for the day it is told, and rejects bad options", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const directory = await mkdtemp(join(tmpdir(), "evergreen-expiry-"));
  try {
    const { builtInDetectors } = await import("../src/detectors/index.js");
    const { scanRepository } = await import("../src/engine.js");
    const scan = await scanRepository(smoke, builtInDetectors);
    const path = join(directory, "baseline.json");
    await writeFile(path, JSON.stringify(createBaseline(scan, { owner: "platform", reason: "tracked", expires: "2026-11-05" })));
    const run = (...extra: string[]) => promisify(execFile)(process.execPath, [resolve("dist/src/cli.js"), "scan", smoke, "--baseline", path, "--json", ...extra]);
    const warnings = async (...extra: string[]) => (JSON.parse((await run(...extra)).stdout) as { diagnostics: string[] }).diagnostics.filter((line) => line.startsWith("Baseline suppression"));
    assert.equal((await warnings("--today", "2026-10-25")).length, 4, "ten days before: all four suppressions");
    assert.deepEqual(await warnings("--today", "2026-10-01"), [], "five weeks before: outside the default window");
    assert.equal((await warnings("--today", "2026-10-01", "--baseline-warn-days", "60")).length, 4, "a window of sixty days");
    await assert.rejects(run("--today", "yesterday"), (error: { code: number; stderr: string }) => error.code === 2 && /--today must be a date/.test(error.stderr));
    await assert.rejects(run("--baseline-warn-days", "-3"), (error: { code: number }) => error.code === 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
