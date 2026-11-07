import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import {
  REPORTER_API_VERSION,
  SCAN_REPORTERS,
  assertReporterContract,
  formatCommandGates,
  formatExpectedList,
  getScanReporter,
  renderCodeQuality,
  renderCompact,
  renderJson,
  renderJunit,
  renderMarkdown,
  renderRdjson,
  renderSarif,
  renderScanMermaid,
  renderSlack,
  renderTeams,
  renderText,
  renderWebhook,
  scanOnlyFormatExtras,
} from "../src/reporters.js";
import type { Reporter } from "../src/reporters/shared.js";

const emptyScan = (): ScanResult => ({
  schemaVersion: "evergreen.scan.v1",
  root: "/repository",
  scannedAt: "2026-10-27T00:00:00.000Z",
  findings: [],
  diagnostics: [],
});

test("every registered reporter declares the contract with a unique id", () => {
  assertReporterContract();
  assert.equal(SCAN_REPORTERS.length, 13);
  assert.ok(SCAN_REPORTERS.every((reporter) => reporter.apiVersion === REPORTER_API_VERSION));
  assert.equal(getScanReporter("nope"), undefined);
  assert.equal(getScanReporter("sarif")?.id, "sarif");
});

test("usage errors still list formats in the historical order", () => {
  assert.equal(formatExpectedList([]), "");
  assert.equal(formatExpectedList(["json"]), "json");
  assert.equal(formatExpectedList(["json", "text"]), "json or text");
  assert.equal(
    formatExpectedList(),
    "text, json, markdown, junit, sarif, rdjson, codequality, compact, html, slack, teams, webhook, or mermaid",
  );
});

test("assertReporterContract rejects a wrong API version or a duplicate id", () => {
  const base: Reporter = {
    apiVersion: REPORTER_API_VERSION,
    id: "probe",
    render: () => "",
  };
  assert.throws(
    () => assertReporterContract([{ ...base, apiVersion: "evergreen.reporter.v0" as typeof REPORTER_API_VERSION }]),
    /declares evergreen\.reporter\.v0/,
  );
  assert.throws(() => assertReporterContract([base, { ...base }]), /Duplicate reporter id: probe/);
});

test("scan-only extras and command gates match the pre-contract CLI rules", () => {
  assert.deepEqual(Object.fromEntries(scanOnlyFormatExtras()), {
    markdown: [],
    junit: [],
    sarif: [],
    rdjson: [],
    codequality: [],
    compact: [],
    html: ["rollup"],
    slack: [],
    teams: [],
    webhook: [],
  });
  assert.deepEqual(Object.fromEntries(formatCommandGates()), {
    mermaid: {
      commands: ["scan", "forecast"],
      rejection: "--format mermaid is only available for the scan and forecast commands.",
    },
  });
});

test("each reporter render matches the standalone render function byte-for-byte", () => {
  const result = emptyScan();
  const pairs: [string, string, string][] = [
    ["text", getScanReporter("text")!.render(result), renderText(result)],
    ["json", getScanReporter("json")!.render(result), renderJson(result)],
    ["markdown", getScanReporter("markdown")!.render(result), renderMarkdown(result)],
    ["junit", getScanReporter("junit")!.render(result), renderJunit(result)],
    ["sarif", getScanReporter("sarif")!.render(result), renderSarif(result)],
    ["rdjson", getScanReporter("rdjson")!.render(result), renderRdjson(result)],
    ["codequality", getScanReporter("codequality")!.render(result), renderCodeQuality(result)],
    ["compact", getScanReporter("compact")!.render(result), renderCompact(result)],
    ["slack", getScanReporter("slack")!.render(result), renderSlack(result)],
    ["teams", getScanReporter("teams")!.render(result), renderTeams(result)],
    ["webhook", getScanReporter("webhook")!.render(result), renderWebhook(result)],
  ];
  for (const [id, viaReporter, viaFunction] of pairs) {
    assert.equal(viaReporter, viaFunction, id);
  }
  assert.equal(
    getScanReporter("mermaid")!.render(result, { asOf: "2026-10-27" }),
    renderScanMermaid(result, "2026-10-27"),
  );
});
