import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { goDetector, matchModule } from "../src/detectors/go/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/go");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-go-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/go.json", "utf8"))).rules;
}

async function expected(ruleId: string, path: string, line: number, what: string, version: string, severity: "high" | "medium"): Promise<DetectorFinding> {
  const rule = (await rules()).find((item) => item.id === ruleId)!;
  return {
    id: `${ruleId}:${path}:${line}`,
    ruleId,
    title: rule.title,
    summary: `${path} ${what} is on Go ${version}. ${rule.summary}`,
    severity,
    location: { path, line },
    replacement: rule.replacement!,
    deadline: rule.deadline!,
    migration: rule.migration!,
    sources: rule.sources,
  };
}

test("go passes detector conformance on every fixture", async () => {
  const eol22 = "go.runtime.end-of-support-1.22";
  const eol23 = "go.runtime.end-of-support-1.23";
  await runDetectorConformance({
    detector: goDetector,
    fixtures: [
      {
        name: "go positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: await Promise.all([
          expected(eol22, "go.mod", 3, "go directive 1.22.4", "1.22", "medium"),
          expected(eol23, "go.mod", 5, "toolchain go1.23.1", "1.23", "high"),
          expected(eol22, "go.work", 1, "go directive 1.22.4", "1.22", "medium"),
          expected(eol23, "go.work", 3, "toolchain go1.23.1", "1.23", "high"),
        ]),
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });
  await runDetectorConformance({
    detector: goDetector,
    fixtures: [
      { name: "go negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "go zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: goDetector,
    fixtures: [{ name: "go malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("a supported release is not reported, and nested modules are found", async () => {
  const root = await repository({
    "go.mod": "module a\n\ngo 1.26\n",
    "services/api/go.mod": "module b\n\ngo 1.22.0\n",
    "vendor/x/go.mod": "module c\n\ngo 1.21\n",
    "tests/fixtures/old/go.mod": "module d\n\ngo 1.21\n",
  });
  assert.deepEqual((await goDetector.scan({ root })).map((finding) => [finding.ruleId, finding.location.path]), [["go.runtime.end-of-support-1.22", "services/api/go.mod"]]);
});

test("a version that is not a Go release number is unclassified, not guessed", async () => {
  const root = await repository({ "go.mod": "module a\n\ngo 1.22\ntoolchain go1.23rc1\n" });
  const analysis = await goDetector.analyze({ root });
  assert.deepEqual(analysis.findings.map((finding) => finding.location.line), [3, 4]);
  assert.deepEqual(analysis.unclassified, []);
});

test("a repository without Go files scans to nothing", async () => {
  assert.deepEqual(await goDetector.analyze({ root: await repository({ "README.md": "x\n" }) }), { findings: [], unclassified: [] });
});

const moduleRule = { id: "go.module.example.deprecated", purl: "pkg:golang/example.com/old", vers: "vers:golang/<2.0.0" } as RegistryV2Rule;

test("direct module rules match by module path and version range", () => {
  assert.equal(matchModule([moduleRule], "example.com/old", "v1.9.0"), moduleRule);
  assert.equal(matchModule([moduleRule], "example.com/old", "v1.9.0+incompatible"), moduleRule);
  assert.equal(matchModule([moduleRule], "example.com/old", "v2.0.0"), undefined);
  assert.equal(matchModule([moduleRule], "example.com/other", "v1.0.0"), undefined);
  assert.equal(matchModule([moduleRule], "example.com/old", "not-a-version"), undefined);
});

test("every curated Go rule has migration guidance with real verification commands", async () => {
  for (const rule of await rules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.some((check) => /^go build \.\/\.\.\. && go test \.\/\.\.\.$/.test(check.command)), rule.id);
  }
});

test("a migration packet for a Go finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [goDetector]);
  const finding = result.findings.find((item) => item.id === "go.runtime.end-of-support-1.23:go.mod:5");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("go.mod"));
  assert.ok(packet.steps.some((step) => step.id === "update-go-declaration"));
  assert.ok(packet.verification.some((check) => check.command === "go build ./... && go test ./..."));
});

test("a go directive older than Go 1.21 is reported by the 'and older' rule", async () => {
  const root = await repository({ "go.mod": "module a\n\ngo 1.15\n", "tools/go.mod": "module b\n\ngo 1.20.3\ntoolchain go1.20.14\n", "ok/go.mod": "module c\n\ngo 1.26\n" });
  const findings = await goDetector.scan({ root });
  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line, finding.severity]),
    [
      ["go.runtime.end-of-support-1.20-and-older", "go.mod", 3, "medium"],
      ["go.runtime.end-of-support-1.20-and-older", "tools/go.mod", 3, "medium"],
      ["go.runtime.end-of-support-1.20-and-older", "tools/go.mod", 4, "high"],
    ],
  );
  assert.equal(findings[0]!.deadline, "2024-02-06");
});
