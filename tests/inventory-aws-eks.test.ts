import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { test } from "node:test";

import { loadDataFile } from "@velella/ebb/data-source";
import { eksImporter } from "../src/inventory/aws-eks.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryItem } from "../src/inventory/types.js";
import { validateRegistryV2 } from "@velella/ebb/registry";
import type { RegistryV2Rule } from "@velella/ebb/registry";
import { runCli } from "./cli-runner.js";

const EKS = "pkg:generic/amazon-eks";
const AMAZON_LINUX = "pkg:generic/amzn";
const CALENDAR = "https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html";

const FIXTURES = resolve("tests/fixtures/inventory");
const AWS_EKS = join(FIXTURES, "aws-eks");
const REJECTS = join(AWS_EKS, "rejects");

/** The documents this importer reads, in the order `describe-*` then the narrower samples. */
const DOCUMENTS = [
  "describe-cluster.json",
  "describe-nodegroup.json",
  "describe-all.json",
  "nodegroup-self-managed.json",
  "nodegroup-other-ami.json",
];

/** Resolves an RFC 6901 JSON Pointer against a parsed document. */
function resolvePointer(document: unknown, pointer: string): unknown {
  assert.ok(pointer.startsWith("/"), `not a JSON pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>((value, token) => {
      const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
      if (Array.isArray(value)) return value[Number(key)];
      if (typeof value === "object" && value !== null) return (value as Record<string, unknown>)[key];
      return undefined;
    }, document);
}

async function jsonFilesUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...(await jsonFilesUnder(path)));
    else if (entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

async function documentOf(name: string): Promise<unknown> {
  return parseExport(await readFile(join(AWS_EKS, name), "utf8"));
}

async function itemsOf(name: string): Promise<InventoryItem[]> {
  const file = join(AWS_EKS, name);
  return eksImporter.items(await documentOf(name), file);
}

function describe(items: InventoryItem[]): [string, string, string, string | undefined][] {
  return items.map((item) => [item.pointer, item.resource, item.purl, item.version]);
}

async function invokeCli(...args: string[]) {
  return runCli(args);
}

test("every EKS document type is detected and produces items whose pointers resolve", async () => {
  for (const name of DOCUMENTS) {
    const file = join(AWS_EKS, name);
    const document = await documentOf(name);
    assert.equal(eksImporter.detect(document, file), true, name);
    const items = eksImporter.items(document, file);
    assert.ok(items.length > 0, name);
    for (const item of items) {
      assert.equal(item.importer, "aws-eks");
      assert.equal(item.file, file);
      assert.ok(item.resource.length > 0, `${name} ${item.pointer}`);
      assert.match(item.purl, /^pkg:generic\/(amazon-eks|amzn)$/);
      const value = resolvePointer(document, item.pointer);
      assert.equal(typeof value, "string", `${name} ${item.pointer}`);
      // An amiType item reports the Amazon Linux release the AMI type is built on, not the type string itself.
      if (item.purl === AMAZON_LINUX)
        assert.ok(
          String(value).includes(item.version ?? ""),
          `${name} ${item.pointer} reads ${String(value)} for ${String(item.version)}`,
        );
      else assert.equal(value, item.version, `${name} ${item.pointer}`);
    }
  }
});

test("a cluster export reports its version under /cluster/version", async () => {
  assert.deepEqual(describe(await itemsOf("describe-cluster.json")), [
    ["/cluster/version", "prod-payments", EKS, "1.30.7"],
  ]);
});

test("a node group export reports its EKS version and its Amazon Linux release", async () => {
  assert.deepEqual(describe(await itemsOf("describe-nodegroup.json")), [
    ["/nodegroup/version", "prod-payments/workers", EKS, "1.30.7"],
    ["/nodegroup/amiType", "prod-payments/workers", AMAZON_LINUX, "2023"],
  ]);
  // The AMI build string (`releaseVersion`) and the platform version are not lifecycle versions.
  assert.ok(!(await itemsOf("describe-nodegroup.json")).some((item) => item.pointer.includes("releaseVersion")));
  assert.ok(!(await itemsOf("describe-nodegroup.json")).some((item) => item.pointer.includes("platformVersion")));
});

test("a collected array of exports keeps one pointer prefix per entry", async () => {
  assert.deepEqual(describe(await itemsOf("describe-all.json")), [
    ["/0/cluster/version", "prod-edge", EKS, "1.34.2"],
    ["/1/nodegroup/version", "prod-edge/workers", EKS, "1.31.4"],
    ["/1/nodegroup/amiType", "prod-edge/workers", AMAZON_LINUX, "2"],
    ["/2/nodegroup/version", "prod-edge/gpu-pool", EKS, "1.34.2"],
    ["/2/nodegroup/amiType", "prod-edge/gpu-pool", AMAZON_LINUX, "2023"],
    ["/3/cluster/version", "staging", EKS, "1.36.1"],
  ]);
});

test("every published Amazon Linux amiType maps to its release line", async () => {
  const document = await documentOf("describe-all.json");
  const items = await itemsOf("describe-all.json");
  assert.deepEqual(
    items.filter((item) => item.purl === AMAZON_LINUX).map((item) => [item.resource, item.version]),
    [
      ["prod-edge/workers", "2"],
      ["prod-edge/gpu-pool", "2023"],
    ],
  );
  // The pointer marks the AMI type the release was read from.
  assert.equal(resolvePointer(document, "/1/nodegroup/amiType"), "AL2_x86_64");
  assert.equal(resolvePointer(document, "/2/nodegroup/amiType"), "AL2023_x86_64_NVIDIA");
  const selfManaged = await itemsOf("nodegroup-self-managed.json");
  assert.deepEqual(describe(selfManaged), [["/nodegroup/amiType", "self-managed-batch", AMAZON_LINUX, "2"]]);
});

test("a Bottlerocket, Windows, or CUSTOM amiType produces no Amazon Linux item", async () => {
  const items = await itemsOf("nodegroup-other-ami.json");
  assert.deepEqual(describe(items), [
    ["/0/nodegroup/version", "prod-edge/bottlerocket-pool", EKS, "1.35.2"],
    ["/1/nodegroup/version", "prod-edge/windows-pool", EKS, "1.35.2"],
    ["/2/nodegroup/version", "prod-edge/custom-image-pool", EKS, "1.35.2"],
  ]);
  assert.ok(!items.some((item) => item.purl === AMAZON_LINUX));
});

test("a node group names itself alone when the export carries no clusterName", async () => {
  const items = await itemsOf("nodegroup-self-managed.json");
  assert.deepEqual(
    items.map((item) => item.resource),
    ["self-managed-batch"],
  );
});

test("the EKS rules give every document type a verdict against the bundled registries", async () => {
  const report = await runInventory(DOCUMENTS.map((name) => join(AWS_EKS, name)));
  assert.deepEqual(report.unrecognized, []);
  const find = (name: string, pointer: string) => {
    const file = join(AWS_EKS, name);
    const result = report.results.find((entry) => entry.item.file === file && entry.item.pointer === pointer);
    assert.ok(result, `${name} ${pointer}`);
    return result.check;
  };
  assert.equal(find("describe-cluster.json", "/cluster/version").status, "affected");
  assert.equal(find("describe-cluster.json", "/cluster/version").severity, "high");
  assert.deepEqual(
    find("describe-cluster.json", "/cluster/version").findings.map((finding) => finding.ruleId),
    ["kubernetes.amazon-eks.1-30-and-older"],
  );
  assert.equal(find("describe-nodegroup.json", "/nodegroup/amiType").status, "not-affected");
  assert.match(find("describe-nodegroup.json", "/nodegroup/amiType").message, /none applies to this version/);
  assert.equal(find("describe-all.json", "/0/cluster/version").severity, "low");
  assert.deepEqual(
    find("describe-all.json", "/0/cluster/version").findings.map((finding) => [
      finding.ruleId,
      finding.event,
      finding.deadline,
    ]),
    [["kubernetes.amazon-eks.1-34", "scheduled-end-of-life", "2026-12-02"]],
  );
  assert.equal(find("describe-all.json", "/1/nodegroup/amiType").severity, "high");
  assert.deepEqual(
    find("describe-all.json", "/1/nodegroup/amiType").findings.map((finding) => finding.ruleId),
    ["container.host-amazon-linux.eol-2-and-older"],
  );
  assert.deepEqual(
    find("describe-all.json", "/1/nodegroup/version").findings.map((finding) => [finding.ruleId, finding.deadline]),
    [["kubernetes.amazon-eks.1-31", "2025-11-26"]],
  );
  assert.equal(find("describe-all.json", "/2/nodegroup/amiType").status, "not-affected");
  assert.deepEqual(
    find("describe-all.json", "/3/cluster/version").findings.map((finding) => finding.ruleId),
    ["kubernetes.amazon-eks.1-36"],
  );
  assert.deepEqual(
    find("nodegroup-other-ami.json", "/0/nodegroup/version").findings.map((finding) => finding.ruleId),
    ["kubernetes.amazon-eks.1-35"],
  );
});

test("every EKS rule cites the AWS EKS version lifecycle page", async () => {
  const rules: RegistryV2Rule[] = [];
  for (const registry of eksImporter.registries) {
    rules.push(...validateRegistryV2(await loadDataFile(`registry/${registry}.json`)).rules);
  }
  const eks = rules.filter((rule) => rule.purl === EKS);
  assert.equal(eks.length, 7, `${eks.length} EKS rules`);
  for (const rule of eks) {
    assert.ok(
      rule.sources.some((source) => source.url === CALENDAR),
      `${rule.id} cites ${rule.sources.map((source) => source.url).join(", ")}`,
    );
    assert.ok(rule.migration, rule.id);
    assert.ok(
      rule.migration.steps.some((step) => step.targets === "declaration"),
      rule.id,
    );
  }
  assert.deepEqual(eks.map((rule) => rule.id).sort(), [
    "kubernetes.amazon-eks.1-30-and-older",
    "kubernetes.amazon-eks.1-31",
    "kubernetes.amazon-eks.1-32",
    "kubernetes.amazon-eks.1-33",
    "kubernetes.amazon-eks.1-34",
    "kubernetes.amazon-eks.1-35",
    "kubernetes.amazon-eks.1-36",
  ]);
});

test("detection recognizes only these documents and rejects every other shape", async () => {
  for (const file of await jsonFilesUnder(FIXTURES)) {
    const document = parseExport(await readFile(file, "utf8"));
    const ours = file.startsWith(`${AWS_EKS}${sep}`) && !file.startsWith(`${REJECTS}${sep}`);
    assert.equal(eksImporter.detect(document, file), ours, file);
    if (!ours) assert.deepEqual(eksImporter.items(document, file), [], file);
  }
  for (const value of [
    null,
    undefined,
    0,
    "1.30",
    {},
    [],
    { cluster: [] },
    { version: "1.30" },
    { clusters: ["prod-edge"] },
    { cluster: { name: "edge", version: "1-30" } },
  ]) {
    assert.equal(eksImporter.detect(value, "describe-cluster.json"), false, JSON.stringify(value));
  }
});

test("an AMI type, a release name, or a version this importer does not read produces no item", async () => {
  for (const document of [
    { nodegroup: { nodegroupName: "workers", clusterName: "prod-edge", amiType: "AL2_x86_64" } },
    {
      nodegroup: {
        nodegroupName: "workers",
        clusterName: "prod-edge",
        version: "1.34.2",
        amiType: "BOTTLEROCKET_x86_64",
      },
    },
    { nodegroup: { nodegroupName: "workers", version: "1.34" } },
    { cluster: { name: "edge", version: "" } },
    { cluster: { name: "edge", version: 1.3 } },
    { cluster: { name: "edge", version: "1.30.12-eks-130f479" } },
    { cluster: { name: "edge", version: "1.30.7.1" } },
    { cluster: { name: "", version: "1.30" } },
    { nodegroup: { nodegroupName: "", version: "1.30" } },
  ]) {
    const items = eksImporter.items(document, "describe-cluster.json");
    assert.equal(eksImporter.detect(document, "describe-cluster.json"), items.length > 0, JSON.stringify(document));
  }
  assert.deepEqual(eksImporter.items({ cluster: { name: "edge", version: "" } }, "edge.json"), []);
  assert.deepEqual(
    eksImporter
      .items(
        { nodegroup: { nodegroupName: "workers", version: "1.34.2", amiType: "BOTTLEROCKET_x86_64" } },
        "workers.json",
      )
      .map((item) => item.purl),
    [EKS],
  );
});

test("output never contains an account id, ARN, endpoint hostname, network id, or SSH key", async () => {
  const files = DOCUMENTS.map((name) => join(AWS_EKS, name));
  const identifiers = [
    "123456789012",
    "arn:aws:",
    "iam::",
    ".eks.amazonaws.com",
    "oidc.eks",
    "A1B2C3D4E5F6",
    "subnet-0a1b2c3d4e5f67890",
    "vpc-0123456789abcdef0",
    "sg-0123456789abcdef0",
    "0.0.0.0/0",
    "10.100.0.0",
    "prod-payments-placeholder",
    "1.30.12-eks",
    "us-east-1",
    "us-west-2",
  ];
  for (const extra of [[], ["--json"]]) {
    const result = await invokeCli("inventory", ...files, ...extra);
    assert.equal(result.code, 1);
    for (const identifier of identifiers)
      assert.ok(
        !result.stdout.includes(identifier),
        `${identifier} leaked${extra.length > 0 ? " in JSON" : " in text"}`,
      );
  }
});

test("--redact hides every cluster and node group name in text and JSON output", async () => {
  const files = DOCUMENTS.map((name) => join(AWS_EKS, name));
  const resources = [
    "prod-payments",
    "prod-payments/workers",
    "prod-edge",
    "prod-edge/workers",
    "prod-edge/gpu-pool",
    "prod-edge/bottlerocket-pool",
    "prod-edge/windows-pool",
    "prod-edge/custom-image-pool",
    "self-managed-batch",
    "staging",
  ];
  for (const extra of [[], ["--json"]]) {
    const result = await invokeCli("inventory", ...files, "--redact", ...extra);
    assert.equal(result.code, 1);
    for (const resource of resources)
      assert.ok(!result.stdout.includes(resource), `${resource} leaked${extra.length > 0 ? " in JSON" : " in text"}`);
    assert.match(result.stdout, /[0-9a-f]{12}/);
  }
});

test("the example reports an affected EKS cluster and exits 1", async () => {
  const result = await invokeCli("inventory", "examples/inventory/aws-eks.json", "--json");
  assert.equal(result.code, 1);
  const report = JSON.parse(result.stdout) as {
    results: Array<{ item: { importer: string }; check: { status: string } }>;
  };
  assert.ok(report.results.every((entry) => entry.item.importer === "aws-eks"));
  assert.ok(report.results.some((entry) => entry.check.status === "affected"));
});

test("--format aws-eks still detects the format, and an unknown importer exits 2", async () => {
  const file = join(AWS_EKS, "describe-all.json");
  const forced = await invokeCli("inventory", file, "--format", "aws-eks", "--json");
  assert.equal(forced.code, 1);
  assert.ok((JSON.parse(forced.stdout) as { results: unknown[] }).results.length > 0);
  const bad = await invokeCli("inventory", file, "--format", "nope");
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Unknown importer for --format: nope/);
});

test("the fixtures live under the importer's own directory", async () => {
  const paths = (await jsonFilesUnder(AWS_EKS)).map((file) => relative(FIXTURES, file).split(sep).join("/"));
  assert.deepEqual(paths.sort(), [
    "aws-eks/describe-all.json",
    "aws-eks/describe-cluster.json",
    "aws-eks/describe-nodegroup.json",
    "aws-eks/nodegroup-other-ami.json",
    "aws-eks/nodegroup-self-managed.json",
    "aws-eks/rejects/array-of-strings.json",
    "aws-eks/rejects/cluster-no-name.json",
    "aws-eks/rejects/cluster-no-version.json",
    "aws-eks/rejects/cluster-suffixed-version.json",
    "aws-eks/rejects/cluster-version-not-text.json",
    "aws-eks/rejects/describe-cluster-versions.json",
    "aws-eks/rejects/empty-array.json",
    "aws-eks/rejects/list-clusters.json",
    "aws-eks/rejects/list-nodegroups.json",
    "aws-eks/rejects/nodegroup-no-version.json",
    "aws-eks/rejects/wrapper-not-an-object.json",
  ]);
});
