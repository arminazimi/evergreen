import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { k8sClusterImporter } from "../src/inventory/k8s-cluster.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryReport } from "../src/inventory/types.js";
import { runCli } from "./cli-runner.js";

const fixtures = resolve("tests/fixtures/inventory");
const clusterFixtures = resolve(fixtures, "k8s-cluster");
const versionExport = resolve(clusterFixtures, "version.json");
const nodesExport = resolve(clusterFixtures, "nodes.json");
const clusterExample = resolve("examples/inventory/k8s-cluster.json");
const nodesExample = resolve("examples/inventory/k8s-nodes.json");

/** The fixture files that are genuine k8s-cluster exports. A `Node` list the workloads fixtures hold is one too. */
const CLUSTER_EXPORTS = [
  join("k8s-cluster", "version.json"),
  join("k8s-cluster", "nodes.json"),
  join("k8s-workloads", "nodes.json"),
];

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

/** RFC 6901 resolution, enough for the pointers importers emit. */
function resolvePointer(document: unknown, pointer: string): unknown {
  let value = document;
  for (const raw of pointer.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(value)) value = value[Number(key)];
    else if (typeof value === "object" && value !== null) value = (value as Record<string, unknown>)[key];
    else return undefined;
  }
  return value;
}

/** The upstream release a gitVersion names, by the importer's rule. */
function upstreamVersion(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$/.exec(value.trim());
  if (!match) return undefined;
  return `${match[1]}.${match[2]}.${match[3] ?? "0"}`;
}

/** The release an osImage names, by the importer's rule: an SP suffix for SLES, else the first release token. */
function imageVersion(image: string): string | undefined {
  const sp = /SUSE Linux Enterprise Server (\d+)(?: SP(\d+))?/.exec(image);
  if (sp) return `${sp[1]}.${sp[2] ?? "0"}`;
  return /\d+(?:\.\d+)*/.exec(image)?.[0];
}

async function invokeCli(...args: string[]) {
  return runCli(args);
}

test("detect accepts the version and node exports and rejects other shapes", async () => {
  assert.equal(k8sClusterImporter.detect(await readJson(versionExport), "version.json"), true);
  assert.equal(k8sClusterImporter.detect(await readJson(nodesExport), "nodes.json"), true);
  assert.equal(
    k8sClusterImporter.detect(await readJson(resolve(fixtures, "k8s-workloads/workloads.json")), "workloads.json"),
    false,
  );
  assert.equal(
    k8sClusterImporter.detect(await readJson(resolve(fixtures, "k8s-workloads/empty-list.json")), "empty-list.json"),
    false,
  );
  assert.equal(
    k8sClusterImporter.detect(await readJson(resolve(fixtures, "k8s-workloads/single-pod.json")), "single-pod.json"),
    false,
  );
  assert.equal(k8sClusterImporter.detect({}, "empty.json"), false);
  assert.equal(k8sClusterImporter.detect({ clientVersion: { gitVersion: "v1.31.5" } }, "client-only.json"), false);
  assert.equal(k8sClusterImporter.detect({ serverVersion: {} }, "serverless.json"), false);
});

test("the control plane is reported from serverVersion with the provider suffix stripped", async () => {
  const report = await runInventory([versionExport], [k8sClusterImporter]);
  assert.equal(report.results.length, 1);
  const { item, check } = report.results[0]!;
  assert.equal(item.importer, "k8s-cluster");
  assert.equal(item.pointer, "/serverVersion/gitVersion");
  assert.equal(item.resource, "control-plane");
  assert.equal(item.purl, "pkg:generic/kubernetes");
  assert.equal(item.version, "1.28.3");
  assert.equal(check.status, "affected");
  assert.equal(check.severity, "high");
  assert.match(check.message, /1\.28 and older/);
});

