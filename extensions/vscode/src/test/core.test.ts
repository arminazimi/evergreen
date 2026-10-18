import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildContextArgs,
  buildScanArgs,
  CLI_MISSING_MESSAGE,
  isSafeForWindowsShell,
  parseScanResult,
} from "../core/scan.js";

const minimalScan = {
  schemaVersion: "evergreen.scan.v1",
  root: "/repo",
  scannedAt: "2026-10-18T00:00:00.000Z",
  findings: [],
  diagnostics: [],
};

test("buildScanArgs asks for JSON for a folder", () => {
  assert.deepEqual(buildScanArgs("/repo"), ["scan", "--json", "/repo"]);
});

test("buildContextArgs names the finding and the scan root", () => {
  assert.deepEqual(buildContextArgs("rule:file:3", "/repo"), [
    "context",
    "rule:file:3",
    "/repo",
  ]);
});

test("parseScanResult accepts a valid v1 result", () => {
  const parsed = parseScanResult(JSON.stringify(minimalScan));
  assert.equal(parsed.schemaVersion, "evergreen.scan.v1");
  assert.deepEqual(parsed.findings, []);
});

test("parseScanResult rejects invalid JSON", () => {
  assert.throws(() => parseScanResult("{"), /invalid JSON/);
});

test("parseScanResult rejects another schema version", () => {
  assert.throws(
    () =>
      parseScanResult(
        JSON.stringify({ ...minimalScan, schemaVersion: "evergreen.scan.v2" }),
      ),
    /Unsupported Evergreen scan schema/,
  );
});

test("parseScanResult rejects a result without a findings array", () => {
  assert.throws(
    () =>
      parseScanResult(
        JSON.stringify({ ...minimalScan, findings: "none" }),
      ),
    /no findings array/,
  );
});

test("isSafeForWindowsShell allows ordinary paths and rejects shell characters", () => {
  assert.equal(isSafeForWindowsShell("C:\\repo\\evergreen.cmd"), true);
  for (const unsafe of ["a&b", "a|b", "100%", '"quoted"', "line\nbreak", "a!b"]) {
    assert.equal(isSafeForWindowsShell(unsafe), false, unsafe);
  }
});

test("the missing CLI message says how to install it", () => {
  assert.match(CLI_MISSING_MESSAGE, /npm install -g evergreen-deprecation/);
});
