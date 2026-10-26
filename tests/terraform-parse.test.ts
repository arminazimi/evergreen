import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { MAXIMUM_INPUT_BYTES, parseTerraformFile } from "../src/detectors/terraform/parse-terraform.js";
import { parseManagedKubernetes } from "../src/detectors/terraform/kubernetes.js";

const fixtures = resolve("tests/fixtures/terraform");

async function fixture(path: string): Promise<string> {
  return readFile(resolve(fixtures, path), "utf8");
}

test("parses required_version and provider constraints with exact lines", async () => {
  assert.deepEqual(parseTerraformFile(await fixture("positive/main.tf")), [
    { kind: "required_version", value: "~> 0.12.31", line: 2 },
    { kind: "provider_version", provider: "aws", source: "hashicorp/aws", value: "~> 3.0", line: 7 },
  ]);
  assert.deepEqual(parseTerraformFile(await fixture("zero/main.tf")), [
    { kind: "required_version", value: "~> 1.9.0", line: 2 },
    { kind: "provider_version", provider: "aws", source: "hashicorp/aws", value: "~> 5.0", line: 7 },
  ]);
});

test("ignores comments, variable defaults, references, modules, resources, and strings", async () => {
  assert.deepEqual(parseTerraformFile(await fixture("negative/main.tf")), []);
});

test("returns nothing for malformed files", async () => {
  assert.deepEqual(parseTerraformFile(await fixture("malformed/main.tf")), []);
  assert.deepEqual(parseTerraformFile('terraform {\n  required_version = "~> 1.0"\n'), []);
  assert.deepEqual(parseTerraformFile('terraform {\n  /* required_version = "1.0"\n}\n'), []);
  assert.deepEqual(parseTerraformFile(""), []);
});

test("supports several terraform blocks, CRLF, a byte order mark, and a provider without source", () => {
  const contents =
    '﻿terraform {\r\n  required_version = ">= 1.5"\r\n}\r\nterraform {\r\n  required_providers {\r\n    null = {\r\n      version = "3.2.1"\r\n    }\r\n  }\r\n}\r\n';
  assert.deepEqual(parseTerraformFile(contents), [
    { kind: "required_version", value: ">= 1.5", line: 2 },
    { kind: "provider_version", provider: "null", value: "3.2.1", line: 7 },
  ]);
});

test("accepts one-line blocks and trailing comments", () => {
  assert.deepEqual(parseTerraformFile('terraform { required_version = "1.5.7" }\n'), [
    { kind: "required_version", value: "1.5.7", line: 1 },
  ]);
  assert.deepEqual(parseTerraformFile('terraform {\n  required_version = "1.5.7" # pinned\n}\n'), [
    { kind: "required_version", value: "1.5.7", line: 2 },
  ]);
});

test("skips dynamic and unsupported value forms", () => {
  for (const value of [
    "var.v",
    '"${var.v}"',
    '"1.0\\n"',
    '""',
    'format("%s", "1.0")',
    '"1.0" + "x"',
    '[ "1.0" ]',
    "<<EOT\n1.0\nEOT",
  ]) {
    assert.deepEqual(parseTerraformFile(`terraform {\n  required_version = ${value}\n}\n`), [], value);
  }
  assert.deepEqual(parseTerraformFile('terraform "x" {\n  required_version = "1.0"\n}\n'), []);
  assert.deepEqual(parseTerraformFile('locals {\n  terraform {\n    required_version = "1.0"\n  }\n}\n'), []);
  assert.deepEqual(
    parseTerraformFile('terraform {\n  backend "s3" {\n    required_version = "1.0"\n  }\n}\n'),
    [],
  );
});

test("does not read nested or non-provider version attributes", () => {
  const contents = `terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
      configuration_aliases = [aws.west]
      nested = {
        version = "9.9.9"
      }
    }
    google = "~> 4.0"
  }
}
`;
  assert.deepEqual(parseTerraformFile(contents), []);
});

test("bounds oversized input", () => {
  const padding = "# ".padEnd(MAXIMUM_INPUT_BYTES + 1, "x");
  assert.deepEqual(parseTerraformFile(`${padding}\nterraform {\n  required_version = "1.0"\n}\n`), []);
  const longLine = `terraform {\n  required_version = "1.0"\n  # ${"x".repeat(5000)}\n}\n`;
  assert.deepEqual(parseTerraformFile(longLine), [{ kind: "required_version", value: "1.0", line: 2 }]);
});

