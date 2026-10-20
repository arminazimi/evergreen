import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
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
import { PhpDetector, phpDetector } from "../src/detectors/php/index.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/php");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-php-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/php.json", "utf8"))).rules;
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
    sources: rule.sources,
  };
}

const packageRule = (id: string, name: string, vers: string): RegistryV2Rule => ({
  id,
  ecosystem: "php",
  purl: `pkg:composer/${name}`,
  vers,
  event: "deprecated",
  title: `${name} is abandoned`,
  summary: "The package is no longer maintained.",
  severity: "high",
  replacement: "A maintained package",
  sources: [{ title: "Example lifecycle", url: "https://example.com/abandoned" }],
  provenance: { observedAt: "2026-10-19", reviewedAt: "2026-10-19", reviewer: "test" },
});

test("php passes detector conformance on every fixture", async () => {
  const eol74 = (await committedRules()).find((rule) => rule.id === "php.runtime.eol-7.4")!;
  const pin = (path: string, line: number, version: string, verb: "pins" | "requires" | "resolves") =>
    expected(eol74, path, line, `${path} ${verb} PHP ${version}. ${eol74.summary}`);
  await runDetectorConformance({
    detector: phpDetector,
    fixtures: [
      {
        name: "php positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          pin(".php-version", 1, "7.4.33", "pins"),
          pin(".tool-versions", 2, "7.4.33", "pins"),
          pin("composer.json", 13, "7.4.33", "pins"),
          pin("composer.lock", 25, "7.4.33", "resolves"),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck],
  });
  await runDetectorConformance({
    detector: phpDetector,
    fixtures: [
      { name: "php negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "php zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: phpDetector,
    fixtures: [{ name: "php malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("a require.php constraint is not a version, and an exact platform pin is", async () => {
  const root = await repository({
    "composer.json": '{\n  "require": {\n    "php": ">=7.4"\n  },\n  "config": {\n    "platform": {\n      "php": "7.4.33"\n    }\n  }\n}\n',
  });
  assert.deepEqual((await phpDetector.scan({ root })).map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [
    ["php.runtime.eol-7.4", "composer.json", 7],
  ]);
});

test("matches the phpenv php- prefix to the runtime rule", async () => {
  const root = await repository({ ".php-version": "php-7.4.33\n" });
  const findings = await phpDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["php.runtime.eol-7.4", ".php-version", 1]]);
  assert.match(findings[0]!.summary, /pins PHP 7\.4\.33\./);
});

test("a malformed rule does not hide a later matching rule", async () => {
  const base = (await committedRules()).find((rule) => rule.id === "php.runtime.eol-7.4")!;
  const malformed: RegistryV2Rule = { ...base, id: "php.runtime.malformed", vers: "vers:composer/not-a-version" };
  const detector = new PhpDetector(async () => [malformed, base]);
  const root = await repository({ ".php-version": "7.4.33\n" });
  assert.deepEqual((await detector.scan({ root })).map((finding) => finding.ruleId), ["php.runtime.eol-7.4"]);
});

test("reports a composer.json package only when the rule covers every version", async () => {
  const every = packageRule("php.package.example.abandoned", "example/pkg", "vers:composer/*");
  const ranged = packageRule("php.package.example.one", "example/pkg", "vers:composer/>=1.0.0|<2.0.0");
  const detector = new PhpDetector(async () => [ranged, every]);
  const root = await repository({ "composer.json": '{\n  "require": {\n    "example/pkg": "1.2.3"\n  }\n}\n' });
  const findings = await detector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [["php.package.example.abandoned", "composer.json", 3]]);
  assert.match(findings[0]!.summary, /composer\.json declares example\/pkg 1\.2\.3\./);
});

test("reports a resolved composer.lock package when a rule contains its version", async () => {
  const rule = (await committedRules()).find((item) => item.id === "php.package.swiftmailer.swiftmailer.abandoned")!;
  const root = await repository({
    "composer.lock": '{\n  "packages": [\n    {\n      "name": "swiftmailer/swiftmailer",\n      "version": "v6.2.7"\n    }\n  ]\n}\n',
  });
  const findings = await phpDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]), [[rule.id, "composer.lock", 5]]);
  assert.match(findings[0]!.summary, /composer\.lock resolves swiftmailer\/swiftmailer v6\.2\.7\./);
});

test("an abandoned flag without a matching rule is not a finding", async () => {
  const root = await repository({
    "composer.lock": '{\n  "packages": [\n    {\n      "name": "old/abandoned",\n      "version": "1.0.0",\n      "abandoned": "new/replacement"\n    }\n  ]\n}\n',
  });
  assert.deepEqual(await phpDetector.scan({ root }), []);
});

test("a ranged package rule matches the lockfile version and not the direct constraint", async () => {
  const ranged = packageRule("php.package.example.one", "example/pkg", "vers:composer/>=1.0.0|<2.0.0");
  const detector = new PhpDetector(async () => [ranged]);
  const declared = await repository({ "composer.json": '{\n  "require": {\n    "example/pkg": "1.2.3"\n  }\n}\n' });
  assert.deepEqual(await detector.scan({ root: declared }), []);
  const locked = await repository({
    "composer.lock": '{\n  "packages": [\n    {\n      "name": "example/pkg",\n      "version": "1.2.3"\n    }\n  ]\n}\n',
  });
  assert.deepEqual((await detector.scan({ root: locked })).map((finding) => [finding.ruleId, finding.location.line]), [["php.package.example.one", 5]]);
});

test("nested projects are found, vendored and fixture directories and symbolic links are skipped, and a repository without PHP files is empty", async () => {
  const root = await repository({
    "apps/api/.php-version": "7.4.33\n",
    "vendor/lib/composer.json": '{"require":{"php":"7.4.33"}}\n',
    "tests/fixtures/old/.php-version": "7.4.33\n",
  });
  await symlink(join(root, "apps"), join(root, "linked")).catch(() => undefined);
  assert.deepEqual((await phpDetector.scan({ root })).map((finding) => finding.location.path), ["apps/api/.php-version"]);
  assert.deepEqual(await phpDetector.scan({ root: await repository({ "README.md": "x\n" }) }), []);
});

test("the detector is registered and PHP is experimental in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "php"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "php"), {
    id: "php",
    status: "experimental",
    maturity: "experimental",
    detectorIds: ["php"],
  });
});