test("each node reports its kubelet version with suffixes stripped, and an IP-named node is skipped", async () => {
  const report = await runInventory([nodesExport], [k8sClusterImporter]);
  const kubelets = new Map(
    report.results
      .filter(({ item }) => item.purl === "pkg:generic/kubernetes")
      .map(({ item, check }) => [item.pointer, { version: item.version, check }]),
  );

  assert.equal(kubelets.get("/items/0/status/nodeInfo/kubeletVersion")?.version, "1.34.2");
  assert.equal(kubelets.get("/items/0/status/nodeInfo/kubeletVersion")?.check.status, "affected");
  assert.equal(kubelets.get("/items/0/status/nodeInfo/kubeletVersion")?.check.severity, "high");
  assert.equal(kubelets.get("/items/0/status/nodeInfo/kubeletVersion")?.check.findings[0]!.event, "end-of-life");
  assert.equal(kubelets.get("/items/0/status/nodeInfo/kubeletVersion")?.check.findings[0]!.deadline, "2026-10-27");
  assert.equal(kubelets.get("/items/1/status/nodeInfo/kubeletVersion")?.version, "1.30.5");
  assert.equal(kubelets.get("/items/1/status/nodeInfo/kubeletVersion")?.check.status, "affected");
  assert.equal(kubelets.get("/items/1/status/nodeInfo/kubeletVersion")?.check.severity, "high");
  assert.equal(kubelets.get("/items/4/status/nodeInfo/kubeletVersion")?.version, "1.31.5");

  const scheduled = kubelets.get("/items/3/status/nodeInfo/kubeletVersion")!;
  assert.equal(scheduled.version, "1.36.1");
  assert.equal(scheduled.check.status, "affected");
  assert.equal(scheduled.check.severity, "low");
  assert.equal(scheduled.check.findings[0]!.event, "scheduled-end-of-life");
  assert.equal(scheduled.check.findings[0]!.deadline, "2027-06-28");

  for (const pointer of kubelets.keys()) assert.match(pointer, /^\/items\/[0134]\//, pointer);
});

test("osImage maps to the distribution rules where they exist and reports no-data where they do not", async () => {
  const report = await runInventory([nodesExport], [k8sClusterImporter]);
  const byPointer = new Map(report.results.map((result) => [result.item.pointer, result]));

  const ubuntu = byPointer.get("/items/0/status/nodeInfo/osImage")!;
  assert.equal(ubuntu.item.purl, "pkg:generic/ubuntu");
  assert.equal(ubuntu.item.version, "22.04.5");
  assert.equal(ubuntu.check.status, "not-affected");

  const cos = byPointer.get("/items/1/status/nodeInfo/osImage")!;
  assert.equal(cos.item.purl, "pkg:generic/cos");
  assert.equal(cos.item.version, undefined);
  assert.equal(cos.check.status, "no-data");

  const bottlerocket = byPointer.get("/items/3/status/nodeInfo/osImage")!;
  assert.equal(bottlerocket.item.purl, "pkg:generic/bottlerocket");
  assert.equal(bottlerocket.item.version, "1.19.0");
  assert.equal(bottlerocket.check.status, "no-data");

  const sles = byPointer.get("/items/4/status/nodeInfo/osImage")!;
  assert.equal(sles.item.purl, "pkg:generic/sles");
  assert.equal(sles.item.version, "15.6");
  assert.equal(sles.check.status, "affected");
});

test("containerRuntimeVersion maps to the runtime PURL and reports no-data for now", async () => {
  const report = await runInventory([nodesExport], [k8sClusterImporter]);
  const byPointer = new Map(report.results.map((result) => [result.item.pointer, result]));

  const containerd = byPointer.get("/items/0/status/nodeInfo/containerRuntimeVersion")!;
  assert.equal(containerd.item.purl, "pkg:generic/containerd");
  assert.equal(containerd.item.version, "1.6.32");
  assert.equal(containerd.check.status, "no-data");

  const docker = byPointer.get("/items/3/status/nodeInfo/containerRuntimeVersion")!;
  assert.equal(docker.item.purl, "pkg:generic/docker");
  assert.equal(docker.item.version, "24.0.7");
  assert.equal(docker.check.status, "no-data");

  const floating = byPointer.get("/items/4/status/nodeInfo/containerRuntimeVersion")!;
  assert.equal(floating.item.purl, "pkg:generic/containerd");
  assert.equal(floating.item.version, undefined);
  assert.equal(floating.check.status, "no-data");
});

/** A node list whose entries each stress one part of the node rules. */
function nodeDocument(nodes: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { apiVersion: "v1", kind: "List", items: nodes.map((node) => ({ apiVersion: "v1", kind: "Node", ...node })) };
}

function node(name: unknown, nodeInfo: Record<string, unknown>): Record<string, unknown> {
  return { metadata: { name }, status: { nodeInfo } };
}

test("every node shape yields exactly the items its fields support", () => {
  const document = nodeDocument([
    // An osImage the rules do not cover and a runtime they do not name report nothing.
    node("ip-10-0-1-11.ec2.internal", {
      kubeletVersion: "v1.30.0",
      osImage: "NixOS 24.05",
      containerRuntimeVersion: "nerdctl://1.7.1",
    }),
    // A kubelet version that names no release, a blank osImage, and a runtime without a scheme.
    node("ip-10-0-1-12.ec2.internal", {
      kubeletVersion: "master",
      osImage: "   ",
      containerRuntimeVersion: "docker-24.0.7",
    }),
    // Names that are not usable: empty, an IPv6 address, and a non-string.
    node("", {}),
    node("fd00::9", { kubeletVersion: "v1.31.1", osImage: "Debian", containerRuntimeVersion: "containerd://1.6.0" }),
    node(42, { kubeletVersion: "v1.31.1" }),
    // No nodeInfo fields at all.
    node("ip-10-0-1-15.ec2.internal", {}),
    // An EKS suffix stripped, a distribution whose version is the first release-shaped token, and the cri-o runtime.
    node("ip-10-0-1-16.ec2.internal", {
      kubeletVersion: "v1.29.7-eks-9f2c5c6",
      osImage: "Debian GNU/Linux 12 (bookworm)",
      containerRuntimeVersion: "cri-o://1.30.0",
    }),
    // The remaining runtimes the rules name.
    node("ip-10-0-1-17.ec2.internal", {
      kubeletVersion: "v1.32.0",
      osImage: "Alpine Linux v3.20",
      containerRuntimeVersion: "cri-dockerd://1.24.0",
    }),
    // An image and a runtime that name no version still report, without a version.
    node("ip-10-0-1-18.ec2.internal", {
      kubeletVersion: "v1.28.9",
      osImage: "Ubuntu",
      containerRuntimeVersion: "containerd://1.6.x",
    }),
  ]);

  const items = k8sClusterImporter.items(document, "nodes.json").sort((a, b) => (a.pointer < b.pointer ? -1 : 1));

  assert.deepEqual(
    items.map((item) => `${item.pointer} ${item.purl} ${item.version ?? "unversioned"} ${item.resource}`),
    [
      "/items/0/status/nodeInfo/kubeletVersion pkg:generic/kubernetes 1.30.0 ip-10-0-1-11.ec2.internal",
      "/items/6/status/nodeInfo/containerRuntimeVersion pkg:generic/cri-o 1.30.0 ip-10-0-1-16.ec2.internal",
      "/items/6/status/nodeInfo/kubeletVersion pkg:generic/kubernetes 1.29.7 ip-10-0-1-16.ec2.internal",
      "/items/6/status/nodeInfo/osImage pkg:generic/debian 12 ip-10-0-1-16.ec2.internal",
      "/items/7/status/nodeInfo/containerRuntimeVersion pkg:generic/cri-dockerd 1.24.0 ip-10-0-1-17.ec2.internal",
      "/items/7/status/nodeInfo/kubeletVersion pkg:generic/kubernetes 1.32.0 ip-10-0-1-17.ec2.internal",
      "/items/7/status/nodeInfo/osImage pkg:generic/alpine 3.20 ip-10-0-1-17.ec2.internal",
      "/items/8/status/nodeInfo/containerRuntimeVersion pkg:generic/containerd unversioned ip-10-0-1-18.ec2.internal",
      "/items/8/status/nodeInfo/kubeletVersion pkg:generic/kubernetes 1.28.9 ip-10-0-1-18.ec2.internal",
      "/items/8/status/nodeInfo/osImage pkg:generic/ubuntu unversioned ip-10-0-1-18.ec2.internal",
    ],
  );

  for (const item of items) assert.equal(item.importer, "k8s-cluster");
  // The unusable names are skipped outright: no item carries an address, an empty name, or a non-string one.
  for (const item of items) assert.match(item.resource, /^ip-10-0-1-1[1678]\.ec2\.internal$/);
});

test("every pointer resolves to the value its claim rests on", async () => {
  for (const path of [versionExport, nodesExport]) {
    const document = await readJson(path);
    const report = await runInventory([path], [k8sClusterImporter]);
    assert.ok(report.results.length > 0, path);

    for (const { item } of report.results) {
      const resolved = resolvePointer(document, item.pointer);
      assert.notEqual(resolved, undefined, `${item.pointer} does not resolve`);
      if (item.purl === "pkg:generic/kubernetes") {
        assert.equal(upstreamVersion(String(resolved)), item.version, `${item.pointer} does not name ${item.version}`);
      } else if (item.pointer.endsWith("/osImage")) {
        assert.equal(
          imageVersion(String(resolved)),
          item.version,
          `${item.pointer} does not name ${item.version ?? "any version"}`,
        );
      } else {
        const value = String(resolved).split("://")[1];
        assert.ok(value !== undefined, `${item.pointer} is not a runtime string`);
        assert.equal(
          /^\d+(?:\.\d+)*$/.test(value) ? value : undefined,
          item.version,
          `${item.pointer} does not name ${item.version}`,
        );
      }
    }
  }
});

test("output contains no IP addresses and nothing from the IP-named node", async () => {
  const report = await runInventory([versionExport, nodesExport], [k8sClusterImporter]);
  const output = JSON.stringify(report);
  // Node names are allowed as `resource` (`ip-10-0-0-12.ec2.internal` is one), but no address is.
  for (const secret of ["10.0.0.7", "10.0.0.12", "10.0.0.13", "fd00::1", "fd00::2", "1.25.16"]) {
    assert.equal(output.includes(secret), false, `output leaks ${secret}`);
  }
  assert.equal(
    report.results.some(({ item }) => item.resource === "10.0.0.7"),
    false,
  );
});

test("detect rejects every other fixture under tests/fixtures/inventory", async () => {
  const files = (await readdir(fixtures, { recursive: true })).filter((entry) => entry.endsWith(".json"));
  assert.ok(files.length > 1, "expected fixtures to compare against");
  for (const entry of files) {
    const path = resolve(fixtures, entry);
    const expected = CLUSTER_EXPORTS.includes(relative(fixtures, path));
    assert.equal(k8sClusterImporter.detect(parseExport(await readFile(path, "utf8")), entry), expected, entry);
  }
});

test("the inventory docs carry the export commands, the fields, the suffix rule, and the managed-provider note", async () => {
  const docs = await readFile(resolve("docs/INVENTORY.md"), "utf8");
  assert.match(docs, /kubectl version -o json/);
  assert.match(docs, /kubectl get nodes -o json/);
  assert.match(docs, /kubeletVersion/);
  assert.match(docs, /osImage/);
  assert.match(docs, /containerRuntimeVersion/);
  assert.match(docs, /-eks-/);
  assert.match(docs, /their own calendars/);
  assert.match(docs, /registry\/kubernetes\.json/);
  assert.match(docs, /registry\/container\.json/);
});

test("the examples report affected items with pointers that resolve", async () => {
  for (const path of [clusterExample, nodesExample]) {
    const document = await readJson(path);
    const report = await runInventory([path], [k8sClusterImporter]);
    assert.deepEqual(report.unrecognized, []);
    assert.ok(
      report.results.some((result) => result.check.status === "affected"),
      path,
    );
    for (const { item } of report.results)
      assert.notEqual(resolvePointer(document, item.pointer), undefined, item.pointer);
  }
  const nodes = await runInventory([nodesExample], [k8sClusterImporter]);
  const ubuntu = nodes.results.find(({ item }) => item.purl === "pkg:generic/ubuntu");
  assert.equal(ubuntu?.item.version, "20.04.6");
  assert.equal(ubuntu?.check.status, "affected");
});

test("the CLI exits 1 on affected examples, validates against the schema, and honours --fail-on", async () => {
  const { code, stdout } = await invokeCli("inventory", clusterExample, nodesExample, "--json");
  assert.equal(code, 1);
  const report = JSON.parse(stdout) as InventoryReport;
  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.ok(report.results.some((result) => result.check.status === "affected"));

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema((await readJson(resolve("schemas/scan.v1.schema.json"))) as object);
  ajv.addSchema((await readJson(resolve("schemas/check.v1.schema.json"))) as object);
  const validate = ajv.compile((await readJson(resolve("schemas/inventory.v1.schema.json"))) as object);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));

  assert.equal((await invokeCli("inventory", clusterExample, nodesExample, "--fail-on", "critical")).code, 0);
  assert.equal((await invokeCli("inventory", clusterExample, nodesExample, "--fail-on", "none")).code, 0);
});

test("the CLI lists an unrecognized file, exits 2, and still reports the rest", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "evergreen-inventory-k8s-cluster-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const other = resolve(directory, "other.json");
  await writeFile(other, JSON.stringify({ hello: "world" }));

  const { code, stdout } = await invokeCli("inventory", clusterExample, other, "--json");
  assert.equal(code, 2);
  const report = JSON.parse(stdout) as InventoryReport;
  assert.deepEqual(report.unrecognized, [other]);
  assert.ok(report.results.some((result) => result.check.status === "affected"));
});

test("--redact hides every resource name in text and JSON output", async () => {
  const { code, stdout } = await invokeCli("inventory", clusterExample, nodesExample, "--json", "--redact");
  assert.equal(code, 1);
  const report = JSON.parse(stdout) as InventoryReport;
  for (const { item } of report.results) assert.match(item.resource, /^[0-9a-f]{12}$/);
  assert.equal(stdout.includes("ip-10-0-1-20.ec2.internal"), false);
  assert.equal(stdout.includes("ip-10-0-1-21.ec2.internal"), false);
});
