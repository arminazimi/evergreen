import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { buildGlanceFacts, GLANCE_MARK, GLANCE_MARK_COLUMNS, GLANCE_MARK_MIN_COLUMNS, renderGlance } from "../src/glance.js";
import type { GlanceFacts, GlanceInput } from "../src/glance.js";
import { severityValues } from "../src/domain.js";
import type { Finding, ScanResult, Severity } from "../src/domain.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

let sequence = 0;
const finding = (overrides: Partial<Finding> = {}): Finding => ({
  id: `id-${++sequence}`,
  ruleId: "demo.rule",
  detector: "npm",
  title: "Demo finding",
  summary: "A demo finding.",
  severity: "medium",
  confidence: "high",
  location: { path: "package.json", line: 1 },
  sources: [],
  ...overrides,
}) as Finding;

const emptyCoverage = { ecosystems: [], filesRead: [], unsupportedFiles: [] };
const scan = (findings: Finding[], coverage?: ScanResult["coverage"]): GlanceInput =>
  (coverage === undefined && findings.length > 0 ? { findings } : { findings, coverage: coverage ?? emptyCoverage });

const factsOf = (findings: Finding[], asOf = "2026-10-25"): GlanceFacts =>
  buildGlanceFacts(scan(findings), { repository: "acme/widgets", asOf });

test("the mark stays within its column budget and uses block characters only", () => {
  assert.ok(GLANCE_MARK.length <= 12, "the mark is at most 12 lines");
  assert.equal(GLANCE_MARK_COLUMNS, Math.max(...GLANCE_MARK.map((line) => line.length)));
  assert.ok(GLANCE_MARK_COLUMNS <= 24, "the mark leaves room for the facts");
  for (const line of GLANCE_MARK) assert.match(line, /^[█ ]*$/);
});

test("facts tally findings by severity exactly as scan --json reports them", () => {
  const facts = factsOf([
    finding({ severity: "high" }),
    finding({ severity: "high" }),
    finding({ severity: "critical" }),
    finding({ severity: "info" }),
  ]);
  assert.equal(facts.findings.total, 4);
  assert.deepEqual(facts.findings.bySeverity, { info: 1, low: 0, medium: 0, high: 2, critical: 1 });
});

test("ecosystems come from the covered detectors with their manifest maturity", () => {
  const facts = buildGlanceFacts(
    scan([finding({ detector: "npm" })], { ecosystems: ["npm", "python"], filesRead: [], unsupportedFiles: [] }),
    { repository: "acme/widgets", asOf: "2026-10-25" },
  );
  assert.deepEqual(facts.ecosystems, [
    { id: "nodejs", maturity: "stable" },
    { id: "npm", maturity: "stable" },
    { id: "python", maturity: "stable" },
  ]);
  const fromFindings = factsOf([finding({ detector: "go" })]);
  assert.deepEqual(fromFindings.ecosystems, [{ id: "go", maturity: "stable" }]);
});

test("next is the earliest deadline on or after the as-of date; ended is the oldest before it", () => {
  const findings = [
    finding({ ruleId: "a.rule", deadline: "2028-01-01" }),
    finding({ ruleId: "b.rule", deadline: "2027-04-30" }),
    finding({ ruleId: "c.rule", deadline: "2023-06-01" }),
  ];
  const facts = factsOf(findings);
  assert.deepEqual(facts.nextDeadline, { date: "2027-04-30", title: "Demo finding", ruleId: "b.rule" });
  assert.deepEqual(facts.oldestEnded, { date: "2023-06-01", title: "Demo finding", ruleId: "c.rule" });
  const beforeAll = factsOf(findings, "2023-01-01");
  assert.equal(beforeAll.nextDeadline?.date, "2023-06-01");
  assert.equal(beforeAll.oldestEnded, undefined);
  const afterAll = factsOf(findings, "2029-01-01");
  assert.equal(afterAll.nextDeadline, undefined);
  assert.equal(afterAll.oldestEnded?.date, "2023-06-01");
});

