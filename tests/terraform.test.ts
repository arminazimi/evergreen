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
import { TerraformDetector, terraformDetector } from "../src/detectors/terraform/index.js";
import { scanRepository } from "../src/engine.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import type { DetectorFinding } from "../src/sdk.js";

const fixtures = resolve("tests/fixtures/terraform");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-terraform-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

async function committedRules(): Promise<RegistryV2Rule[]> {
  return validateRegistryV2(JSON.parse(await readFile("registry/terraform.json", "utf8"))).rules;
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
    id: "terraform.cli.example",
    ecosystem: "terraform",
    purl: "pkg:generic/terraform",
    vers: "vers:semver/>=1.5.0|<1.6.0",
    event: "end-of-support",
    title: "Terraform 1.5 is out of support",
    summary: "Terraform 1.5 is no longer supported.",
    severity: "high",
    replacement: "Terraform 1.15 or later",
    sources: [{ title: "Terraform releases", url: "https://github.com/hashicorp/terraform/releases" }],
    provenance: { observedAt: "2026-10-21", reviewedAt: "2026-10-21", reviewer: "test" },
    ...overrides,
  };
}

const PROVIDER_RULE = rule({
  id: "terraform.provider.aws.v4",
  purl: "pkg:generic/terraform-provider/hashicorp/aws",
  vers: "vers:semver/>=4.0.0|<5.0.0",
  title: "AWS provider 4 is out of support",
});

const POSITIVE = {
  "main.tf": 'terraform {\n  required_version = "1.5.7"\n}\n',
  ".terraform-version": "1.5.7\n",
};

test("terraform passes detector conformance on every fixture", async () => {
  const cli = (await committedRules()).find((item) => item.id === "terraform.cli.end-of-support-1.12")!;
  const positiveRoot = await repository({ ".terraform-version": "1.12.3\n" });
  await runDetectorConformance({
    detector: terraformDetector,
    fixtures: [
      {
        name: "terraform positive",
        root: positiveRoot,
        expectedFindings: [expected(cli, ".terraform-version", 1, `.terraform-version pins Terraform 1.12.3. ${cli.summary}`)],
      },
    ],
    checks: [determinismCheck, evidenceCheck, boundsCheck, locationsCheck],
  });
  await runDetectorConformance({
    detector: terraformDetector,
    fixtures: [
      { name: "terraform negative", root: resolve(fixtures, "negative"), expectedFindings: [] },
      { name: "terraform zero", root: resolve(fixtures, "zero"), expectedFindings: [] },
    ],
    checks: [determinismCheck, zeroFindingsCheck],
  });
  await runDetectorConformance({
    detector: terraformDetector,
    fixtures: [{ name: "terraform malformed", root: resolve(fixtures, "malformed"), expectedFindings: [] }],
    checks: [malformedInputCheck],
  });
});

test("the old-version positive fixture is outside every committed CLI rule", async () => {
  assert.deepEqual(await terraformDetector.scan({ root: resolve(fixtures, "positive") }), []);
});

test("is registered as a built-in detector", () => {
  assert.ok(builtInDetectors.some((detector) => detector.id === "terraform"));
});

