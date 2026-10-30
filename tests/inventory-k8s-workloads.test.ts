import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import { parseImageReference } from "../src/detectors/container/parse-image.js";
import { ruleVersion, splitApiVersion } from "../src/detectors/kubernetes/api-version.js";
import { k8sWorkloadsImporter } from "../src/inventory/k8s-workloads.js";
import { runInventory } from "../src/inventory/index.js";
import type { InventoryReport } from "../src/inventory/types.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const fixtures = resolve("tests/fixtures/inventory");
const workloads = resolve(fixtures, "k8s-workloads/workloads.json");
const example = resolve("examples/inventory/k8s-workloads.json");

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

/** The release line a tag names, by the importer's rule. */
function tagVersion(tag: string | undefined): string | undefined {
  if (tag === undefined) return undefined;
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(tag);
  if (!match) return undefined;
  return `${Number(match[1])}.${Number(match[2] ?? 0)}.${Number(match[3] ?? 0)}`;
}

async function runCli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code ?? 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

test("detect accepts a workload List and rejects another shape or a node list", async () => {
  assert.equal(k8sWorkloadsImporter.detect(await readJson(workloads), workloads), true);
  assert.equal(k8sWorkloadsImporter.detect(await readJson(resolve(fixtures, "k8s-workloads/nodes.json")), "nodes.json"), false);
  assert.equal(k8sWorkloadsImporter.detect(await readJson(resolve(fixtures, "k8s-workloads/single-pod.json")), "single-pod.json"), false);
  assert.equal(k8sWorkloadsImporter.detect(await readJson(resolve(fixtures, "k8s-workloads/empty-list.json")), "empty-list.json"), false);
});

test("every recorded kind contributes images or an API item", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  const kinds = new Set(report.results.map((result) => result.item.resource.split("/")[1]!));
  for (const kind of ["Pod", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job", "CronJob"]) {
    assert.ok(kinds.has(kind), `no result for ${kind}`);
  }
});

test("init containers and the CronJob job template are read", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  const byPointer = new Map(report.results.map((result) => [result.item.pointer, result]));

  assert.equal(byPointer.get("/items/0/spec/template/spec/initContainers/0/image")?.item.purl, "pkg:docker/library/python");
  assert.equal(byPointer.get("/items/0/spec/template/spec/initContainers/0/image")?.check.status, "affected");
  assert.equal(byPointer.get("/items/5/spec/jobTemplate/spec/template/spec/containers/0/image")?.item.purl, "pkg:docker/library/python");
  assert.equal(byPointer.get("/items/5/spec/jobTemplate/spec/template/spec/initContainers/0/image")?.item.purl, "pkg:docker/library/redis");
});

test("identical image references are reported once per workload and namespace", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  const deploymentNode = report.results.filter(
    (result) => result.item.resource === "shop/Deployment/web" && result.item.purl === "pkg:docker/library/node",
  );
  assert.equal(deploymentNode.length, 1);
  assert.equal(deploymentNode[0]!.item.pointer, "/items/0/spec/template/spec/containers/0/image");

  const replicaSetNode = report.results.filter(
    (result) => result.item.resource === "shop/ReplicaSet/web-7d9f6b" && result.item.purl === "pkg:docker/library/node",
  );
  assert.equal(replicaSetNode.length, 1);
});

test("digest-pinned images keep their tag's release line, and a digest alone names none", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  const byPointer = new Map(report.results.map((result) => [result.item.pointer, result]));

  const tagged = byPointer.get("/items/1/spec/template/spec/containers/1/image")!;
  assert.equal(tagged.item.purl, "pkg:docker/library/postgres");
  assert.equal(tagged.item.version, "13.4.0");

  const digestOnly = byPointer.get("/items/6/spec/containers/1/image")!;
  assert.equal(digestOnly.item.purl, "pkg:docker/library/redis");
  assert.equal(digestOnly.item.version, undefined);
  assert.equal(digestOnly.check.status, "version-dependent");
});

test("the live apiVersion maps to the Kubernetes rules, including a cluster-scoped object", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  const byPointer = new Map(report.results.map((result) => [result.item.pointer, result]));

  const ingress = byPointer.get("/items/7/apiVersion")!;
  assert.equal(ingress.item.purl, "pkg:generic/kubernetes/networking.k8s.io/Ingress");
  assert.equal(ingress.item.version, "1.0.0-beta.1");
  assert.equal(ingress.check.status, "affected");

  const policy = byPointer.get("/items/9/apiVersion")!;
  assert.equal(policy.item.resource, "cluster/PodSecurityPolicy/restricted");
  assert.equal(policy.check.status, "affected");

  const deployment = byPointer.get("/items/0/apiVersion")!;
  assert.equal(deployment.item.version, "1.0.0");
  assert.equal(deployment.check.status, "not-affected");

  const core = report.results.filter((result) => result.item.resource === "shop/Pod/legacy" && result.item.purl.startsWith("pkg:generic/kubernetes/"));
  assert.deepEqual(core, []);
});