test("parses managed Kubernetes versions from resources and modules", () => {
  const contents = `module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  cluster_version = "1.33"
}

resource "google_container_cluster" "primary" {
  name               = "primary"
  min_master_version = "1.30"
}

resource "azurerm_kubernetes_cluster" "main" {
  kubernetes_version = "1.31.4"
}
`;
  assert.deepEqual(parseManagedKubernetes(contents), [
    { product: "amazon-eks", block: "module", name: "eks", attribute: "cluster_version", value: "1.33", literal: true, line: 3 },
    { product: "google-kubernetes-engine", block: "google_container_cluster", name: "primary", attribute: "min_master_version", value: "1.30", literal: true, line: 8 },
    { product: "azure-kubernetes-service", block: "azurerm_kubernetes_cluster", name: "main", attribute: "kubernetes_version", value: "1.31.4", literal: true, line: 12 },
  ]);
});

test("returns references, interpolations, and other expressions as non-literal", () => {
  assert.deepEqual(
    parseManagedKubernetes(`module "eks" {
  cluster_version = var.eks_version
}
resource "azurerm_kubernetes_cluster" "main" {
  kubernetes_version = module.aks.version
}
resource "google_container_cluster" "primary" {
  min_master_version = local.gke_version
}
resource "azurerm_kubernetes_cluster" "other" {
  kubernetes_version = "\${var.interpolated}"
}
`),
    [
      { product: "amazon-eks", block: "module", name: "eks", attribute: "cluster_version", value: "var.eks_version", literal: false, line: 2 },
      { product: "azure-kubernetes-service", block: "azurerm_kubernetes_cluster", name: "main", attribute: "kubernetes_version", value: "module.aks.version", literal: false, line: 5 },
      { product: "google-kubernetes-engine", block: "google_container_cluster", name: "primary", attribute: "min_master_version", value: "local.gke_version", literal: false, line: 8 },
      { product: "azure-kubernetes-service", block: "azurerm_kubernetes_cluster", name: "other", attribute: "kubernetes_version", value: '"\${var.interpolated}"', literal: false, line: 11 },
    ],
  );
});

test("ignores unrelated blocks, resource types, attributes, and nested values", () => {
  const contents = `locals {
  cluster_version = "1.20"
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

module "vpc" {
  version = "3.0.0"
}

module {
  kubernetes_version = "1.20"
}

resource "azurerm_kubernetes_cluster" {
  kubernetes_version = "1.20"
}

resource "azurerm_kubernetes_cluster" "empty" {
  kubernetes_version =
}

terraform {
  kubernetes_version = "1.20"
}
`;
  assert.deepEqual(parseManagedKubernetes(contents), []);
  assert.deepEqual(parseManagedKubernetes('resource "azurerm_kubernetes_cluster" "main" {\n  kubernetes_version = "1.31" + var.suffix\n}\n'), []);
});

test("accepts one-line blocks, CRLF, a byte order mark, and trailing comments", () => {
  assert.deepEqual(parseManagedKubernetes('module "eks" { cluster_version = "1.31" }\n'), [
    { product: "amazon-eks", block: "module", name: "eks", attribute: "cluster_version", value: "1.31", literal: true, line: 1 },
  ]);
  const contents = '\ufeffmodule "eks" {\r\n  cluster_version = "1.31" # pinned\r\n}\r\n';
  assert.deepEqual(parseManagedKubernetes(contents), [
    { product: "amazon-eks", block: "module", name: "eks", attribute: "cluster_version", value: "1.31", literal: true, line: 2 },
  ]);
});

test("returns nothing for malformed or oversized managed Kubernetes input", () => {
  assert.deepEqual(parseManagedKubernetes('module "eks" {\n  cluster_version = "1.31\n}\n'), []);
  assert.deepEqual(parseManagedKubernetes('module "eks" {\n  # cluster_version = "1.31"\n}\n'), []);
  assert.deepEqual(parseManagedKubernetes(""), []);
  const padding = "# ".padEnd(MAXIMUM_INPUT_BYTES + 1, "x");
  assert.deepEqual(parseManagedKubernetes(`${padding}\nmodule "eks" {\n  cluster_version = "1.31"\n}\n`), []);
});