test("absent facts are omitted from the JSON document, never null", () => {
  const facts = factsOf([]);
  assert.equal(facts.nextDeadline, undefined);
  assert.equal(facts.oldestEnded, undefined);
  assert.equal(facts.data, undefined);
  const parsed = JSON.parse(JSON.stringify(facts)) as Record<string, unknown>;
  assert.equal(parsed.schemaVersion, "evergreen.glance.v1");
  assert.ok(!("nextDeadline" in parsed));
  assert.ok(!("oldestEnded" in parsed));
  assert.ok(!("data" in parsed));
  const withData = buildGlanceFacts(
    { findings: [], coverage: emptyCoverage, data: { source: "bundled", version: "2026.10.1", createdAt: null, reviewedThrough: "2026-10-01", ageDays: 12, stale: false } },
    { repository: "acme/widgets", asOf: "2026-10-25" },
  );
  assert.deepEqual(withData.data, { version: "2026.10.1", ageDays: 12, stale: false });
});

test("at 120 columns the card shows the mark beside the facts and stays inside the width", () => {
  const facts = factsOf([
    finding({ ruleId: "a.rule", deadline: "2027-04-30", title: "Node.js 22 is end-of-life", severity: "high" }),
    finding({ ruleId: "b.rule", deadline: "2023-06-01", title: "Node.js 19 is end-of-life", severity: "low" }),
  ]);
  const output = renderGlance(facts, { columns: 120 });
  const lines = output.split("\n");
  assert.ok(output.startsWith(GLANCE_MARK[0]!), "the mark leads the card");
  assert.ok(lines.length >= GLANCE_MARK.length, "mark and fact rows share lines");
  assert.match(output, /repo +acme\/widgets/);
  assert.match(output, /findings +2/);
  assert.match(output, /high +█ 1/);
  assert.match(output, /next +2027-04-30 +Node\.js 22 is end-of-life/);
  assert.match(output, /ended +2023-06-01 +Node\.js 19 is end-of-life/);
  for (const line of lines) assert.ok([...line].length <= 120, `line exceeds 120 columns: ${line}`);
  const factColumn = lines.find((line) => line.includes("acme/widgets"))!.indexOf("acme/widgets");
  assert.ok(factColumn >= GLANCE_MARK_COLUMNS, "facts start right of the mark");
});

test(`at ${GLANCE_MARK_MIN_COLUMNS - 1} columns the mark is dropped and the facts keep the full width`, () => {
  const facts = factsOf([finding({ deadline: "2027-04-30", title: "Node.js 22 is end-of-life" })]);
  const output = renderGlance(facts, { columns: GLANCE_MARK_MIN_COLUMNS - 1 });
  assert.ok(!output.includes(GLANCE_MARK[0]!), "no mark under 80 columns");
  assert.match(output, /^repo +acme\/widgets/m);
  for (const line of output.split("\n")) assert.ok([...line].length <= GLANCE_MARK_MIN_COLUMNS - 1);
});

test("exactly 80 columns still shows the mark", () => {
  const output = renderGlance(factsOf([]), { columns: GLANCE_MARK_MIN_COLUMNS });
  assert.ok(output.startsWith(GLANCE_MARK[0]!));
});

test("a repository with no findings reads All clear", () => {
  const output = renderGlance(factsOf([]), { columns: 120 });
  assert.match(output, /findings +All clear\./);
  assert.doesNotMatch(output, /█ \d/);
});

test("long values wrap inside the fact column", () => {
  const facts = buildGlanceFacts(
    scan([finding({ detector: "go" })], { ecosystems: ["go", "python", "npm"], filesRead: [], unsupportedFiles: [] }),
    { repository: "acme/widgets", asOf: "2026-10-25" },
  );
  const narrow = renderGlance(facts, { columns: 80 });
  const lines = narrow.split("\n");
  assert.ok(lines.filter((line) => line.includes("stable")).length >= 2, "the ecosystem list wraps");
  const continuation = lines.findIndex((line, index) => index > 0 && line.includes("python stable"));
  assert.ok(continuation !== -1, "a wrapped ecosystem line exists");
  assert.ok(lines[continuation]!.indexOf("python stable") >= GLANCE_MARK_COLUMNS, "continuations align at the fact column");
  for (const line of lines) assert.ok([...line].length <= 80, `line exceeds 80 columns: ${line}`);
});

