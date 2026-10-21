import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";

import { getCapabilityManifest } from "../src/capabilities.js";
import { boundsCheck } from "../src/conformance/checks/bounds.js";
import { determinismCheck } from "../src/conformance/checks/determinism.js";
import { evidenceCheck } from "../src/conformance/checks/evidence.js";
import { locationsCheck } from "../src/conformance/checks/locations.js";
import { malformedInputCheck } from "../src/conformance/checks/malformed.js";
import { zeroFindingsCheck } from "../src/conformance/checks/zero.js";
import { runDetectorConformance } from "../src/conformance/index.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { ServerlessDetector, candidatePurls, serverlessDetector } from "../src/detectors/serverless/index.js";
import { scanRepository } from "../src/engine.js";
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/serverless");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-serverless-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/serverless.json", "utf8"))).rules;
}

function expected(rule: RegistryV2Rule, path: string, line: number): DetectorFinding {
  return {
    id: `${rule.id}:${path}:${line}`,
    ruleId: rule.id,
    title: rule.title,
    summary: `${path} declares runtime ${rule.purl.slice(rule.purl.lastIndexOf("/") + 1)}. ${rule.summary}`,
    severity: rule.severity,
    location: { path, line },
    ...(rule.replacement ? { replacement: rule.replacement } : {}),
    ...(rule.deadline ? { deadline: rule.deadline } : {}),
    ...(rule.migration ? { migration: rule.migration } : {}),
    sources: rule.sources,
  };
}

