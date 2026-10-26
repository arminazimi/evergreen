import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { renderRdjson } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

function finding(ruleId: string, path: string, line: number | undefined, severity: Severity = "high"): Finding {
  return {
    id: `${ruleId}:${path}:${line ?? ""}`,
    ruleId,
    detector: ruleId.split(".")[0]!,
    title: `Title of ${ruleId}`,
    summary: `Summary at ${path}`,
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

test("a scan without findings is an empty rdjson result", () => {
  const rdjson = JSON.parse(renderRdjson(scan([])));
  assert.deepEqual(rdjson, { source: { name: "Evergreen", url: "https://github.com/arminazimi/evergreen" }, diagnostics: [] });
});

test("each finding becomes one diagnostic with path, range, severity, and rule code, sorted like SARIF", () => {
  const rdjson = JSON.parse(renderRdjson(scan([
    finding("npm.package.request.deprecated", "package.json", 12, "high"),
    finding("python.runtime.eol", ".python-version", undefined, "info"),
  ])));
  assert.deepEqual(rdjson.diagnostics, [
    {
      message: "Summary at .python-version",
      location: { path: ".python-version" },
      severity: "INFO",
      code: { value: "python.runtime.eol", url: "https://example.com/source" },
    },
    {
      message: "Summary at package.json",
      location: { path: "package.json", range: { start: { line: 12 } } },
      severity: "ERROR",
      code: { value: "npm.package.request.deprecated", url: "https://example.com/source" },
    },
  ]);
});

test("severity maps to reviewdog severities", () => {
  const severities = (["critical", "high", "medium", "low", "info"] as const).map((severity) => {
    const rdjson = JSON.parse(renderRdjson(scan([finding("npm.package.request.deprecated", "package.json", 1, severity)])));
    return rdjson.diagnostics[0].severity;
  });
  assert.deepEqual(severities, ["ERROR", "ERROR", "WARNING", "INFO", "INFO"]);
});

test("a finding without a line has no range, and a column is written only with a line", () => {
  const withoutLine = JSON.parse(renderRdjson(scan([finding("python.runtime.eol", ".python-version", undefined)])));
  assert.equal("range" in withoutLine.diagnostics[0].location, false);
  const withColumn = { ...finding("npm.package.request.deprecated", "package.json", 4), location: { path: "package.json", line: 4, column: 9 } };
  const rdjson = JSON.parse(renderRdjson(scan([withColumn])));
  assert.deepEqual(rdjson.diagnostics[0].location.range, { start: { line: 4, column: 9 } });
});

test("the output does not depend on input order and contains nothing machine-specific", () => {
  const findings = [
    finding("npm.package.request.deprecated", "package.json", 12),
    finding("github-actions.checkout.node20", ".github/workflows/ci.yml", 7),
    finding("github-actions.setup-node.node20", ".github/workflows/ci.yml", 9),
  ];
  const forward = renderRdjson(scan(findings));
  assert.equal(renderRdjson(scan([...findings].reverse())), forward);
  assert.equal(forward.includes("/machine/specific/root"), false);
  assert.equal(forward.includes("2026-10-16"), false);
});

test("scan --format rdjson prints rdjson, and it is refused for other commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-rdjson-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v3\n");
    const { stdout } = await execute(process.execPath, [cli, "scan", root, "--format", "rdjson"]);
    const rdjson = JSON.parse(stdout);
    assert.equal(rdjson.diagnostics[0].code.value, "github-actions.checkout.node20");
    assert.equal(rdjson.diagnostics[0].location.path, ".github/workflows/ci.yml");
    assert.equal(rdjson.diagnostics[0].location.range.start.line, 4);

    await assert.rejects(execute(process.execPath, [cli, "scan", root, "--format", "xml"]), (error: { code: number; stderr: string }) => error.code === 2 && /expected text, json, markdown, sarif, rdjson, codequality, compact, or html/.test(error.stderr));
    await assert.rejects(execute(process.execPath, [cli, "check", "pkg:npm/request", "--format", "rdjson"]), (error: { code: number }) => error.code === 2);
    await assert.rejects(execute(process.execPath, [cli, "explain", "x", root, "--format", "rdjson"]), (error: { code: number; stderr: string }) => error.code === 2 && /--format rdjson is only available for the scan command/.test(error.stderr));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function rdjsonValidator() {
  const { Ajv } = await import("ajv");
  const schema = JSON.parse(await readFile(resolve("schemas/vendor/rdjson-diagnostic-result.json"), "utf8")) as Record<string, unknown>;
  return new Ajv({ strict: false, validateSchema: false, allErrors: true }).compile(schema);
}

test("the vendored reviewdog schema is the published file", async () => {
  const text = await readFile(resolve("schemas/vendor/rdjson-diagnostic-result.json"));
  const readme = await readFile(resolve("schemas/vendor/README.md"), "utf8");
  assert.ok(readme.includes(createHash("sha256").update(text).digest("hex")), "schemas/vendor/README.md must record the file's SHA-256");
});

test("rdjson output validates against the reviewdog DiagnosticResult schema", async () => {
  const validate = await rdjsonValidator();
  const sample = JSON.parse(await readFile(resolve("tests/fixtures/sarif-scan.json"), "utf8")) as ScanResult;
  const cases: Record<string, ScanResult> = {
    "no findings": scan([]),
    "one finding without a line": scan([finding("python.runtime.eol", ".python-version", undefined, "info")]),
    "many severities": scan((["critical", "high", "medium", "low", "info"] as const).map((severity, index) => finding(`npm.package.p${index}.deprecated`, "package.json", index + 1, severity))),
    "sample scan": sample,
  };
  for (const [name, result] of Object.entries(cases)) {
    const rdjson = JSON.parse(renderRdjson(result));
    assert.equal(validate(rdjson), true, `${name}: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
  }
});

test("the schema check actually rejects invalid rdjson", async () => {
  const validate = await rdjsonValidator();
  const rdjson = JSON.parse(renderRdjson(scan([finding("npm.package.request.deprecated", "package.json", 3)])));
  rdjson.diagnostics[0].severity = "bogus";
  assert.equal(validate(rdjson), false);
});
