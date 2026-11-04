import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { runCli } from "./cli-runner.js";

const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-receipt-contract-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "18" } }));
  return root;
}

/** One finding that satisfies the scan output contract, with the named fields replaced. */
function finding(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "finding-1",
    ruleId: "nodejs.runtime.eol-18",
    detector: "nodejs",
    title: "Node.js 18 reached end of life",
    summary: "Node.js 18 is no longer supported.",
    severity: "high",
    location: { path: "package.json", line: 3 },
    sources: [],
    ...overrides,
  };
}

const validData = {
  source: "bundled",
  version: "2026.10.01",
  createdAt: null,
  reviewedThrough: "2026-10-01",
  ageDays: 0,
  stale: false,
};

let refuseIndex = 0;

/** Writes the document as a saved scan and returns the stderr of the `receipt --before` run that refused it. */
async function refuse(root: string, findings: unknown[], data?: unknown): Promise<string> {
  const before = join(root, `before-${(refuseIndex += 1)}.json`);
  await writeFile(
    before,
    JSON.stringify({
      schemaVersion: "evergreen.scan.v1",
      root: ".",
      scannedAt: "2026-10-30T00:00:00.000Z",
      diagnostics: [],
      findings,
      ...(data === undefined ? {} : { data }),
    }),
  );
  const run = await runCli(["receipt", root, "--before", before]);
  assert.equal(run.code, 2, run.stderr);
  assert.match(run.stderr, /is not an evergreen\.scan\.v1 report: /);
  return run.stderr;
}

test("receipt: a findings entry that is not an object, or misses a required string, is refused", async () => {
  const root = await repository();
  const notAnObject = await refuse(root, ["plain string"]);
  assert.ok(notAnObject.includes("findings[0] the entry is not an object."), notAnObject);
  for (const field of ["id", "ruleId", "detector", "title", "summary"]) {
    const missing = await refuse(root, [{ ...finding(), [field]: undefined }]);
    assert.ok(missing.includes(`findings[0] "${field}" is missing or not a string.`), missing);
    const notAString = await refuse(root, [finding({ [field]: 7 })]);
    assert.ok(notAString.includes(`findings[0] "${field}" is missing or not a string.`), notAString);
  }
});

test("receipt: a severity outside the scale is refused with the list of valid values", async () => {
  const root = await repository();
  for (const severity of ["urgent", undefined, 3]) {
    const stderr = await refuse(root, [finding({ severity })]);
    assert.ok(stderr.includes('findings[0] "severity" is not one of info, low, medium, high, critical.'), stderr);
  }
});

test("receipt: the location must name a path and, when it gives a line, a positive whole one", async () => {
  const root = await repository();
  for (const location of [undefined, "package.json", {}, { line: 2 }]) {
    const stderr = await refuse(root, [finding({ location })]);
    assert.ok(stderr.includes('findings[0] "location.path" is missing or not a string.'), stderr);
  }
  for (const line of [0, -1, 1.5, "3"]) {
    const stderr = await refuse(root, [finding({ location: { path: "package.json", line } })]);
    assert.ok(stderr.includes('findings[0] "location.line" is not a positive integer.'), stderr);
  }
});

test("receipt: sources must be an array", async () => {
  const root = await repository();
  for (const sources of [undefined, {}, "npm"]) {
    const stderr = await refuse(root, [finding({ sources })]);
    assert.ok(stderr.includes('findings[0] "sources" is missing or not an array.'), stderr);
  }
});

test("receipt: a migration block is checked command by command", async () => {
  const root = await repository();
  const notAnObject = await refuse(root, [finding({ migration: "drop it" })]);
  assert.ok(notAnObject.includes('findings[0] "migration" is not an object.'), notAnObject);

  const verificationNotArray = await refuse(root, [finding({ migration: { verification: "npm test" } })]);
  assert.ok(
    verificationNotArray.includes('findings[0] "migration.verification" is not an array.'),
    verificationNotArray,
  );

  for (const command of [{ command: "npm test" }, { purpose: "checks" }, "npm test"]) {
    const stderr = await refuse(root, [
      finding({ migration: { verification: [{ command: "npm test", purpose: "proves it works" }, command] } }),
    ]);
    assert.ok(
      stderr.includes('findings[0] "migration.verification[1]" is not an object with command and purpose strings.'),
      stderr,
    );
  }
});

test("receipt: the data block is checked against the scan contract", async () => {
  const root = await repository();
  const notAnObject = await refuse(root, [], "data please");
  assert.ok(notAnObject.includes('"data" is not an object.'), notAnObject);

  const cases: Array<[Record<string, unknown>, string]> = [
    [{ ...validData, source: "guess" }, '"data.source" is not bundled, cache, or pinned.'],
    [{ ...validData, version: undefined }, '"data.version" is missing or not a string.'],
    [{ ...validData, createdAt: 1727654400 }, '"data.createdAt" is neither a string nor null.'],
    [{ ...validData, reviewedThrough: undefined }, '"data.reviewedThrough" is missing or not a string.'],
    [{ ...validData, ageDays: -1 }, '"data.ageDays" is not a non-negative integer.'],
    [{ ...validData, ageDays: 1.5 }, '"data.ageDays" is not a non-negative integer.'],
    [{ ...validData, stale: "yes" }, '"data.stale" is missing or not a boolean.'],
  ];
  for (const [data, message] of cases) {
    const stderr = await refuse(root, [], data);
    assert.ok(stderr.includes(message), stderr);
  }
});

test("receipt: a findings entry that satisfies the contract is accepted, migration block included", async () => {
  const root = await repository();
  const before = join(root, "before-ok.json");
  await writeFile(
    before,
    JSON.stringify({
      schemaVersion: "evergreen.scan.v1",
      root: ".",
      scannedAt: "2026-10-30T00:00:00.000Z",
      diagnostics: [],
      data: validData,
      findings: [
        finding({
          sources: [{ title: "Node.js release schedule", url: "https://nodejs.org/en/about/previous-releases" }],
          migration: {
            suggested: ["node --version"],
            verification: [{ command: "npm ls", purpose: "confirms the installed tree" }],
          },
        }),
      ],
    }),
  );
  const run = await runCli(["receipt", root, "--before", before, "--format", "json"]);
  assert.equal(run.code, 0, run.stderr);
  const receipt = JSON.parse(run.stdout) as { schema: string; counts: { resolved: number } };
  assert.equal(receipt.schema, "evergreen.receipt.v1");
  assert.equal(receipt.counts.resolved, 1);
});
