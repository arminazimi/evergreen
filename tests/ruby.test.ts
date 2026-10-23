import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { RubyDetector, rubyDetector } from "../src/detectors/ruby/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/ruby");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-ruby-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/ruby.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number, summary: string): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary,
    severity: rule.severity,
    location: { path, line },
    replacement: rule.replacement!,
    deadline: rule.deadline!,
    migration: rule.migration!,
    sources: rule.sources,
  };
}

test("ruby passes detector conformance on every fixture", async () => {
  const eol32 = (await committedRules()).find((rule) => rule.id === "ruby.runtime.eol-3.2")!;
  await runDetectorConformance({
    detector: rubyDetector,
    fixtures: [
      {
        name: "ruby positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(eol32, ".ruby-version", 1, `.ruby-version pins Ruby 3.2.2. ${eol32.summary}`),
          expected(eol32, ".tool-versions", 2, `.tool-versions pins Ruby 3.2.2. ${eol32.summary}`),
          expected(eol32, "Gemfile", 3, `Gemfile requires Ruby 3.2.2. ${eol32.summary}`),
          expected(eol32, "Gemfile.lock", 15, `Gemfile.lock resolves Ruby 3.2.2p53. ${eol32.summary}`),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });
  await runDetectorConformance({
    detector: rubyDetector,
    fixtures: [
      { name: "ruby negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "ruby zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: rubyDetector,
    fixtures: [{ name: "ruby malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("reports a yanked resolved gem from Gemfile.lock", async () => {
  const rule = (await committedRules()).find((item) => item.id === "ruby.gem.json.yanked-2.17.1.1")!;
  const root = await repository({ "Gemfile.lock": "GEM\n  remote: https://rubygems.org/\n  specs:\n    json (2.17.1.1)\n" });
  assert.deepEqual(await rubyDetector.scan({ root }), [
    {
      id: `${rule.id}:Gemfile.lock:4`,
      ruleId: rule.id,
      title: rule.title,
      summary: `Gemfile.lock resolves json 2.17.1.1. ${rule.summary}`,
      severity: rule.severity,
      location: { path: "Gemfile.lock", line: 4 },
      replacement: rule.replacement!,
      migration: rule.migration!,
      sources: rule.sources,
      usages: [],
      impact: { usageCount: 0, affectedFiles: 0, level: "none" },
    },
  ]);
});

test("reports curated Rails lifecycle rules and leaves Rails 8.1 clean", async () => {
  const cases = [
    ["eol", "ruby.gem.rails-7.2.end-of-life", "high", "2026-08-09"],
    ["scheduled", "ruby.gem.rails-8.0.scheduled-end-of-life", "low", "2026-11-07"],
    ["supported", undefined, undefined, undefined],
  ] as const;

  for (const [fixture, ruleId, severity, deadline] of cases) {
    const result = await scanRepository(resolve(fixtures, "rails", fixture), [rubyDetector]);
    assert.deepEqual(result.findings.map((finding) => [finding.ruleId, finding.severity, finding.deadline]), ruleId ? [[ruleId, severity, deadline]] : [], fixture);
  }
});

test("a Rails migration packet follows the official incremental upgrade process", async () => {
  const result = await scanRepository(resolve(fixtures, "rails", "eol"), [rubyDetector]);
  const finding = result.findings.find((item) => item.ruleId === "ruby.gem.rails-7.2.end-of-life");
  assert.ok(finding);

  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.deepEqual(packet.affectedFiles, ["Gemfile.lock"]);
  assert.ok(packet.steps.some((step) => step.id === "update-rails-declaration"));
  assert.ok(packet.steps.some((step) => step.id === "apply-rails-upgrade-guide"));
  assert.ok(packet.steps.some((step) => step.id === "update-framework-defaults"));
  assert.ok(packet.verification.some((check) => check.command === "bin/rails test"));
  assert.ok(packet.sources.some((source) => source.url === "https://guides.rubyonrails.org/upgrading_ruby_on_rails.html"));
});

test("reports a Gemfile gem covered by a whole-version rule", async () => {
  const rule: RegistryV2Rule = {
    id: "ruby.gem.abandoned.eol",
    ecosystem: "ruby",
    purl: "pkg:gem/abandoned",
    vers: "vers:gem/*",
    event: "end-of-life",
    title: "abandoned is end-of-life",
    summary: "The gem is no longer maintained.",
    severity: "high",
    replacement: "A maintained gem",
    sources: [{ title: "Example lifecycle", url: "https://example.com/abandoned" }],
    provenance: { observedAt: "2026-10-18", reviewedAt: "2026-10-18", reviewer: "test" },
  };
  const detector = new RubyDetector(async () => [rule]);
  const root = await repository({ Gemfile: 'source "https://rubygems.org"\n\ngem "abandoned", "~> 1.0"\n' });
  const findings = await detector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["ruby.gem.abandoned.eol", "Gemfile", 3]]);
  assert.match(findings[0]!.summary, /Gemfile declares abandoned ~> 1\.0\./);
});

test("matches the rbenv ruby- prefix to the runtime rule", async () => {
  const root = await repository({ ".ruby-version": "ruby-3.2.2\n" });
  const findings = await rubyDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["ruby.runtime.eol-3.2", ".ruby-version", 1]]);
});

test("a malformed rule does not hide a later matching rule", async () => {
  const base = (await committedRules()).find((rule) => rule.id === "ruby.runtime.eol-3.2")!;
  const malformed: RegistryV2Rule = { ...base, id: "ruby.runtime.malformed", vers: "vers:gem/not-a-version" };
  const detector = new RubyDetector(async () => [malformed, base]);
  const root = await repository({ ".ruby-version": "3.2.2\n" });
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.ruleId), ["ruby.runtime.eol-3.2"]);
});

test("a repository without Ruby files scans to nothing", async () => {
  assert.deepEqual(await rubyDetector.analyze({ root: await repository({ "README.md": "x\n" }) }), { findings: [], unclassified: [] });
});

test("every curated Ruby rule has migration guidance", async () => {
  for (const rule of await committedRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    assert.ok(rule.migration.verification.length >= 1, rule.id);
  }
});

test("a migration packet for a Ruby finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [rubyDetector]);
  const finding = result.findings.find((item) => item.id === "ruby.runtime.eol-3.2:.ruby-version:1");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes(".ruby-version"));
  assert.ok(packet.steps.some((step) => step.id === "update-ruby-declaration"));
  assert.ok(packet.steps.some((step) => step.id === "align-ruby-surfaces"));
  assert.ok(packet.verification.some((check) => check.command === "ruby --version"));
  assert.ok(packet.verification.some((check) => check.command === "bundle exec rake test"));
});

test("the detector is registered and Ruby is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "ruby"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "ruby"), {
    id: "ruby",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["ruby"],
  });
});