test("every pointer resolves to the value its claim rests on", async () => {
  const document = await readJson(workloads);
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  assert.ok(report.results.length > 0);

  for (const { item } of report.results) {
    const resolved = resolvePointer(document, item.pointer);
    assert.notEqual(resolved, undefined, `${item.pointer} does not resolve`);

    if (item.purl.startsWith("pkg:generic/kubernetes/")) {
      const split = splitApiVersion(String(resolved));
      assert.ok(split, `${item.pointer} is not an apiVersion`);
      assert.equal(ruleVersion(split.version), item.version, `${item.pointer} does not translate to ${item.version}`);
    } else {
      const image = parseImageReference(String(resolved));
      assert.ok(image, `${item.pointer} is not an image reference`);
      assert.equal(tagVersion(image.tag), item.version, `${item.pointer} does not name ${item.version}`);
    }
  }
});

test("output contains no IP addresses, node names, account ids, or resource uids", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  const output = JSON.stringify(report);
  for (const secret of ["10.0.0.12", "fd00::1", "ip-10-0-0-12", "ec2.internal", "123456789012", "9d0f7f4e", ".dkr.ecr", "ghcr.io", "mcr.microsoft.com"]) {
    assert.equal(output.includes(secret), false, `output leaks ${secret}`);
  }
  assert.equal(report.results.some((result) => result.item.purl.includes("10.0.0.12")), false);
});

test("images from registries other than Docker Hub are skipped, not guessed", async () => {
  const report = await runInventory([workloads], [k8sWorkloadsImporter]);
  for (const pointer of ["/items/0/spec/template/spec/containers/1/image", "/items/2/spec/template/spec/containers/0/image", "/items/6/spec/containers/2/image", "/items/6/spec/containers/3/image", "/items/6/spec/containers/4/image"]) {
    assert.equal(report.results.some((result) => result.item.pointer === pointer), false, pointer);
  }
});

test("detect rejects every other fixture under tests/fixtures/inventory", async () => {
  const files = (await readdir(fixtures, { recursive: true })).filter((entry) => entry.endsWith(".json"));
  assert.ok(files.length > 1, "expected fixtures to compare against");
  for (const entry of files) {
    const path = resolve(fixtures, entry);
    const expected = relative(fixtures, path) === "k8s-workloads/workloads.json";
    assert.equal(k8sWorkloadsImporter.detect(await readJson(path), entry), expected, entry);
  }
});

test("the inventory docs carry the export command, the fields, the rules, and the preferred-version limit", async () => {
  const docs = await readFile(resolve("docs/INVENTORY.md"), "utf8");
  assert.match(docs, /kubectl get deploy,sts,ds,cronjob,job,pod -A -o json/);
  assert.match(docs, /initContainers/);
  assert.match(docs, /registry\/container\.json/);
  assert.match(docs, /registry\/kubernetes\.json/);
  assert.match(docs, /preferred version/i);
  assert.match(docs, /cluster-scoped/i);
});

test("the example file reports affected items with pointers that resolve", async () => {
  const document = await readJson(example);
  const report = await runInventory([example], [k8sWorkloadsImporter]);
  assert.ok(report.results.some((result) => result.check.status === "affected"));
  for (const { item } of report.results) assert.notEqual(resolvePointer(document, item.pointer), undefined, item.pointer);
});

test("the CLI exits 1 on an affected example, validates against the schema, and honours --fail-on", async () => {
  const { code, stdout } = await runCli("inventory", example, "--json");
  assert.equal(code, 1);
  const report = JSON.parse(stdout) as InventoryReport;
  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.ok(report.results.some((result) => result.check.status === "affected"));

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(await readJson(resolve("schemas/scan.v1.schema.json")) as object);
  ajv.addSchema(await readJson(resolve("schemas/check.v1.schema.json")) as object);
  const validate = ajv.compile(await readJson(resolve("schemas/inventory.v1.schema.json")) as object);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));

  assert.equal((await runCli("inventory", example, "--fail-on", "critical")).code, 0);
  assert.equal((await runCli("inventory", example, "--fail-on", "none")).code, 0);
});

test("the CLI lists an unrecognized file, exits 2, and still reports the rest", async (t) => {
  const directory = await mkdtemp(resolve(tmpdir(), "evergreen-inventory-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const other = resolve(directory, "other.json");
  await writeFile(other, JSON.stringify({ hello: "world" }));

  const { code, stdout } = await runCli("inventory", example, other, "--json");
  assert.equal(code, 2);
  const report = JSON.parse(stdout) as InventoryReport;
  assert.deepEqual(report.unrecognized, [other]);
  assert.ok(report.results.some((result) => result.check.status === "affected"));
});

test("--redact hides every resource name in text and JSON output", async () => {
  const { code, stdout } = await runCli("inventory", example, "--json", "--redact");
  assert.equal(code, 1);
  const report = JSON.parse(stdout) as InventoryReport;
  for (const { item } of report.results) assert.match(item.resource, /^[0-9a-f]{12}$/);
  assert.equal(stdout.includes("shop/Deployment/web"), false);
  assert.equal(stdout.includes("shop/StatefulSet/db"), false);
});