test("reports a CLI pin in .terraform-version, .tool-versions, and an exact or ~> patch required_version", async () => {
  const detector = new TerraformDetector(async () => [rule()]);
  const findings = await detector.scan({
    root: await repository({
      ".terraform-version": "1.5.7\n",
      "app/.tool-versions": "nodejs 22.11.0\nterraform 1.5.2\n",
      "main.tf": 'terraform {\n  required_version = "1.5.7"\n}\n',
      "infra/main.tf": 'terraform {\n  required_version = "~> 1.5.0"\n}\n',
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line]), [
    [".terraform-version", 1],
    ["app/.tool-versions", 2],
    ["infra/main.tf", 2],
    ["main.tf", 2],
  ]);
  assert.match(findings[0]!.summary, /^\.terraform-version pins Terraform 1\.5\.7\. /);
  assert.match(findings[3]!.summary, /^main\.tf requires Terraform 1\.5\.7\. /);
});

test("a constraint that admits other release lines is not matched by a single-line rule", async () => {
  const detector = new TerraformDetector(async () => [rule()]);
  const root = await repository({
    "a.tf": 'terraform {\n  required_version = ">= 1.5.0"\n}\n',
    "b.tf": 'terraform {\n  required_version = "~> 1.5"\n}\n',
    "c.tf": 'terraform {\n  required_version = "~> 1.4.0"\n}\n',
    "d.tf": 'terraform {\n  required_version = ">= 1.5.0, < 1.6.0"\n}\n',
  });
  assert.deepEqual(await detector.scan({ root }), []);
});

test("a rule that covers every version matches any declared constraint", async () => {
  const detector = new TerraformDetector(async () => [rule({ vers: "vers:semver/*" })]);
  const findings = await detector.scan({ root: await repository({ "main.tf": 'terraform {\n  required_version = ">= 1.5.0"\n}\n' }) });
  assert.equal(findings.length, 1);
});

test("matches provider versions in .terraform.lock.hcl and required_providers", async () => {
  const detector = new TerraformDetector(async () => [PROVIDER_RULE]);
  const findings = await detector.scan({
    root: await repository({
      ".terraform.lock.hcl": 'provider "registry.terraform.io/hashicorp/aws" {\n  version = "4.67.0"\n}\nprovider "registry.terraform.io/hashicorp/google" {\n  version = "4.1.0"\n}\nprovider "example.com/hashicorp/aws" {\n  version = "4.67.0"\n}\n',
      "main.tf": 'terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 4.67.0"\n    }\n    other = {\n      source  = "example.com/hashicorp/aws"\n      version = "4.67.0"\n    }\n    default = {\n      version = "4.0.0"\n    }\n  }\n}\n',
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.location.path, finding.location.line]), [
    [".terraform.lock.hcl", 2],
    ["main.tf", 5],
  ]);
  assert.match(findings[0]!.summary, /^\.terraform\.lock\.hcl locks provider hashicorp\/aws 4\.67\.0\. /);
  assert.match(findings[1]!.summary, /^main\.tf requires provider hashicorp\/aws ~> 4\.67\.0\. /);
});

test("a malformed VERS rule never matches and does not hide a later rule", async () => {
  const detector = new TerraformDetector(async () => [rule({ id: "terraform.cli.bad", vers: "not-vers" }), rule()]);
  const findings = await detector.scan({ root: await repository(POSITIVE) });
  assert.deepEqual(findings.map((finding) => finding.ruleId), ["terraform.cli.example", "terraform.cli.example"]);
});

test("scanRepository attributes findings to the terraform detector", async () => {
  const result = await scanRepository(await repository({ ".terraform-version": "1.12.3\n" }), builtInDetectors);
  assert.ok(result.findings.some((finding) => finding.detector === "terraform" && finding.ruleId === "terraform.cli.end-of-support-1.12"));
});

test("ignores .terraform, vendored directories, symbolic names, and a repository without Terraform files", async () => {
  assert.deepEqual(await terraformDetector.scan({ root: await repository({ "README.md": "hello\n" }) }), []);
  assert.deepEqual(
    await terraformDetector.scan({
      root: await repository({
        ".terraform/modules/x/main.tf": POSITIVE["main.tf"],
        "node_modules/x/.terraform-version": "1.12.3\n",
      }),
    }),
    [],
  );
});

test("a rule file with an unreadable Package URL is skipped", async () => {
  const detector = new TerraformDetector(async () => [rule({ purl: "not a purl" }), rule()]);
  const findings = await detector.scan({ root: await repository({ ".terraform-version": "1.5.7\n" }) });
  assert.equal(findings.length, 1);
});