test("serverless passes detector conformance on every fixture", async () => {
  const rules = await committedRules();
  const byId = (id: string) => rules.find((rule) => rule.id === id)!;
  await runDetectorConformance({
    detector: serverlessDetector,
    fixtures: [
      {
        name: "serverless positive",
        root: resolve(fixtures, "positive"),
        expectedFindings: [
          expected(byId("serverless.aws-lambda.nodejs14.x"), "main.tf", 3),
          expected(byId("serverless.google-cloud-functions.nodejs14"), "main.tf", 30),
          expected(byId("serverless.aws-lambda.nodejs14.x"), "serverless.yml", 4),
          expected(byId("serverless.aws-lambda.python3.8"), "serverless.yml", 9),
          expected(byId("serverless.aws-lambda.nodejs14.x"), "template.yaml", 7),
          expected(byId("serverless.aws-lambda.python3.8"), "template.yaml", 15),
          expected(byId("serverless.aws-lambda.dotnetcore3.1"), "template.yaml", 21),
          expected(byId("serverless.aws-lambda.ruby2.7"), "template.yml", 12),
        ],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: serverlessDetector,
    fixtures: [
      { name: "serverless negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "serverless zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: serverlessDetector,
    fixtures: [{ name: "serverless malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("matches AWS and Google identifiers by Package URL and ignores Azure version-only pins without rules", async () => {
  const findings = await serverlessDetector.scan({ root: resolve(fixtures, "positive") });
  assert.deepEqual(
    findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [
      ["serverless.aws-lambda.nodejs14.x", "main.tf", 3],
      ["serverless.google-cloud-functions.nodejs14", "main.tf", 30],
      ["serverless.aws-lambda.nodejs14.x", "serverless.yml", 4],
      ["serverless.aws-lambda.python3.8", "serverless.yml", 9],
      ["serverless.aws-lambda.nodejs14.x", "template.yaml", 7],
      ["serverless.aws-lambda.python3.8", "template.yaml", 15],
      ["serverless.aws-lambda.dotnetcore3.1", "template.yaml", 21],
      ["serverless.aws-lambda.ruby2.7", "template.yml", 12],
    ],
  );
  assert.ok(!findings.some((finding) => finding.location.path === "main.tf" && (finding.location.line === 13 || finding.location.line === 23 || finding.location.line === 38)));
});

test("the first matching rule wins, and a malformed VERS does not hide a later rule", async () => {
  const node14 = (await committedRules()).find((rule) => rule.id === "serverless.aws-lambda.nodejs14.x")!;
  const earlier = { ...node14, id: "serverless.aws-lambda.nodejs14.x.earlier", vers: "vers:semver/*" };
  const malformed = { ...node14, id: "serverless.aws-lambda.malformed", vers: "not-a-vers" };
  const detector = new ServerlessDetector(async () => [malformed, earlier, node14]);
  const findings = await detector.scan({
    root: await repository({
      "template.yaml": "Resources:\n  F:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime: nodejs14.x\n",
    }),
  });
  assert.deepEqual(findings.map((finding) => finding.ruleId), ["serverless.aws-lambda.nodejs14.x.earlier"]);
});

test("candidate Package URLs cover AWS Lambda and Google Cloud Functions identifiers", () => {
  assert.deepEqual(candidatePurls("nodejs14.x"), [
    "pkg:generic/aws-lambda-runtime/nodejs14.x",
    "pkg:generic/google-cloud-functions-runtime/nodejs14.x",
  ]);
  assert.deepEqual(candidatePurls("nodejs14"), [
    "pkg:generic/aws-lambda-runtime/nodejs14",
    "pkg:generic/google-cloud-functions-runtime/nodejs14",
  ]);
});

test("walks nested manifests and skips symlinks, vendored directories, and depth past eight", async () => {
  const deep = Array.from({ length: 9 }, (_, index) => `d${index}`).join("/");
  const root = await repository({
    "src/template.yaml":
      "Resources:\n  F:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime: nodejs14.x\n",
    "node_modules/template.yaml":
      "Resources:\n  F:\n    Type: AWS::Serverless::Function\n    Properties:\n      Runtime: python3.8\n",
    [`${deep}/serverless.yml`]: "provider:\n  runtime: ruby2.7\n",
  });
  await mkdir(join(root, "linked"));
  await symlink(join(root, "src", "template.yaml"), join(root, "linked", "template.yaml"));
  const findings = await serverlessDetector.scan({ root });
  assert.deepEqual(findings.map((finding) => finding.location.path), ["src/template.yaml"]);
});

test("a repository without serverless manifests scans to nothing", async () => {
  assert.deepEqual(await serverlessDetector.analyze({ root: await repository({ "README.md": "x\n" }) }), { findings: [], unclassified: [] });
});

test("the engine attributes a serverless finding to the detector", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [serverlessDetector]);
  assert.ok(result.findings.some((finding) => finding.detector === "serverless" && finding.ruleId === "serverless.aws-lambda.nodejs14.x"));
});

test("every curated Serverless rule has migration guidance with real verification commands", async () => {
  for (const rule of await committedRules()) {
    assert.ok(rule.migration && rule.migration.constraints.length >= 1 && rule.migration.steps.length >= 1, rule.id);
    if (rule.id.startsWith("serverless.google-cloud-functions.")) {
      assert.ok(
        rule.migration.verification.length >= 1 &&
          rule.migration.verification.every(
            (check) => check.command.startsWith("terraform ") && !check.command.includes("sam ") && !check.command.includes("serverless "),
          ),
        `${rule.id}: Google Cloud Functions verification must be Terraform-only`,
      );
      continue;
    }
    assert.ok(
      rule.migration.verification.some((check) => check.command === "sam validate || serverless print || terraform validate"),
      `${rule.id}: AWS Lambda verification must keep the SAM/Serverless/Terraform chain`,
    );
  }
});

test("a migration packet for a Serverless finding names the file, steps, and verification", async () => {
  const result = await scanRepository(resolve(fixtures, "positive"), [serverlessDetector]);
  const finding = result.findings.find((item) => item.id === "serverless.aws-lambda.nodejs14.x:serverless.yml:4");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes("serverless.yml"));
  assert.ok(packet.steps.some((step) => step.id === "raise-lambda-runtime"));
  assert.ok(packet.steps.some((step) => step.id === "align-lambda-runtime-surfaces"));
  assert.ok(packet.verification.some((check) => check.command === "sam validate || serverless print || terraform validate"));
});

test("the detector is registered and serverless is beta in the capability manifest", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "serverless"));
  assert.deepEqual(getCapabilityManifest().ecosystems.find((ecosystem) => ecosystem.id === "serverless"), {
    id: "serverless",
    status: "supported",
    maturity: "beta",
    detectorIds: ["serverless"],
  });
});
