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
import { createMigrationPacket, validateMigrationPacket } from "../src/migration-packet.js";
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

const EKS_RULE = rule({
  id: "terraform.eks.end-of-support-1.33",
  purl: "pkg:generic/amazon-eks",
  vers: "vers:semver/>=1.33.0|<1.34.0",
  title: "Amazon EKS 1.33 is past end of standard support",
  summary: "Amazon EKS 1.33 reached the end of standard support on 2026-07-29.",
  replacement: "Amazon EKS 1.35 or later",
  deadline: "2026-07-29",
});

const GKE_RULE = rule({
  id: "terraform.gke.end-of-life-1.30",
  purl: "pkg:generic/google-kubernetes-engine",
  vers: "vers:semver/>=1.30.0|<1.31.0",
  title: "GKE 1.30 is past end of extended support",
  summary: "GKE 1.30 reached the end of extended support on 2026-07-30.",
  replacement: "GKE 1.35 or later",
  deadline: "2026-07-30",
});

const AKS_RULE = rule({
  id: "terraform.aks.end-of-support-1.31",
  purl: "pkg:generic/azure-kubernetes-service",
  vers: "vers:semver/>=1.31.0|<1.32.0",
  title: "AKS 1.31 is past its 12-month support window",
  summary: "AKS 1.31 reached the end of its 12-month support window on 2025-11-01.",
  replacement: "Azure Kubernetes Service 1.35 or later",
  deadline: "2025-11-01",
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

test("judges literal managed Kubernetes versions for EKS, GKE, and AKS", async () => {
  const detector = new TerraformDetector(async () => [EKS_RULE, GKE_RULE, AKS_RULE]);
  const analysis = await detector.analyze({
    root: await repository({
      "main.tf": `module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_version = "1.33"
}

resource "google_container_cluster" "primary" {
  min_master_version = "1.30"
}

resource "azurerm_kubernetes_cluster" "main" {
  kubernetes_version = "1.31.4"
}
`,
    }),
  });
  assert.deepEqual(analysis.unclassified, []);
  assert.deepEqual(
    analysis.findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line]),
    [
      ["terraform.eks.end-of-support-1.33", "main.tf", 3],
      ["terraform.gke.end-of-life-1.30", "main.tf", 7],
      ["terraform.aks.end-of-support-1.31", "main.tf", 11],
    ],
  );
  assert.match(analysis.findings[0]!.summary, /^main\.tf sets module\.eks cluster_version 1\.33\. /);
  assert.match(analysis.findings[1]!.summary, /^main\.tf sets google_container_cluster\.primary min_master_version 1\.30\. /);
  assert.match(analysis.findings[2]!.summary, /^main\.tf sets azurerm_kubernetes_cluster\.main kubernetes_version 1\.31\.4\. /);
  assert.equal(analysis.findings[2]!.deadline, "2025-11-01");
});

test("variables, locals, and module outputs for managed Kubernetes versions are unclassified, never guessed", async () => {
  const detector = new TerraformDetector(async () => [EKS_RULE, GKE_RULE, AKS_RULE]);
  const analysis = await detector.analyze({
    root: await repository({
      "main.tf": `module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_version = var.eks_version
}

resource "azurerm_kubernetes_cluster" "main" {
  kubernetes_version = module.aks.version
}

resource "google_container_cluster" "primary" {
  min_master_version = local.gke_version
}

resource "azurerm_kubernetes_cluster" "other" {
  kubernetes_version = "latest"
}
`,
    }),
  });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.component, item.reference, item.location.path, item.location.line]),
    [
      ["amazon-eks", "var.eks_version", "main.tf", 3],
      ["azure-kubernetes-service", "module.aks.version", "main.tf", 7],
      ["google-kubernetes-engine", "local.gke_version", "main.tf", 11],
      ["azure-kubernetes-service", "latest", "main.tf", 15],
    ],
  );
  assert.match(analysis.unclassified[0]!.reason, /variable or module reference/);
  assert.match(analysis.unclassified[1]!.reason, /variable or module reference/);
  assert.match(analysis.unclassified[2]!.reason, /variable or module reference/);
  assert.match(analysis.unclassified[3]!.reason, /not a Kubernetes version number/);
});

