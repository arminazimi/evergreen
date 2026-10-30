import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import type { DataInfo, Finding, ScanResult, Severity } from "../src/domain.js";
import { RECEIPT_SCHEMA, buildReceipt } from "../src/receipt.js";

interface FindingOptions {
  rule?: string;
  title?: string;
  severity?: Severity;
  path?: string;
  line?: number | null;
  commands?: string[];
}

function finding(id: string, options: FindingOptions = {}): Finding {
  const { rule = "demo.eol", title = `Title ${id}`, severity = "high", path = `${id}.yml`, line = 1, commands = [] } = options;
  return {
    id,
    ruleId: rule,
    detector: "demo",
    title,
    summary: `Summary ${id}`,
    severity,
    confidence: "exact",
    location: { path, ...(line === null ? {} : { line }) },
    sources: [],
    ...(commands.length === 0
      ? {}
      : { migration: { constraints: [], steps: [], verification: commands.map((command) => ({ command, purpose: `run ${command}` })) } }),
  };
}

function scan(findings: Finding[], data?: DataInfo): ScanResult {
  return {
    schemaVersion: "evergreen.scan.v1",
    root: "/repo",
    scannedAt: "2026-10-30T00:00:00.000Z",
    findings,
    diagnostics: [],
    ...(data === undefined ? {} : { data }),
  };
}

const bundled = (version: string): DataInfo => ({ source: "bundled", version, createdAt: null, reviewedThrough: "2026-10-30", ageDays: 0, stale: false });

async function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  return ajv.compile(JSON.parse(await readFile(resolve("schemas/receipt.v1.schema.json"), "utf8")) as object);
}

test("buildReceipt splits the comparison into resolved, remaining, and introduced findings", () => {
  const kept = finding("b", { rule: "demo.retired", severity: "medium", path: "package.json", line: 7 });
  const receipt = buildReceipt(scan([finding("a"), kept]), scan([kept, finding("c")]));

  assert.equal(receipt.schema, RECEIPT_SCHEMA);
  assert.deepEqual(receipt.counts, { resolved: 1, remaining: 1, introduced: 1 });
  assert.deepEqual(receipt.resolved, [{ id: "a", rule: "demo.eol", title: "Title a", severity: "high", path: "a.yml", line: 1 }]);
  assert.deepEqual(receipt.remaining, [{ id: "b", rule: "demo.retired", title: "Title b", severity: "medium", path: "package.json", line: 7 }]);
  assert.deepEqual(receipt.introduced.map((entry) => entry.id), ["c"]);
});

test("identical scans leave every finding in remaining", () => {
  const findings = [finding("b"), finding("a")];
  const receipt = buildReceipt(scan(findings), scan(findings));

  assert.deepEqual(receipt.counts, { resolved: 0, remaining: 2, introduced: 0 });
  assert.deepEqual(receipt.remaining.map((entry) => entry.id), ["a", "b"]);
  assert.deepEqual(receipt.resolved, []);
  assert.deepEqual(receipt.introduced, []);
});

test("an empty change over a clean repository reports nothing", () => {
  const receipt = buildReceipt(scan([]), scan([]));

  assert.deepEqual(receipt.counts, { resolved: 0, remaining: 0, introduced: 0 });
  assert.deepEqual([receipt.resolved, receipt.remaining, receipt.introduced, receipt.commands], [[], [], [], []]);
});

test("a finding without a line omits it", () => {
  const receipt = buildReceipt(scan([finding("a", { line: null })]), scan([]));

  assert.deepEqual(receipt.resolved, [{ id: "a", rule: "demo.eol", title: "Title a", severity: "high", path: "a.yml" }]);
});

test("commands are deduplicated, sorted, and recorded rather than run", () => {
  const receipt = buildReceipt(
    scan([finding("a", { commands: ["npm test", "npm run build"] }), finding("b", { commands: ["npm test"] })]),
    scan([finding("c", { commands: ["npm run lint"] })]),
  );

  assert.deepEqual(receipt.commands, [
    { command: "npm run build", purpose: "run npm run build" },
    { command: "npm run lint", purpose: "run npm run lint" },
    { command: "npm test", purpose: "run npm test" },
  ]);
});

test("output is sorted and depends only on the two scans", () => {
  const before = [finding("z"), finding("a"), finding("m", { commands: ["npm test"] })];
  const after = [finding("b"), finding("a")];
  const first = buildReceipt(scan(before), scan(after), { data: { before: bundled("2026.10.01") } });
  const second = buildReceipt(scan([...before].reverse()), scan([...after].reverse()), {
    data: { before: bundled("2026.10.01") },
  });

  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(first.resolved.map((entry) => entry.id), ["m", "z"]);
});

test("data records each scan's lifecycle data and can be supplied for either side", () => {
  const fromScans = buildReceipt(scan([], bundled("2026.10.01")), scan([], bundled("2026.10.29")));
  assert.deepEqual(fromScans.data, { before: bundled("2026.10.01"), after: bundled("2026.10.29") });

  const overridden = buildReceipt(scan([], bundled("2026.10.01")), scan([], bundled("2026.10.29")), {
    data: { before: bundled("2026.09.30"), after: null },
  });
  assert.deepEqual(overridden.data, { before: bundled("2026.09.30"), after: null });

  assert.deepEqual(buildReceipt(scan([]), scan([])).data, { before: null, after: null });
});

test("a receipt validates against schemas/receipt.v1.schema.json and rejects undeclared fields", async () => {
  const validate = await validator();
  const receipt = buildReceipt(
    scan([finding("a", { commands: ["npm test"] }), finding("b", { line: null })], bundled("2026.10.01")),
    scan([finding("c")], bundled("2026.10.29")),
  );

  assert.ok(validate(receipt), JSON.stringify(validate.errors));
  assert.equal(validate({ ...receipt, undeclared: true }), false);
  assert.equal(validate({ ...receipt, counts: { resolved: 1 } }), false);
});
