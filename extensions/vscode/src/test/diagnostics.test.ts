import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  asFindingRef,
  findingsToDiagnostics,
  locationToRange,
  mapSeverity,
} from "../core/diagnostics.js";
import type { MappedDiagnostic } from "../core/diagnostics.js";
import { parseScanResult } from "../core/scan.js";
import type { Finding, ScanResult } from "../core/scan.js";

const fixture = parseScanResult(
  readFileSync(
    join(__dirname, "..", "..", "src", "test", "fixtures", "dotnet-positive.json"),
    "utf8",
  ),
);
const fixtureRoot = resolve("fixture-root");
const mapped = findingsToDiagnostics(fixture, fixtureRoot);
const byId = new Map(
  mapped.map((diagnostic) => [diagnostic.findingId, diagnostic]),
);

function diagnostic(id: string): MappedDiagnostic {
  const found = byId.get(id);
  assert.ok(found, `missing diagnostic ${id}`);
  return found;
}

function finding(overrides: Partial<Finding> & Pick<Finding, "location">): Finding {
  return {
    id: "rule:file:1",
    ruleId: "rule",
    detector: "test",
    title: "Title",
    summary: "Summary",
    severity: "medium",
    sources: [{ title: "Source", url: "https://example.com/source" }],
    ...overrides,
  };
}

function scanWith(findings: Finding[]): ScanResult {
  return {
    schemaVersion: "evergreen.scan.v1",
    root: ".",
    scannedAt: "2026-10-18T00:00:00.000Z",
    findings,
    diagnostics: [],
  };
}

test("maps the recorded dotnet CLI output to one diagnostic per finding", () => {
  assert.equal(fixture.findings.length, 8);
  assert.equal(mapped.length, 8);
});

test("maps a high-severity finding to its exact path and 0-based line", () => {
  const runtime = diagnostic("dotnet.runtime.end-of-support-3.1:app/App.csproj:5");
  assert.equal(runtime.path, join(fixtureRoot, "app", "App.csproj"));
  assert.equal(runtime.line, 4);
  assert.equal(runtime.character, 0);
  assert.equal(runtime.endCharacter, 1);
  assert.equal(runtime.severity, "error");
  assert.equal(runtime.code, "dotnet.runtime.end-of-support-3.1");
  assert.equal(
    runtime.codeTarget,
    "https://dotnet.microsoft.com/platform/support/policy/dotnet-core",
  );
  assert.equal(runtime.root, fixtureRoot);
  assert.match(runtime.message, /^\.NET Core 3\.1 is no longer supported\n\n/);
});

test("maps a medium-severity finding to a warning and links its first source", () => {
  const storage = diagnostic(
    "dotnet.package.windowsazure-storage.deprecated:app/App.csproj:10",
  );
  assert.equal(storage.path, join(fixtureRoot, "app", "App.csproj"));
  assert.equal(storage.line, 9);
  assert.equal(storage.severity, "warning");
  assert.equal(storage.code, "dotnet.package.windowsazure-storage.deprecated");
  assert.equal(
    storage.codeTarget,
    "https://www.nuget.org/packages/WindowsAzure.Storage",
  );
});

test("maps a low-severity finding to information", () => {
  const runtime = diagnostic("dotnet.runtime.end-of-support-8.0:lib/Lib.fsproj:4");
  assert.equal(runtime.path, join(fixtureRoot, "lib", "Lib.fsproj"));
  assert.equal(runtime.line, 3);
  assert.equal(runtime.severity, "information");
});

test("keeps two findings on one file as separate diagnostics", () => {
  const lib = mapped.filter(
    (entry) => entry.path === join(fixtureRoot, "lib", "Lib.fsproj"),
  );
  assert.equal(lib.length, 2);
  assert.deepEqual(
    lib.map((entry) => entry.severity).sort(),
    ["error", "information"],
  );
  assert.deepEqual(
    lib.map((entry) => entry.line),
    [3, 3],
  );
});

test("maps every severity exactly as the extension requires", () => {
  assert.equal(mapSeverity("critical"), "error");
  assert.equal(mapSeverity("high"), "error");
  assert.equal(mapSeverity("medium"), "warning");
  assert.equal(mapSeverity("low"), "information");
  assert.equal(mapSeverity("info"), "information");
  assert.equal(mapSeverity("something-new"), "warning");
});

test("converts 1-based lines and columns, and falls back to the first line", () => {
  assert.deepEqual(locationToRange({ path: "a", line: 3, column: 5 }), {
    line: 2,
    character: 4,
    endCharacter: 5,
  });
  assert.deepEqual(locationToRange({ path: "a" }), {
    line: 0,
    character: 0,
    endCharacter: 1,
  });
  assert.deepEqual(locationToRange({ path: "a", line: 1 }), {
    line: 0,
    character: 0,
    endCharacter: 1,
  });
});

test("skips a finding whose relative path escapes the workspace folder", () => {
  const escaped = findingsToDiagnostics(
    scanWith([finding({ location: { path: "../outside.txt", line: 2 } })]),
    fixtureRoot,
  );
  assert.deepEqual(escaped, []);
});

test("uses only an http source and only the first one as the code link", () => {
  const [first] = findingsToDiagnostics(
    scanWith([
      finding({
        location: { path: "App.csproj", line: 1 },
        sources: [
          { title: "First", url: "https://first.example/source" },
          { title: "Second", url: "https://second.example/source" },
        ],
      }),
    ]),
    fixtureRoot,
  );
  assert.equal(first?.codeTarget, "https://first.example/source");

  const [unsafe] = findingsToDiagnostics(
    scanWith([
      finding({
        location: { path: "App.csproj", line: 1 },
        sources: [{ title: "Local", url: "file:///etc/passwd" }],
      }),
    ]),
    fixtureRoot,
  );
  assert.equal(unsafe?.codeTarget, undefined);
});

test("accepts absolute finding paths", () => {
  const path = join(fixtureRoot, "absolute.csproj");
  const [absolute] = findingsToDiagnostics(
    scanWith([finding({ location: { path, line: 1 } })]),
    fixtureRoot,
  );
  assert.equal(absolute?.path, path);
});

test("recognizes a finding reference from a command argument", () => {
  assert.deepEqual(asFindingRef({ findingId: "rule:file:1", root: "/repo" }), {
    findingId: "rule:file:1",
    root: "/repo",
  });
  assert.equal(asFindingRef({ findingId: "rule:file:1" }), undefined);
  assert.equal(asFindingRef({ root: "/repo" }), undefined);
  assert.equal(asFindingRef(null), undefined);
  assert.equal(asFindingRef("rule:file:1"), undefined);
});
