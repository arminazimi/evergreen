import { test } from "node:test";

import { checkRoundTrip, checkToleratesArbitraryText, type RoundTripCase } from "./harness.js";

/**
 * Property tests for the infrastructure formats: Kubernetes manifests, Helm charts and Kustomize
 * overlays, Terraform configuration, lockfiles and plans, serverless runtimes, MSBuild and XML
 * project documents, Xcode build settings, and managed-database declarations.
 *
 * These parsers keep the text as written, so the markers are the values the declaration names —
 * with two exceptions the cases spell out: a Helm `Chart.yaml` reads an unquoted version as a
 * number, and an image tag loses its registry.
 */

const RUNTIMES = "nodejs14.x|python3.9|dotnet6";

/** A `project.pbxproj` with one application target whose build settings pin an iOS deployment target. */
function xcodeProject(version: string): string {
  return [
    "// !$*UTF8*$!",
    "{",
    "\tobjects = {",
    "\t\tA100000000000000000000A1 /* App */ = {",
    "\t\t\tisa = PBXNativeTarget;",
    "\t\t\tbuildConfigurationList = B100000000000000000000B1;",
    '\t\t\tproductType = "com.apple.product-type.application";',
    "\t\t};",
    "\t\tB100000000000000000000B1 /* Config */ = {",
    "\t\t\tisa = XCConfigurationList;",
    "\t\t\tbuildConfigurations = (",
    "\t\t\t\tC100000000000000000000C1 /* Release */,",
    "\t\t\t);",
    "\t\t};",
    "\t\tC100000000000000000000C1 /* Release */ = {",
    "\t\t\tisa = XCBuildConfiguration;",
    "\t\t\tbuildSettings = {",
    `\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = ${version};`,
    "\t\t\t};",
    "\t\t\tname = Release;",
    "\t\t};",
    "\t};",
    "}",
    "",
  ].join("\n");
}

const CASES: readonly RoundTripCase[] = [
  // Kubernetes: a manifest's apiVersion and kind, a chart dependency, a Kustomize patch target.
  {
    name: "parseManifest",
    file: ({ name, version }) => `apiVersion: ${name}/${version}\nkind: zzMark\n`,
    names: "apps|batch",
    versions: "v1|v1beta1",
    markers: ({ name, version }) => [name, version, "zzMark"],
  },
  {
    name: "parseTemplate (helm)",
    file: ({ name, version }) => `apiVersion: ${name}/${version}\nkind: zzCronJob\n`,
    names: "apps|batch",
    versions: "v1|v1beta1",
    markers: ({ name, version }) => [name, version, "zzCronJob"],
  },
  {
    name: "parseChart",
    file: ({ name, version }) =>
      `dependencies:\n  - name: ${name}\n    version: "${version}"\n    repository: https://charts.example.com/${name}\n`,
    names: "zzmark|redis",
    versions: "9.8.7|1.21",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseKustomization",
    file: ({ name, version }) =>
      `patches:\n  - target:\n      group: ${name}\n      version: ${version}\n      kind: zzCronJob\n`,
    names: "batch|apps",
    versions: "v1beta1|v1",
    markers: ({ name, version }) => [`${name}/${version}`, "zzCronJob"],
  },

  // Terraform: a required provider, a legacy interpolation, a lockfile entry, a plan, an EKS module.
  {
    name: "parseTerraformFile",
    file: ({ name, version }) =>
      `terraform {\n  required_providers {\n    ${name} = {\n      source = "hashicorp/${name}"\n      version = "${version}"\n    }\n  }\n}\n`,
    names: "aws|azurerm",
    versions: "9.8.7|~> 5.0",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseTerraformLegacy",
    file: ({ name }) => `w = "$\{var.${name}}"\n`,
    names: "zzmark|image_tag",
    versions: "9.8.7",
    markers: ({ name }) => [`var.${name}`, "interpolation_only"],
  },
  {
    name: "parseTerraformLock",
    file: ({ name, version }) => `provider "registry.terraform.io/hashicorp/${name}" {\n  version = "${version}"\n}\n`,
    names: "aws|google",
    versions: "9.8.7|3.76.0",
    markers: ({ name, version }) => [`registry.terraform.io/hashicorp/${name}`, version],
  },
  {
    name: "parseTerraformPlanJson",
    file: ({ name, version }) =>
      `{"configuration":{"provider_config":{"${name}":{"version_constraint":"${version}"}}}}\n`,
    names: "aws|google",
    versions: "9.8.7|5.0",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseManagedKubernetes",
    file: ({ name, version }) =>
      `module "${name}" {\n  source = "terraform-aws-modules/eks/aws"\n  cluster_version = "${version}"\n}\n`,
    names: "zzmark",
    versions: "9.8.7|1.29",
    markers: ({ name, version }) => [name, version, "amazon-eks"],
  },

  // Serverless runtimes: the framework file, a CloudFormation template, and a raw Terraform resource.
  {
    name: "parseServerlessYml",
    file: ({ version }) => `provider:\n  name: aws\n  runtime: ${version}\n`,
    names: "aws",
    versions: RUNTIMES,
    markers: ({ version }) => [version],
  },
  {
    name: "parseTemplate (serverless)",
    file: ({ version }) => `Globals:\n  Function:\n    Runtime: ${version}\n`,
    names: "aws",
    versions: RUNTIMES,
    markers: ({ version }) => [version],
  },
  {
    name: "parseTf",
    file: ({ name, version }) => `resource "aws_lambda_function" "${name}" {\n  runtime = "${version}"\n}\n`,
    names: "zzmark",
    versions: RUNTIMES,
    markers: ({ version }) => [version, "aws"],
  },

  // Project documents.
  {
    name: "parseMsbuild",
    file: ({ name, version }) =>
      `<Project><ItemGroup><PackageReference Include="${name}" Version="${version}"/></ItemGroup></Project>\n`,
    names: "zzmark|Newtonsoft.Json",
    versions: "9.8.7|13.0.1",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseXml",
    file: ({ name, version }) => `<${name}>${version}</${name}>\n`,
    names: "project|version",
    versions: "9.8.7",
    markers: ({ name, version }) => [name, version],
  },
  {
    name: "parseXcodeProjectIOSDeploymentTargets",
    file: ({ version }) => xcodeProject(version),
    names: "app",
    versions: "9.8.7|15.2",
    markers: ({ version }) => [version],
  },

  // Managed databases.
  {
    name: "parseDatabaseCompose",
    file: ({ name, version }) => `services:\n  ${name}:\n    image: postgres:${version}\n`,
    names: "zzmark",
    versions: "9.8.7|14.2",
    markers: ({ version }) => [version, "postgres"],
  },
  {
    name: "parseDatabaseTerraform",
    file: ({ name, version }) =>
      `resource "aws_db_instance" "${name}" {\n  engine = "postgres"\n  engine_version = "${version}"\n}\n`,
    names: "zzmark",
    versions: "9.8.7|14.2",
    markers: ({ name, version }) => [name, version, "postgres"],
  },
];

for (const target of CASES) {
  test(`${target.name} round-trips a canonical declaration`, () => {
    checkRoundTrip(target);
  });
}

test("every infrastructure parser tolerates arbitrary text", () => {
  for (const target of CASES) checkToleratesArbitraryText(target.name);
});
