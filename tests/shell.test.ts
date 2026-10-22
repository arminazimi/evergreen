import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { ShellDetector, shellDetector } from "../src/detectors/shell/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/shell");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-shell-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function fixtureRepository(name: string): Promise<string> {
  const paths = [
    "scripts/build.ps1",
    "modules/Deploy.psm1",
    "modules/Deploy.psd1",
    "modules/lookalikes.psm1",
    "scripts/lookalikes.ps1",
    "modules/Broken.psd1",
    "scripts/broken.ps1",
    ".github/workflows/ci.yml",
  ];
  const files: Record<string, string> = {};
  for (const path of paths) {
    try {
      files[path] = await readFile(resolve(fixtures, name, path), "utf8");
    } catch {
      // Not every fixture folder holds every file.
    }
  }
  return repository(files);
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/shell.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

function rule(overrides: Partial<RegistryV2Rule> = {}): RegistryV2Rule {
  return {
    id: "shell.powershell.example",
    ecosystem: "shell",
    purl: "pkg:generic/powershell",
    vers: "vers:semver/>=7.0.0|<7.1.0",
    event: "end-of-life",
    title: "PowerShell 7.0 is end-of-life",
    summary: "PowerShell 7.0 is no longer supported.",
    severity: "high",
    replacement: "PowerShell 7.6 (LTS) or later",
    sources: [{ title: "PowerShell support lifecycle", url: "https://learn.microsoft.com/powershell/scripting/install/powershell-support-lifecycle" }],
    provenance: { observedAt: "2026-10-22", reviewedAt: "2026-10-22", reviewer: "test" },
    ...overrides,
  };
}

test("shell passes detector conformance on every fixture", async () => {
  const seven = (await committedRules()).find((item) => item.id === "shell.powershell.end-of-life-7.0")!;
  await runDetectorConformance({
    detector: shellDetector,
    fixtures: [
      {
        name: "shell positive",
        root: await fixtureRepository("positive"),
        expectedFindings: [
          expected(seven, "modules/Deploy.psd1", 7, `modules/Deploy.psd1 requires PowerShell 7.0. ${seven.summary}`),
          expected(seven, "modules/Deploy.psm1", 1, `modules/Deploy.psm1 requires PowerShell 7.0. ${seven.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: shellDetector,
    fixtures: [
      { name: "shell negative", root: await fixtureRepository("negative"), expectedFindings: [] },
      { name: "shell zero", root: await fixtureRepository("zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: shellDetector,
    fixtures: [{ name: "shell malformed", root: await fixtureRepository("malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("is registered as a built-in detector", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "shell"));
});

test("reports requirements, manifests, and workflow images with exact lines", async () => {
  const detector = new ShellDetector(async () => [rule()]);
  const findings = await detector.scan({
    root: await repository({
      "a.ps1": "#Requires -Version 7.0\nWrite-Host hi\n",
      "lib/B.psm1": "# note\n#requires -version 7.0.3\n",
      "lib/B.psd1": "@{\n  PowerShellVersion = '7.0'\n}\n",
      ".github/workflows/ci.yml": "jobs:\n  a:\n    container:\n      image: mcr.microsoft.com/powershell:7.0-ubuntu-22.04\n    steps: []\n",
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line]), [
    [".github/workflows/ci.yml", 4],
    ["a.ps1", 1],
    ["lib/B.psd1", 2],
    ["lib/B.psm1", 2],
  ]);
  assert.match(findings[0]!.summary, /^\.github\/workflows\/ci\.yml runs mcr\.microsoft\.com\/powershell:7\.0-ubuntu-22\.04\. /);
  assert.match(findings[1]!.summary, /^a\.ps1 requires PowerShell 7\.0\. /);
});

test("a version outside the range, shell names, Bash images, and versionless tags are not matched", async () => {
  const detector = new ShellDetector(async () => [rule()]);
  const root = await repository({
    "a.ps1": "#Requires -Version 7.1\n",
    "b.ps1": "#Requires -Version 5.1\n",
    ".github/workflows/ci.yml": [
      "jobs:",
      "  a:",
      "    container: bash:7.0",
      "    steps:",
      "      - shell: pwsh",
      "        run: x",
      "  b:",
      "    container: mcr.microsoft.com/powershell:lts-ubuntu-22.04",
      "    steps: []",
      "  c:",
      "    container: mcr.microsoft.com/powershell:latest",
      "    steps: []",
      "",
    ].join("\n"),
  });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("workflow files outside .github/workflows are not read", async () => {
  const detector = new ShellDetector(async () => [rule()]);
  const root = await repository({ "ci.yml": "jobs:\n  a:\n    container: mcr.microsoft.com/powershell:7.0\n    steps: []\n" });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("only PowerShell rules apply, and a malformed VERS or unreadable Package URL does not hide a later rule", async () => {
  const detector = new ShellDetector(async () => [
    rule({ id: "shell.other", purl: "pkg:generic/bash" }),
    rule({ id: "shell.bad", vers: "not-vers" }),
    rule({ id: "shell.badpurl", purl: "not a purl" }),
    rule(),
  ]);
  const findings = await detector.scan({ root: await repository({ "a.ps1": "#Requires -Version 7.0\n" }) });
  assert.deepEqual(findings.map((finding) => finding.ruleId), ["shell.powershell.example"]);
});

test("scanRepository attributes findings to the shell detector", async () => {
  const result = await scanRepository(await repository({ "a.ps1": "#Requires -Version 7.0\n" }), builtInDetectors);
  assert.ok(result.findings.some((finding) => finding.detector === "shell" && finding.ruleId === "shell.powershell.end-of-life-7.0"));
});

test("ignores vendored and fixture directories, and a repository without PowerShell files", async () => {
  assert.deepEqual(await shellDetector.scan({ root: await repository({ "README.md": "hello\n" }) }), []);
  assert.deepEqual(
    await shellDetector.scan({
      root: await repository({
        "node_modules/x/a.ps1": "#Requires -Version 7.0\n",
        "tests/fixtures/a.ps1": "#Requires -Version 7.0\n",
      }),
    }),
    [],
  );
});

test("every curated shell rule has migration guidance with real verification commands", async () => {
  for (const item of await committedRules()) {
    assert.ok(item.migration && item.migration.constraints.length >= 1 && item.migration.steps.length >= 1, item.id);
    assert.ok(item.migration.verification.some((check) => check.command === 'pwsh -NoProfile -Command "$PSVersionTable"'), item.id);
  }
});

test("a migration packet for a PowerShell finding names the file, steps, and verification", async () => {
  const result = await scanRepository(await repository({ "scripts/build.ps1": "#Requires -Version 7.0\nWrite-Host hi\n" }), [shellDetector]);
  const finding = result.findings.find((item) => item.id === "shell.powershell.end-of-life-7.0:scripts/build.ps1:1");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("scripts/build.ps1"));
  assert.deepEqual(
    packet.steps.map((step) => step.id).filter((id) => !["review-evidence", "verify-migration"].includes(id)),
    ["inventory-hosts", "install-target", "raise-declared-version", "run-tests"],
  );
  assert.ok(packet.verification.some((check) => check.command === 'pwsh -NoProfile -Command "$PSVersionTable"'));
});
