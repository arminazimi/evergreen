import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { renderStatusCard } from "../src/status-card.js";

type Input = Pick<ScanResult, "findings" | "data">;

const finding = (severity: Severity, deadline?: string) => ({ severity, deadline }) as unknown as Finding;
const data = (overrides: Partial<NonNullable<ScanResult["data"]>> = {}): NonNullable<ScanResult["data"]> => ({
  source: "bundled",
  version: "2026.10.1",
  createdAt: null,
  reviewedThrough: "2026-10-01",
  ageDays: 12,
  stale: false,
  ...overrides,
});
const card = (findings: Finding[], info?: NonNullable<ScanResult["data"]>, name?: string) =>
  renderStatusCard({ findings, data: info } as Input, name === undefined ? {} : { repository: name });

test("identical input renders byte-identical output", () => {
  const input = { findings: [finding("high", "2027-01-01"), finding("low", "2026-12-01")], data: data() } as Input;
  assert.equal(renderStatusCard(input), renderStatusCard(input));
  assert.equal(card([finding("high", "2027-01-01")], data()), card([finding("high", "2027-01-01")], data()));
});

test("the card reports findings, the earliest deadline, and data age", () => {
  const output = card([finding("low", "2028-05-01"), finding("high", "2026-12-01")], data({ ageDays: 1 }), "acme/widgets");
  assert.match(output, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(output, /<title id="status-title">evergreen status for acme\/widgets<\/title>/);
  assert.match(output, /2 high/);
  assert.match(output, />2<\/text>/);
  assert.match(output, />2026-12-01<\/text>/);
  assert.match(output, /v2026\.10\.1 · reviewed 2026-10-01 · 1 day old/);
  assert.match(output, /role="img" aria-labelledby="status-title status-desc"/);
});

test("an empty repository reads clean with no dated work and no data", () => {
  const output = card([]);
  assert.match(output, />clean</);
  assert.match(output, />not dated</);
  assert.match(output, />not reported</);
});

test("stale data is called out", () => {
  const output = card([], data({ ageDays: 45, stale: true }));
  assert.match(output, /45 days old · stale/);
  assert.match(output, /Data v2026\.10\.1 · reviewed 2026-10-01 · 45 days old · stale\./);
});

test("hostile labels and data versions are escaped", () => {
  const hostile = `<script>alert("x")</script> & 'quoted'`;
  const output = card([finding("high")], data({ version: hostile }), hostile);
  assert.doesNotMatch(output, /<script/i);
  assert.match(output, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &apos;quoted&apos;/);
});

test("the CLI renders a card for the scanned path", async () => {
  const run = promisify(execFile);
  const cli = resolve("dist/src/cli.js");
  const { stdout } = await run(process.execPath, [cli, "status-card", resolve("tests/fixtures/smoke"), "--name", "acme/widgets"]);
  assert.match(stdout, /^<svg /);
  assert.match(stdout, /evergreen status for acme\/widgets/);
  await assert.rejects(run(process.execPath, [cli, "status-card", "--bogus"]), (error: { code?: number }) => error.code === 2);
});

test("social size is 1200x630 with brand fonts and no external references", () => {
  const output = renderStatusCard(
    { findings: [finding("high", "2026-12-01")], data: data({ ageDays: 1 }) } as Input,
    { repository: "acme/widgets", size: "social" },
  );
  assert.match(output, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200" height="630" viewBox="0 0 1200 630"/);
  assert.match(output, /font-family="Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"/);
  assert.match(output, /<title id="status-title">evergreen status for acme\/widgets<\/title>/);
  assert.match(output, />1 high</);
  assert.match(output, />2026-12-01</);
  assert.equal([...output.matchAll(/https?:\/\//g)].length, 1); // xmlns only
  assert.doesNotMatch(output, /@import|url\(|xlink:href|\shref="/i);
  assert.equal(
    renderStatusCard({ findings: [], data: data() } as Input, { size: "social" }),
    renderStatusCard({ findings: [], data: data() } as Input, { size: "social" }),
  );
});
