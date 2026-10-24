import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import type { Finding, ScanResult, Severity } from "../src/domain.js";
import { COMPACT_MAX_BYTES, COMPACT_MAX_FINDINGS, COMPACT_MAX_LINE, renderCompact } from "../src/reporters.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

function finding(id: string, path: string, line: number | undefined, severity: Severity, replacement?: string): Finding {
  return {
    id,
    ruleId: "rule.example",
    detector: "example",
    title: "Title",
    summary: "Summary",
    severity,
    confidence: "exact",
    location: line === undefined ? { path } : { path, line },
    ...(replacement ? { replacement } : {}),
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

test("a scan without findings is one line", () => {
  assert.equal(renderCompact(scan([])), "Evergreen: 0 findings");
});

test("each finding is one line with its id, location, severity, and replacement", () => {
  const output = renderCompact(scan([finding("a:1", "src/a.ts", 3, "high", "Use fetch"), finding("b:1", "package.json", undefined, "low")]));
  assert.deepEqual(output.split("\n"), ["Evergreen: 2 findings", "a:1 src/a.ts:3 high Use fetch", "b:1 package.json low -"]);
  assert.equal(renderCompact(scan([finding("a:1", "a", 1, "low")])).split("\n")[0], "Evergreen: 1 finding");
});

test("findings are listed most severe first, then by location, so the order is stable", () => {
  const findings = [finding("low", "a.ts", 1, "low"), finding("crit-b", "b.ts", 1, "critical"), finding("crit-a", "a.ts", 9, "critical"), finding("high", "a.ts", 2, "high")];
  const forward = renderCompact(scan(findings));
  assert.deepEqual(forward.split("\n").slice(1).map((line) => line.split(" ")[0]), ["crit-a", "crit-b", "high", "low"]);
  assert.equal(renderCompact(scan([...findings].reverse())), forward);
});

test("output is capped and says how many findings were left out", () => {
  const findings = Array.from({ length: COMPACT_MAX_FINDINGS + 7 }, (_, index) => finding(`id-${String(index).padStart(3, "0")}`, `src/file-${index}.ts`, index + 1, "medium", "Replace it"));
  const lines = renderCompact(scan(findings)).split("\n");
  assert.equal(lines[0], `Evergreen: ${COMPACT_MAX_FINDINGS + 7} findings`);
  assert.equal(lines.length, COMPACT_MAX_FINDINGS + 2);
  assert.equal(lines.at(-1), "7 more findings omitted; use --format json for all.");
  assert.match(renderCompact(scan([...findings.slice(0, COMPACT_MAX_FINDINGS), finding("one-more", "z.ts", 1, "info")])).split("\n").at(-1)!, /^1 more finding omitted;/);
});

test("output stays under the documented size however large the scan is", () => {
  const long = "x".repeat(500);
  const findings = Array.from({ length: 5000 }, (_, index) => finding(`${long}-${index}`, `${long}/${index}.ts`, index, "high", long));
  const output = renderCompact(scan(findings));
  assert.ok(Buffer.byteLength(output) < COMPACT_MAX_BYTES, `${Buffer.byteLength(output)} bytes`);
  assert.ok(output.split("\n").every((line) => line.length <= COMPACT_MAX_LINE + 60), "no line grows past the line limit");
  assert.match(output, /…/);
});

test("compact is a scan format: the CLI prints it, and other commands refuse it", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-compact-"));
  try {
    await mkdir(join(root, ".github", "workflows"), { recursive: true });
    await writeFile(join(root, ".github", "workflows", "ci.yml"), "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n");
    const { stdout } = await execute(process.execPath, [cli, "scan", root, "--format", "compact"]);
    const lines = stdout.trimEnd().split("\n");
    assert.equal(lines[0], "Evergreen: 1 finding");
    assert.equal(lines.length, 2);
    assert.match(lines[1]!, /\.github\/workflows\/ci\.yml:4 \w+ /);
    assert.ok(Buffer.byteLength(stdout) < COMPACT_MAX_BYTES);

    for (const [command, message] of [["check", /check supports/], ["explain", /only available for the scan command/]] as const) {
      await assert.rejects(execute(process.execPath, [cli, command, "pkg:npm/request", "--format", "compact"]), (error: { code: number; stderr: string }) => {
        assert.equal(error.code, 2, command);
        assert.match(error.stderr, message);
        return true;
      });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
