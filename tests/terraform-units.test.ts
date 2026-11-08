import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { TerraformDetector } from "../src/detectors/terraform/index.js";
import { parseManagedKubernetes } from "../src/detectors/terraform/kubernetes.js";
import { attributeValues, directBlocks, MAXIMUM_INPUT_BYTES, prepareHcl } from "../src/detectors/terraform/hcl.js";
import { parseTerraformLegacy } from "../src/detectors/terraform/parse-terraform.js";
import { parseTerraformPlanJson } from "../src/detectors/terraform/plan.js";
import type { RegistryV2Rule } from "@velella/ebb/registry";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-terraform-units-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

function rule(overrides: Partial<RegistryV2Rule> & Pick<RegistryV2Rule, "id" | "purl" | "vers">): RegistryV2Rule {
  return {
    ecosystem: "terraform",
    event: "end-of-support",
    title: `${overrides.id} title`,
    summary: `${overrides.id} summary.`,
    severity: "high",
    sources: [{ title: "Source", url: "https://example.com/source" }],
    provenance: { observedAt: "2026-10-21", reviewedAt: "2026-10-21", reviewer: "test" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hcl.ts: prepareHcl (masking), attributeValues, directBlocks
// ---------------------------------------------------------------------------

test("prepareHcl masks comments, strings, and heredocs to the same length", () => {
  const hcl = prepareHcl('a = "secret" # tail\n/* block */ b = 2 // line\n');
  assert.ok(hcl);
  assert.equal(hcl.masked.length, hcl.source.length);
  assert.ok(!hcl.masked.includes("secret"));
  assert.ok(!hcl.masked.includes("tail"));
  assert.ok(!hcl.masked.includes("block"));
  assert.ok(!hcl.masked.includes("line"));
  assert.match(hcl.masked, /^a = "\s*" /);
});

test("prepareHcl masks a terminated heredoc and accepts an indented closer", () => {
  const hcl = prepareHcl("a = <<EOT\nhidden\nEOT\nb = <<-END\n  hidden too\n  END\nc = 3\n");
  assert.ok(hcl);
  assert.ok(!hcl.masked.includes("hidden"));
  assert.match(hcl.masked, /c = 3/);
});

test("prepareHcl leaves a bare << operator alone", () => {
  const hcl = prepareHcl("a = b << 2\n");
  assert.ok(hcl);
  assert.equal(hcl.masked, hcl.source);
});

test("prepareHcl returns undefined for unterminated comments, strings, and heredocs", () => {
  assert.equal(prepareHcl("a = 1 /* never closed"), undefined);
  assert.equal(prepareHcl('a = "never closed\n'), undefined);
  assert.equal(prepareHcl('a = "ends with a backslash\\'), undefined);
  assert.equal(prepareHcl("a = <<EOT\nno closer here\n"), undefined);
});

test("prepareHcl rejects oversized input and normalizes BOM, CRLF, and overlong lines", () => {
  assert.equal(prepareHcl("x".repeat(MAXIMUM_INPUT_BYTES + 1)), undefined);

  const normalized = prepareHcl("﻿a = 1\r\nb = 2");
  assert.equal(normalized?.source, "a = 1\nb = 2");

  const overlong = `a = 1\n${"z".repeat(4097)}\nb = 2`;
  const blanked = prepareHcl(overlong);
  assert.ok(blanked);
  assert.equal(blanked.source.split("\n")[1], " ".repeat(4097));
  assert.equal(blanked.source.split("\n")[2], "b = 2");
});

test("attributeValues returns literals, references, and escaped or empty strings with their lines", () => {
  const source = [
    'name = "plain"',
    "version = var.v",
    'escaped = "a\\b"',
    'interpolated = "${var.x}"',
    'empty = ""',
    'padded = " x "',
    "bare =",
    'junk = "a" + 1',
    "",
  ].join("\n");
  const hcl = prepareHcl(source);
  assert.ok(hcl);
  const values = attributeValues(hcl, 0, hcl.masked.length);
  assert.deepEqual(
    values.map(({ name, value, literal, line }) => ({ name, value, literal, line })),
    [
      { name: "name", value: "plain", literal: true, line: 1 },
      { name: "version", value: "var.v", literal: false, line: 2 },
      { name: "escaped", value: '"a\\b"', literal: false, line: 3 },
      { name: "interpolated", value: '"${var.x}"', literal: false, line: 4 },
      { name: "empty", value: '""', literal: false, line: 5 },
      { name: "padded", value: '" x "', literal: false, line: 6 },
    ],
  );
});

test("attributeValues only reads depth-0 attributes inside its range", () => {
  const hcl = prepareHcl("outer = {\n  inner = 1\n}\nafter = 2\n");
  assert.ok(hcl);
  assert.deepEqual(
    attributeValues(hcl, 0, hcl.masked.length).map((attribute) => attribute.name),
    ["outer", "after"],
  );
  const bodyStart = hcl.masked.indexOf("{") + 1;
  const bodyEnd = hcl.masked.indexOf("}");
  assert.deepEqual(
    attributeValues(hcl, bodyStart, bodyEnd).map((attribute) => attribute.name),
    ["inner"],
  );
});

test("directBlocks reads labelled blocks and skips unclosed or out-of-range ones", () => {
  const hcl = prepareHcl('resource "a" "b" {\n  x = 1\n}\nmodule "m" {\n  y = 2\n');
  assert.ok(hcl);
  const blocks = directBlocks(hcl, 0, hcl.masked.length);
  assert.deepEqual(
    blocks.map((block) => [block.name, block.header]),
    [["resource", ' "a" "b" ']],
  );
  const closed = prepareHcl('module "m" {\n  y = 2\n}\n');
  assert.ok(closed);
  assert.deepEqual(
    directBlocks(closed, 0, 3).map((block) => block.name),
    [],
  );
  assert.deepEqual(
    directBlocks(closed, 0, closed.masked.length).map((block) => block.name),
    ["module"],
  );
});

// ---------------------------------------------------------------------------
// kubernetes.ts: parseManagedKubernetes
// ---------------------------------------------------------------------------

test("parseManagedKubernetes reads module sources with submodules, refs, and the default registry host", () => {
  const declarations = parseManagedKubernetes(`module "eks" {
  source = "registry.terraform.io/terraform-aws-modules/eks/aws//modules/cluster?ref=v20"
  cluster_version = "1.33"
}
module "aks" {
  source = "Azure/aks/azurerm"
  kubernetes_version = "1.32"
  cluster_version = "1.99"
}
module "gke" {
  source = "terraform-google-modules/kubernetes-engine/google"
  min_master_version = "1.31"
}
`);
  assert.deepEqual(
    declarations.map(({ product, block, name, attribute, value, literal, line }) => ({
      product,
      block,
      name,
      attribute,
      value,
      literal,
      line,
    })),
    [
      {
        product: "amazon-eks",
        block: "module",
        name: "eks",
        attribute: "cluster_version",
        value: "1.33",
        literal: true,
        line: 3,
      },
      {
        product: "azure-kubernetes-service",
        block: "module",
        name: "aks",
        attribute: "kubernetes_version",
        value: "1.32",
        literal: true,
        line: 7,
      },
      {
        product: "google-kubernetes-engine",
        block: "module",
        name: "gke",
        attribute: "min_master_version",
        value: "1.31",
        literal: true,
        line: 12,
      },
    ],
  );
});

test("parseManagedKubernetes keeps unknown module version inputs without a product", () => {
  const declarations = parseManagedKubernetes(`module "local" {
  source = "./modules/cluster"
  kubernetes_version = "1.33"
  other = "ignored"
}
module "no_source" {
  kubernetes_version = "1.33"
}
module "dynamic_source" {
  source = var.src
  min_master_version = "1.33"
}
`);
  assert.deepEqual(
    declarations.map((declaration) => [declaration.name, declaration.product, declaration.attribute]),
    [
      ["local", undefined, "kubernetes_version"],
      ["no_source", undefined, "kubernetes_version"],
      ["dynamic_source", undefined, "min_master_version"],
    ],
  );
});

test("parseManagedKubernetes reads resource versions and marks non-literal values", () => {
  const declarations = parseManagedKubernetes(`resource "azurerm_kubernetes_cluster" "aks" {
  kubernetes_version = var.version
  name = "ignored"
}
resource "google_container_cluster" "gke" {
  min_master_version = "1.33"
  node_version = "1.33"
}
resource "aws_eks_cluster" "eks" {
  version = "1.33"
}
resource "google_container_cluster" {
  min_master_version = "1.33"
}
module {
  kubernetes_version = "1.33"
}
locals {
  kubernetes_version = "1.33"
}
`);
  assert.deepEqual(
    declarations.map((declaration) => [
      declaration.block,
      declaration.name,
      declaration.attribute,
      declaration.literal,
    ]),
    [
      ["azurerm_kubernetes_cluster", "aks", "kubernetes_version", false],
      ["google_container_cluster", "gke", "min_master_version", true],
    ],
  );
});

test("parseManagedKubernetes returns nothing for an unterminated file and stops at the declaration cap", () => {
  assert.deepEqual(parseManagedKubernetes('module "x" {\n  source = "a\n'), []);
  const lines = Array.from({ length: 5001 }, () => '  kubernetes_version = "1.33"').join("\n");
  const capped = parseManagedKubernetes(`module "many" {\n  source = "./local"\n${lines}\n}\n`);
  assert.equal(capped.length, 5000);
});

// ---------------------------------------------------------------------------
// parse-terraform.ts: parseTerraformLegacy (readCode, scanCall, stringContext, readCall, readTemplate, ...)
// ---------------------------------------------------------------------------

test("parseTerraformLegacy reports interpolation-only strings with their context and location", () => {
  const found = parseTerraformLegacy(
    [
      'value = "${var.a}"',
      '"${var.b}" = 1',
      'resource "${var.c}" "d" {',
      'eq = "${var.e}" == 1',
      'nested = "${join("-", ["a"])}"',
    ].join("\n"),
  );
  assert.deepEqual(
    found.map((declaration) =>
      declaration.kind === "interpolation_only"
        ? [declaration.context, declaration.expression, declaration.line, declaration.column]
        : declaration.kind,
    ),
    [
      ["value", "var.a", 1, 9],
      ["key", "var.b", 2, 1],
      ["label", "var.c", 3, 10],
      ["value", "var.e", 4, 6],
      ["value", 'join("-", ["a"])', 5, 10],
    ],
  );
});

test("parseTerraformLegacy ignores strings that are not exactly one interpolation", () => {
  assert.deepEqual(
    parseTerraformLegacy(
      [
        'a = "%{ if x }y%{ endif }"',
        'b = "\\${var.a}"',
        'c = "x${var.a}"',
        'd = "${var.a}${var.b}"',
        'e = "${}"',
        'f = "$${var.a}"',
        'g = "${var.a"',
      ].join("\n"),
    ),
    [],
  );
});

test("parseTerraformLegacy reads list() and map() calls with arguments and line spans", () => {
  const found = parseTerraformLegacy(
    [
      'x = list("a", "b")',
      'y = map(\n  "a" = 1\n)',
      "z = list()",
      'w = list("a",)',
      "v = list(,)",
      "u = list",
      'obj.list("a")',
      'call = list("a"',
      "trailing",
    ].join("\n"),
  );
  assert.deepEqual(
    found.map((declaration) =>
      declaration.kind === "legacy_function"
        ? [declaration.name, declaration.arguments, declaration.oneLine, declaration.line, declaration.column]
        : declaration.kind,
    ),
    [
      ["list", ['"a"', '"b"'], true, 1, 5],
      ["map", ['"a" = 1'], false, 2, 5],
      ["list", [], true, 5, 5],
      ["list", ['"a"'], true, 6, 5],
    ],
  );
});

test("parseTerraformLegacy keeps reading a call past comments that contain parentheses", () => {
  const found = parseTerraformLegacy('c = list("a", /* ) */ "b")\nd = map("x", # )\n  "y")\n');
  assert.deepEqual(
    found.map((declaration) => (declaration.kind === "legacy_function" ? declaration.arguments.length : -1)),
    [2, 2],
  );
});

test("parseTerraformLegacy skips type constructors, comments, heredocs, and strings", () => {
  assert.deepEqual(
    parseTerraformLegacy(
      [
        'variable "a" {\n  type = list(string)\n}',
        'variable "b" {\n  type = map(object({ a = string }))\n}',
        'variable "c" {\n  type = list(any)\n}',
        '# list("a")',
        '// map("a")',
        '/* list("a") */',
        "text = \"list('a')\"",
        'heredoc = <<EOT\nlist("a")\nEOT',
        'indented = <<-EOT\n  map("a")\n  EOT',
        "shifted = 1 << 2",
      ].join("\n"),
    ),
    [],
  );
});

test("parseTerraformLegacy reads calls inside templates, directives, and nested arguments", () => {
  const found = parseTerraformLegacy(
    ['a = "${list("x")}"', 'b = "%{ for v in list("y") }${v}%{ endfor }"', 'c = map("q\\"r")'].join("\n"),
  );
  assert.deepEqual(
    found.map((declaration) => declaration.kind),
    ["interpolation_only", "legacy_function", "legacy_function", "legacy_function"],
  );
  assert.deepEqual(
    found.flatMap((declaration) => (declaration.kind === "legacy_function" ? [declaration.arguments] : [])),
    [['"x"'], ['"y"'], ['"q\\"r"']],
  );
});

test("parseTerraformLegacy stops at unterminated constructs and rejects non-literal string forms", () => {
  assert.deepEqual(parseTerraformLegacy('x = "abc\ny = list("a")'), []);
  assert.deepEqual(parseTerraformLegacy('x = "${a"'), []);
  assert.deepEqual(parseTerraformLegacy('/* open list("a")'), []);
  assert.deepEqual(parseTerraformLegacy('x = <<EOT\nlist("a")'), []);
  assert.deepEqual(parseTerraformLegacy('# comment without newline list("a")'), []);
  assert.deepEqual(parseTerraformLegacy("﻿x = 1\r\n// done"), []);
});

test("parseTerraformLegacy finds locations on later lines and caps the declarations", () => {
  const found = parseTerraformLegacy(`a = 1\n\n  b = list("x")\n`);
  assert.equal(found[0]?.kind, "legacy_function");
  assert.equal(found.length, 1);
  assert.equal(found[0]?.kind === "legacy_function" ? found[0].line : 0, 3);

  const many = Array.from({ length: 5001 }, () => 'v = list("a")').join("\n");
  assert.equal(parseTerraformLegacy(many).length, 5000);
});

// ---------------------------------------------------------------------------
// plan.ts: parseTerraformPlanJson (collectResourcesFromModule, collectProvider*, collectResourceChanges, ...)
// ---------------------------------------------------------------------------

function nestedModules(depth: number): Record<string, unknown> {
  let child: Record<string, unknown> | undefined;
  for (let level = depth; level >= 0; level--) {
    const module: Record<string, unknown> = {
      resources: [
        {
          address: `m${level}.db`,
          type: "postgresql_database",
          name: "db",
          values: { engine: "postgres", engine_version: "12" },
        },
      ],
    };
    if (child) module.child_modules = [child];
    child = module;
  }
  return child ?? {};
}

test("parseTerraformPlanJson reads engines from nested modules up to the depth limit", () => {
  const plan = { planned_values: { root_module: nestedModules(12) } };
  const addresses = parseTerraformPlanJson(JSON.stringify(plan)).map((declaration) =>
    declaration.kind === "engine_version" ? declaration.address : declaration.kind,
  );
  assert.deepEqual(
    addresses,
    Array.from({ length: 11 }, (_, level) => `m${level}.db`),
  );
});

test("parseTerraformPlanJson reads provider requirements, configurations, and numeric versions", () => {
  const plan = {
    terraform_version: 1.5,
    configuration: {
      provider_config: {
        "aws:west": { name: "aws", full_name: "registry.terraform.io/hashicorp/aws", version_constraint: "~> 5.0" },
        google: { version: 4, source: "hashicorp/google" },
        blank: { version_constraint: "   " },
        skipped: "not a record",
      },
      provider_requirements: {
        aws: { source: "hashicorp/aws", version_constraints: ["~> 5.0", "~> 6.0"] },
        random: { version_constraint: ">= 3.0", source: "hashicorp/random" },
        "not-a-record": 3,
        none: { source: "hashicorp/none" },
      },
    },
  };
  assert.deepEqual(parseTerraformPlanJson(JSON.stringify(plan)), [
    { kind: "cli_version", value: "1.5", pointer: "/terraform_version" },
    {
      kind: "provider_version",
      provider: "aws",
      source: "registry.terraform.io/hashicorp/aws",
      value: "~> 5.0",
      pointer: "/configuration/provider_config/aws:west",
    },
    {
      kind: "provider_version",
      provider: "google",
      source: "hashicorp/google",
      value: "4",
      pointer: "/configuration/provider_config/google",
    },
    {
      kind: "provider_version",
      provider: "random",
      source: "hashicorp/random",
      value: ">= 3.0",
      pointer: "/configuration/provider_requirements/random",
    },
  ]);
});

test("parseTerraformPlanJson falls back to top-level provider configs and resource changes", () => {
  const plan = {
    provider_config: {
      "google.eu": { version_constraint: "~> 4.0", full_name: "hashicorp/google" },
    },
    planned_values: {
      root_module: {
        resources: [
          { address: "a.one", type: "t", name: "one", values: { engine: "mysql", engine_version: "8.0" } },
          { address: "a.one", type: "t", name: "one", values: { engine: "mysql", engine_version: "9.0" } },
          { address: "", type: "t", name: "none", values: { engine: "mysql", engine_version: "8.0" } },
          { address: "a.two", type: "t", name: "two", values: { engine: "mysql" } },
          { address: "a.num", type: "t", name: "num", values: { engine: "mysql", engine_version: 8 } },
          "not a resource",
        ],
      },
    },
    resource_changes: [
      { address: "b.one", type: "r", name: "one", change: { after: { engine: "redis", engine_version: "7" } } },
      { address: "a.one", type: "r", name: "one", change: { after: { engine: "mysql", engine_version: "1" } } },
      { address: "b.two", type: "r", name: "two", change: {} },
      { address: "b.three", type: "r", name: "three", change: { after: null } },
      { type: 7, change: { after: { engine: "redis", engine_version: "7" } } },
      "not a change",
    ],
  };
  assert.deepEqual(parseTerraformPlanJson(JSON.stringify(plan)), [
    {
      kind: "provider_version",
      provider: "google",
      source: "hashicorp/google",
      value: "~> 4.0",
      pointer: "/provider_config/google.eu",
    },
    {
      kind: "engine_version",
      resource: "t",
      name: "one",
      engine: "mysql",
      value: "8.0",
      address: "a.one",
      pointer: "a.one",
    },
    {
      kind: "engine_version",
      resource: "t",
      name: "num",
      engine: "mysql",
      value: "8",
      address: "a.num",
      pointer: "a.num",
    },
    {
      kind: "engine_version",
      resource: "r",
      name: "one",
      engine: "redis",
      value: "7",
      address: "b.one",
      pointer: "/resource_changes/0/change/after",
    },
  ]);
});

test("parseTerraformPlanJson rejects oversized input, malformed JSON, and non-object roots", () => {
  assert.deepEqual(parseTerraformPlanJson("x".repeat(10 * 1024 * 1024 + 1)), []);
  assert.deepEqual(parseTerraformPlanJson("{not json"), []);
  assert.deepEqual(parseTerraformPlanJson("[1, 2]"), []);
});

test("parseTerraformPlanJson stops at the declaration cap", () => {
  const resources = Array.from({ length: 600 }, (_, index) => ({
    address: `r.n${index}`,
    type: "t",
    name: `n${index}`,
    values: { engine: "mysql", engine_version: "8.0" },
  }));
  const declarations = parseTerraformPlanJson(JSON.stringify({ planned_values: { root_module: { resources } } }));
  assert.equal(declarations.length, 500);
});

// ---------------------------------------------------------------------------
// index.ts: TerraformDetector.analyze
// ---------------------------------------------------------------------------

const CLI_RULE = rule({
  id: "terraform.cli.legacy",
  purl: "pkg:generic/terraform",
  vers: "vers:semver/>=1.5.0|<1.6.0",
  summary: "Terraform 1.5 is old.",
});
const AWS_RULE = rule({
  id: "terraform.provider.aws.v4",
  purl: "pkg:generic/terraform-provider/hashicorp/aws",
  vers: "vers:semver/>=4.0.0|<5.0.0",
  summary: "AWS provider 4 is old.",
});
const INTERPOLATION_RULE = rule({
  id: "terraform.syntax.interpolation-only",
  purl: "pkg:generic/terraform",
  vers: "vers:semver/>=0.0.0|<99.0.0",
  summary: "Interpolation-only strings are removed.",
});
const LIST_MAP_RULE = rule({
  id: "terraform.function.list-map",
  purl: "pkg:generic/terraform",
  vers: "vers:semver/>=0.0.0|<99.0.0",
  summary: "list() and map() are removed.",
});
const EKS_RULE = rule({
  id: "terraform.k8s.eks.133",
  purl: "pkg:generic/amazon-eks",
  vers: "vers:semver/>=1.33.0|<1.34.0",
  summary: "EKS 1.33 is old.",
});
const POSTGRES_RULE = rule({
  id: "terraform.database.postgres.12",
  purl: "pkg:generic/postgresql",
  vers: "vers:semver/>=12.0.0|<13.0.0",
  summary: "PostgreSQL 12 is old.",
});

test("analyze reads version files and locked providers, and ignores other registry hosts", async () => {
  const root = await repository({
    ".terraform-version": "1.5.7\n",
    ".tool-versions": "nodejs 20\nterraform 1.5.7\n",
    ".terraform.lock.hcl": [
      'provider "registry.terraform.io/hashicorp/aws" {',
      '  version = "4.67.0"',
      "}",
      'provider "example.com/acme/aws" {',
      '  version = "4.67.0"',
      "}",
      'provider "registry.terraform.io/broken" {',
      '  version = "4.67.0"',
      "}",
      "",
    ].join("\n"),
  });
  const detector = new TerraformDetector(async () => [CLI_RULE, AWS_RULE]);
  const analysis = await detector.analyze({ root });
  assert.deepEqual(
    analysis.findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line, finding.summary]),
    [
      [
        "terraform.cli.legacy",
        ".terraform-version",
        1,
        ".terraform-version pins Terraform 1.5.7. Terraform 1.5 is old.",
      ],
      [
        "terraform.provider.aws.v4",
        ".terraform.lock.hcl",
        2,
        ".terraform.lock.hcl locks provider hashicorp/aws 4.67.0. AWS provider 4 is old.",
      ],
      ["terraform.cli.legacy", ".tool-versions", 2, ".tool-versions pins Terraform 1.5.7. Terraform 1.5 is old."],
    ],
  );
});

test("analyze reports Terraform files: required versions, providers, legacy forms, and unclassified Kubernetes values", async () => {
  const root = await repository({
    "main.tf": [
      "terraform {",
      '  required_version = "1.5.7"',
      "  required_providers {",
      "    aws = {",
      '      source  = "hashicorp/aws"',
      '      version = "4.67.0"',
      "    }",
      "    other = {",
      '      source  = "example.com/acme/other"',
      '      version = "4.67.0"',
      "    }",
      "    random = {",
      '      version = "4.67.0"',
      "    }",
      "  }",
      "}",
      'resource "x" "y" {',
      '  name = "${var.name}"',
      '  tags = list("a", "b")',
      "}",
      'module "eks" {',
      '  source = "terraform-aws-modules/eks/aws"',
      '  cluster_version = "1.33"',
      "}",
      'module "unknown" {',
      '  source = "./modules/cluster"',
      '  kubernetes_version = "1.33"',
      "}",
      'resource "azurerm_kubernetes_cluster" "aks" {',
      "  kubernetes_version = var.version",
      "}",
      'resource "google_container_cluster" "gke" {',
      '  min_master_version = "1.99"',
      "}",
      'resource "google_container_cluster" "gke2" {',
      '  min_master_version = "latest"',
      "}",
      "",
    ].join("\n"),
  });
  const detector = new TerraformDetector(async () => [CLI_RULE, AWS_RULE, INTERPOLATION_RULE, LIST_MAP_RULE, EKS_RULE]);
  const analysis = await detector.analyze({ root });
  assert.deepEqual(
    analysis.findings.map((finding) => [
      finding.ruleId,
      finding.location.line,
      finding.location.column,
      finding.summary,
    ]),
    [
      ["terraform.cli.legacy", 2, undefined, "main.tf requires Terraform 1.5.7. Terraform 1.5 is old."],
      [
        "terraform.provider.aws.v4",
        6,
        undefined,
        "main.tf requires provider hashicorp/aws 4.67.0. AWS provider 4 is old.",
      ],
      [
        "terraform.syntax.interpolation-only",
        18,
        10,
        'main.tf uses the interpolation-only string "${var.name}". Interpolation-only strings are removed.',
      ],
      [
        "terraform.function.list-map",
        19,
        10,
        "main.tf calls the list() function with 2 arguments. list() and map() are removed.",
      ],
      ["terraform.k8s.eks.133", 23, undefined, "main.tf sets module.eks cluster_version 1.33. EKS 1.33 is old."],
    ],
  );
  assert.deepEqual(
    analysis.unclassified.map((entry) => [entry.component, entry.reference, entry.reason]),
    [
      ["kubernetes", "1.33", "the module source is not a known managed Kubernetes module"],
      [
        "azure-kubernetes-service",
        "var.version",
        "the value is a variable or module reference, so Evergreen does not judge it",
      ],
      [
        "google-kubernetes-engine",
        "latest",
        "the value is not a Kubernetes version number, so Evergreen does not judge it",
      ],
    ],
  );
});

test("analyze skips legacy forms when their rules are not in the registry", async () => {
  const root = await repository({
    "main.tf": 'resource "x" "y" {\n  tags = list("a")\n  name = "${var.name}"\n}\n',
  });
  const detector = new TerraformDetector(async () => [CLI_RULE]);
  const analysis = await detector.analyze({ root });
  assert.deepEqual(analysis.findings, []);
  assert.deepEqual(analysis.unclassified, []);
});

test("analyze reads plan JSON for CLI, provider, and engine versions", async () => {
  const root = await repository({
    "plan.json": JSON.stringify({
      terraform_version: "1.5.7",
      configuration: {
        provider_requirements: { aws: { source: "hashicorp/aws", version_constraint: "4.67.0" } },
      },
      planned_values: {
        root_module: {
          resources: [
            {
              address: "aws_db_instance.a",
              type: "aws_db_instance",
              name: "a",
              values: { engine: "postgres", engine_version: "12.4" },
            },
          ],
        },
      },
      resource_changes: [
        {
          address: "aws_db_instance.b",
          type: "aws_db_instance",
          name: "b",
          change: { after: { engine: "mysql", engine_version: "8.0" } },
        },
        {
          address: "aws_db_instance.c",
          type: "aws_db_instance",
          name: "c",
          change: { after: { engine: "unknown-engine", engine_version: "1" } },
        },
      ],
    }),
  });
  const detector = new TerraformDetector(async () => [CLI_RULE, AWS_RULE, POSTGRES_RULE]);
  const analysis = await detector.analyze({ root });
  assert.deepEqual(
    analysis.findings.map((finding) => [finding.ruleId, finding.location.path, finding.location.line, finding.summary]),
    [
      [
        "terraform.cli.legacy",
        "plan.json",
        1,
        "plan.json (/terraform_version) resolves Terraform 1.5.7. Terraform 1.5 is old.",
      ],
      [
        "terraform.database.postgres.12",
        "plan.json",
        1,
        "plan.json (aws_db_instance.a) resolves aws_db_instance.a engine postgres 12.4. PostgreSQL 12 is old.",
      ],
      [
        "terraform.provider.aws.v4",
        "plan.json",
        1,
        "plan.json (/configuration/provider_requirements/aws) constrains provider hashicorp/aws 4.67.0. AWS provider 4 is old.",
      ],
    ],
  );
});

test("analyze returns nothing for a repository without Terraform files", async () => {
  const root = await repository({ "README.md": "# nothing here\n" });
  const analysis = await new TerraformDetector(async () => [CLI_RULE]).analyze({ root });
  assert.deepEqual(analysis, { findings: [], unclassified: [] });
});