test("color colors the mark and the severity blocks; plain output has no escape codes", () => {
  const facts = factsOf([finding({ severity: "critical" }), finding({ severity: "low" })]);
  const plain = renderGlance(facts, { columns: 120 });
  assert.doesNotMatch(plain, /\u001b/);
  const colored = renderGlance(facts, { columns: 120, color: true });
  assert.match(colored, /\u001b\[32m {6}█{3} {4}█{3}\u001b\[0m/);
  assert.match(colored, /\u001b\[1;31m +critical +█ 1\u001b\[0m/);
  assert.match(colored, /\u001b\[36m +low +█ 1\u001b\[0m/);
});

test("the CLI prints the card off a terminal, honors NO_COLOR, and matches scan --json counts", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-glance-"));
  roots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "22" } }));
  const run = async (...flags: string[]) => (await execute(process.execPath, [cli, "glance", root, ...flags], { env: { ...process.env, NO_COLOR: "1" } })).stdout;

  const text = await run("--as-of", "2026-10-25");
  assert.ok(text.includes(GLANCE_MARK[0]!), "the mark prints off a terminal");
  assert.match(text, /repo +evergreen-glance/);
  assert.match(text, /Node\.js 22/);
  assert.match(text, /2027-04-30/);
  assert.doesNotMatch(text, /\u001b/);

  const parsed = JSON.parse(await run("--as-of", "2026-10-25", "--json")) as GlanceFacts;
  assert.equal(parsed.schemaVersion, "evergreen.glance.v1");
  assert.equal(parsed.asOf, "2026-10-25");
  assert.ok(parsed.repository.startsWith("evergreen-glance-"));
  assert.equal(parsed.findings.total, 1);
  assert.equal(parsed.nextDeadline?.date, "2027-04-30");
  assert.equal(parsed.nextDeadline?.ruleId, "nodejs.runtime.eol-22");
  assert.equal(typeof parsed.nextDeadline?.title, "string");
  assert.ok(parsed.ecosystems.some((ecosystem) => ecosystem.id === "nodejs" && ecosystem.maturity === "stable"));
  assert.ok(typeof parsed.data?.version === "string");
  assert.ok(!("oldestEnded" in parsed));

  const scanned = JSON.parse((await execute(process.execPath, [cli, "scan", root, "--json"], { env: { ...process.env, NO_COLOR: "1" } })).stdout) as ScanResult;
  const tally = Object.fromEntries(severityValues.map((severity) => [severity, 0])) as Record<Severity, number>;
  for (const scannedFinding of scanned.findings) tally[scannedFinding.severity] += 1;
  assert.deepEqual(parsed.findings.bySeverity, tally);
  assert.equal(parsed.findings.total, scanned.findings.length);
});

test("an empty repository reads All clear end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-glance-clear-"));
  roots.push(root);
  const { stdout } = await execute(process.execPath, [cli, "glance", root], { env: { ...process.env, NO_COLOR: "1" } });
  assert.match(stdout, /findings +All clear\./);
  const parsed = JSON.parse((await execute(process.execPath, [cli, "glance", root, "--json"], { env: { ...process.env, NO_COLOR: "1" } })).stdout) as GlanceFacts;
  assert.equal(parsed.findings.total, 0);
  assert.deepEqual(parsed.ecosystems, []);
});

test("rejects a bad --as-of date and unknown flags", async () => {
  type Failure = { code: number; stderr: string };
  const bad = (await execute(process.execPath, [cli, "glance", ".", "--as-of", "not-a-date"]).catch((error: unknown) => error)) as Failure;
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--as-of must be a date/);
  const unknown = (await execute(process.execPath, [cli, "glance", ".", "--svg"]).catch((error: unknown) => error)) as Failure;
  assert.equal(unknown.code, 2);
  assert.match(unknown.stderr, /Usage: evergreen glance/);
});