test("a supported version, an unrelated resource version, and a nested attribute are not reported", async () => {
  const detector = new TerraformDetector(async () => [EKS_RULE, GKE_RULE, AKS_RULE]);
  const analysis = await detector.analyze({
    root: await repository({
      "main.tf": `module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_version = "1.36"
}

resource "aws_eks_cluster" "main" {
  version = "1.20"
}

resource "google_container_cluster" "primary" {
  version = "1.20"
  node_config {
    kubernetes_version = "1.20"
  }
}
`,
    }),
  });
  assert.deepEqual(analysis, { findings: [], unclassified: [] });
});

test("matches a patch release and a GKE version suffix in its minor line", async () => {
  const detector = new TerraformDetector(async () => [GKE_RULE]);
  const findings = await detector.scan({
    root: await repository({
      "main.tf": 'module "gke" {\n  source             = "terraform-google-modules/kubernetes-engine/google"\n  min_master_version = "1.30.4-gke.1200"\n}\n',
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [
    ["terraform.gke.end-of-life-1.30", 3],
  ]);
});

test("the committed registry judges EKS, GKE, and AKS control-plane versions", async () => {
  const rules = await committedRules();
  for (const purl of [
    "pkg:generic/amazon-eks",
    "pkg:generic/google-kubernetes-engine",
    "pkg:generic/azure-kubernetes-service",
  ]) {
    const matching = rules.filter((item) => item.purl === purl);
    assert.ok(matching.length > 0, purl);
    assert.ok(matching.every((item) => item.sources.every((source) => source.url.startsWith("https://"))), purl);
  }
  const findings = await terraformDetector.scan({
    root: await repository({
      "main.tf": `module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_version = "1.29"
}
resource "google_container_cluster" "primary" {
  min_master_version = "1.28"
}
resource "azurerm_kubernetes_cluster" "main" {
  kubernetes_version = "1.27"
}
`,
    }),
  });
  assert.deepEqual(findings.map((finding) => finding.ruleId), [
    "terraform.eks.end-of-life-1.30-and-older",
    "terraform.gke.end-of-life-1.29-and-older",
    "terraform.aks.end-of-life-1.28-and-older",
  ]);
});

test("a module version is judged by the vendor named in the module source", async () => {
  const detector = new TerraformDetector(async () => [
    rule({ id: "terraform.eks.example", purl: "pkg:generic/amazon-eks", vers: "vers:semver/>=1.31.0|<1.32.0" }),
    rule({ id: "terraform.gke.example", purl: "pkg:generic/google-kubernetes-engine", vers: "vers:semver/>=1.31.0|<1.32.0" }),
    rule({ id: "terraform.aks.example", purl: "pkg:generic/azure-kubernetes-service", vers: "vers:semver/>=1.31.0|<1.32.0" }),
  ]);
  const findings = await detector.scan({
    root: await repository({
      "main.tf": `module "eks" {
  source             = "terraform-aws-modules/eks/aws"
  kubernetes_version = "1.31"
}

module "gke" {
  source             = "terraform-google-modules/kubernetes-engine/google"
  kubernetes_version = "1.31"
}

module "aks" {
  source             = "Azure/aks/azurerm"
  kubernetes_version = "1.31"
}
`,
    }),
  });
  assert.deepEqual(findings.map((finding) => [finding.ruleId, finding.location.line]), [
    ["terraform.eks.example", 3],
    ["terraform.gke.example", 8],
    ["terraform.aks.example", 13],
  ]);
  assert.match(findings[0]!.summary, /^main\.tf sets module\.eks kubernetes_version 1\.31\. /);
  assert.match(findings[1]!.summary, /^main\.tf sets module\.gke kubernetes_version 1\.31\. /);
  assert.match(findings[2]!.summary, /^main\.tf sets module\.aks kubernetes_version 1\.31\. /);
});

test("an unknown module source is unclassified, never guessed", async () => {
  const detector = new TerraformDetector(async () => [EKS_RULE, GKE_RULE, AKS_RULE]);
  const analysis = await detector.analyze({
    root: await repository({
      "main.tf": `module "local" {
  source             = "./modules/eks"
  kubernetes_version = "1.31"
}

module "no-source" {
  cluster_version = "1.31"
}
`,
    }),
  });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(
    analysis.unclassified.map((item) => [item.component, item.reference, item.location.line]),
    [
      ["kubernetes", "1.31", 3],
      ["kubernetes", "1.31", 7],
    ],
  );
  assert.ok(analysis.unclassified.every((item) => item.reason === "the module source is not a known managed Kubernetes module"));
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

test("every curated Terraform rule has migration guidance with real verification commands", async () => {
  for (const item of await committedRules()) {
    assert.ok(item.migration && item.migration.constraints.length >= 1 && item.migration.steps.length >= 1, item.id);
    assert.ok(item.migration.verification.some((check) => check.command === "terraform init -backend=false && terraform validate"), item.id);
    assert.ok(item.migration.verification.some((check) => check.command === "terraform plan"), item.id);
  }
});

test("reports findings from terraform plan JSON with pointer or resource address evidence", async () => {
  const planJson = await readFile(resolve(fixtures, "plan_json/plan.json"), "utf8");
  const detector = terraformDetector;
  const findings = await detector.scan({
    root: await repository({
      "plan.json": planJson,
    }),
  });

  assert.equal(findings.length, 2);

  const cliFinding = findings.find((f) => f.ruleId === "terraform.cli.end-of-support-1.12");
  assert.ok(cliFinding);
  assert.equal(cliFinding.id, "terraform.cli.end-of-support-1.12:plan.json:/terraform_version");
  assert.equal(cliFinding.location.path, "plan.json");
  assert.match(cliFinding.summary, /^plan\.json \(\/terraform_version\) resolves Terraform 1\.12\.3\./);

  const dbFinding = findings.find((f) => f.ruleId === "database.postgresql.end-of-life-12");
  assert.ok(dbFinding);
  assert.equal(dbFinding.id, "database.postgresql.end-of-life-12:plan.json:aws_db_instance.legacy_db");
  assert.equal(dbFinding.location.path, "plan.json");
  assert.match(
    dbFinding.summary,
    /^plan\.json \(aws_db_instance\.legacy_db\) resolves aws_db_instance\.legacy_db engine postgres 12\.22\./,
  );
});

test("a repository with 600 unrelated *.json files plus one .tf file still reports the .tf finding", async () => {
  const files: Record<string, string> = {
    "main.tf": 'terraform {\n  required_version = "1.12.3"\n}\n',
  };
  for (let i = 0; i < 600; i++) {
    files[`data_${i}.json`] = JSON.stringify({ key: i });
  }
  const root = await repository(files);
  const findings = await terraformDetector.scan({ root });
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.location.path, "main.tf");
  assert.equal(findings[0]!.ruleId, "terraform.cli.end-of-support-1.12");
});

test("unrelated package.json and tsconfig.json are never parsed or reported", async () => {
  const root = await repository({
    "package.json": JSON.stringify({ name: "my-app", version: "1.0.0" }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { target: "es2022" } }),
  });
  const findings = await terraformDetector.scan({ root });
  assert.deepEqual(findings, []);
});

test("a migration packet for a Terraform CLI finding names the file, steps, and verification", async () => {
  const result = await scanRepository(await repository({ ".terraform-version": "1.12.3\n" }), [terraformDetector]);
  const finding = result.findings.find((item) => item.id === "terraform.cli.end-of-support-1.12:.terraform-version:1");
  assert.ok(finding);
  const packet = validateMigrationPacket(createMigrationPacket(result, finding.id));
  assert.ok(packet.affectedFiles.includes(".terraform-version"));
  assert.deepEqual(
    packet.steps.map((step) => step.id).filter((id) => !["review-evidence", "verify-migration"].includes(id)),
    ["raise-cli-pin", "raise-required-version", "align-ci-toolchain"],
  );
  assert.ok(packet.verification.some((check) => check.command === "terraform init -backend=false && terraform validate"));
});
