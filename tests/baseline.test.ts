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
