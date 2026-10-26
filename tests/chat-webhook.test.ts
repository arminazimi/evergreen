import assert from "node:assert/strict";
import { test } from "node:test";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { CHAT_MAX_FINDINGS, renderSlack, renderTeams, renderWebhook } from "../src/reporters.js";

function finding(ruleId: string, path: string, line: number | undefined, severity: Severity = "high", summary = `Summary at ${path}`): Finding {
  return {
    id: `${ruleId}:${path}:${line ?? ""}`,
    ruleId,
    detector: ruleId.split(".")[0]!,
    title: `Title of ${ruleId}`,
    summary,
    severity,
    confidence: "exact",
    location: line === undefined ? { path } : { path, line },
    sources: [{ title: "Source", url: "https://example.com/source" }],
  };
}

const scan = (findings: Finding[]): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/machine/specific/root",
  scannedAt: "2026-10-16T00:00:00.000Z",
  findings,
  diagnostics: [],
});

const many = Array.from({ length: CHAT_MAX_FINDINGS + 5 }, (_, index) => finding("npm.package.request.deprecated", `pkg-${String(index).padStart(2, "0")}/package.json`, index + 1));

test("Slack payload has a fallback text, a header, and one section per finding within Slack's limits", () => {
  const payload = JSON.parse(renderSlack(scan([finding("npm.package.request.deprecated", "package.json", 3, "critical")])));
  assert.equal(payload.text, "Evergreen: 1 finding (critical 1)");
  assert.equal(payload.blocks[0].type, "header");
  assert.ok(payload.blocks[0].text.text.length <= 150);
  assert.equal(payload.blocks[2].type, "section");
  assert.match(payload.blocks[2].text.text, /^\*critical\* Title of npm\.package\.request\.deprecated\npackage\.json:3\nSummary at package\.json/);
  assert.ok(payload.blocks.length <= 50);
});

test("Slack payload caps the listed findings and says how many were left out", () => {
  const payload = JSON.parse(renderSlack(scan(many)));
  const sections = payload.blocks.filter((block: { type: string }) => block.type === "section");
  assert.equal(sections.length, CHAT_MAX_FINDINGS + 1);
  assert.ok(payload.blocks.length <= 50);
  assert.equal(payload.blocks.at(-1).type, "context");
  assert.match(payload.blocks.at(-1).elements[0].text, /^5 more findings omitted/);
});

test("Slack payload escapes control characters and clips long section text", () => {
  const payload = JSON.parse(renderSlack(scan([finding("npm.package.request.deprecated", "a<b>&c.json", 1, "high", "x".repeat(4000))])));
  const text: string = payload.blocks[2].text.text;
  assert.ok(text.includes("a&lt;b&gt;&amp;c.json:1"));
  assert.ok(text.length <= 3000);
  assert.ok(text.endsWith("…"));
});

test("Slack payload for an empty scan still has a header and a summary", () => {
  const payload = JSON.parse(renderSlack(scan([])));
  assert.equal(payload.text, "Evergreen: no lifecycle risks found");
  assert.equal(payload.blocks.length, 2);
});

test("Teams payload is a message with a version 1.4 Adaptive Card", () => {
  const payload = JSON.parse(renderTeams(scan([finding("npm.package.request.deprecated", "package.json", 3, "high")])));
  assert.equal(payload.type, "message");
  const [attachment] = payload.attachments;
  assert.equal(attachment.contentType, "application/vnd.microsoft.card.adaptive");
  assert.equal(attachment.content.type, "AdaptiveCard");
  assert.equal(attachment.content.version, "1.4");
  const texts = attachment.content.body.map((block: { text: string }) => block.text);
  assert.ok(texts.some((text: string) => text.includes("package\\.json:3")));
});

test("Teams payload caps the listed findings and escapes Markdown in finding text", () => {
  const capped = JSON.parse(renderTeams(scan(many))).attachments[0].content.body;
  assert.ok(capped.some((block: { text: string }) => block.text.includes(`${5} more findings omitted`)));
  const escaped = JSON.parse(renderTeams(scan([finding("npm.package.request.deprecated", "*evil*.json", 1)]))).attachments[0].content.body;
  assert.ok(escaped.some((block: { text: string }) => block.text.includes("\\*evil\\*")));
});

test("webhook payload carries the schema tag, zero-filled severity counts, and stable findings", () => {
  const findings = [
    finding("npm.package.request.deprecated", "b/package.json", 2, "low"),
    finding("python.runtime.eol", ".python-version", undefined, "critical"),
    finding("npm.package.request.deprecated", "a/package.json", 1, "critical"),
  ];
  const payload = JSON.parse(renderWebhook(scan(findings)));
  assert.equal(payload.schemaVersion, "evergreen.webhook.v1");
  assert.equal(payload.source, "evergreen");
  assert.equal(payload.scannedAt, "2026-10-16T00:00:00.000Z");
  assert.deepEqual(payload.summary, { findings: 3, bySeverity: { info: 0, low: 1, medium: 0, high: 0, critical: 2 } });
  assert.deepEqual(payload.findings.map((item: { location: { path: string } }) => item.location.path), [".python-version", "a/package.json", "b/package.json"]);
  assert.deepEqual(Object.keys(payload.findings[0]).sort(), ["id", "location", "ruleId", "severity", "sources", "summary", "title"]);
});

test("webhook payload is not capped and is identical for reversed input", () => {
  const forward = renderWebhook(scan(many));
  assert.equal(JSON.parse(forward).findings.length, many.length);
  assert.equal(renderWebhook(scan([...many].reverse())), forward);
});

test("chat payloads are identical for reversed input", () => {
  const findings = [finding("npm.package.request.deprecated", "b.json", 1, "high"), finding("python.runtime.eol", "a.json", 2, "medium")];
  assert.equal(renderSlack(scan([...findings].reverse())), renderSlack(scan(findings)));
  assert.equal(renderTeams(scan([...findings].reverse())), renderTeams(scan(findings)));
});
