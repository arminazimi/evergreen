import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { badgeState, renderBadgeEndpoint } from "../src/badge.js";
import { runCli } from "./cli-runner.js";

const endpoint = (findings: unknown[], stale = false) =>
  JSON.parse(renderBadgeEndpoint({ findings, data: { stale } } as never)) as Record<string, unknown>;

test("the endpoint matches the shields.io schema for every badge state", () => {
  const states = [
    { result: endpoint([]), message: "clean" },
    { result: endpoint([], true), message: "stale" },
    { result: endpoint([{ severity: "high" }]), message: "1 high" },
    { result: endpoint([{ severity: "low" }, { severity: "critical" }]), message: "2 critical" },
  ];
  for (const { result, message } of states) {
    assert.equal(result.schemaVersion, 1);
    assert.equal(result.label, "evergreen");
    assert.equal(result.message, message);
    assert.match(result.color as string, /^#[0-9A-F]{6}$/i);
    assert.equal(result.labelColor, "#23423A");
  }
});

test("the endpoint reuses the SVG badge state", () => {
  const result = { findings: [{ severity: "medium" }], data: { stale: true } } as never;
  const state = badgeState(result);
  const json = JSON.parse(renderBadgeEndpoint(result)) as Record<string, unknown>;
  assert.equal(json.message, state.message);
  assert.equal(json.color, state.color);
});

test("the endpoint records an expired failure", () => {
  const json = JSON.parse(renderBadgeEndpoint({ findings: [{ severity: "high" }], data: {} } as never, true)) as Record<
    string,
    unknown
  >;
  assert.equal(json.message, "1 high · expired");
});

test("the CLI prints endpoint JSON for the scanned path", async () => {
  const result = await runCli(["badge", resolve("tests/fixtures/smoke"), "--shields"]);
  assert.equal(result.code, 0);
  const json = JSON.parse(result.stdout) as Record<string, unknown>;
  assert.equal(json.schemaVersion, 1);
  assert.equal(json.label, "evergreen");
  assert.equal(typeof json.message, "string");
  assert.equal(typeof json.color, "string");
});

test("the CLI rejects mixing --shields with snippet flags", async () => {
  assert.equal((await runCli(["badge", "--shields", "--snippet", "markdown"])).code, 2);
});
