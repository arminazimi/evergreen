import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

import { redactReport, renderInventoryText } from "../src/inventory/command.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import { terraformStateImporter } from "../src/inventory/terraform-state.js";
import type { InventoryItem, InventoryReport } from "../src/inventory/types.js";

const FIXTURES = resolve("tests/fixtures/inventory");
const TERRAFORM = join(FIXTURES, "terraform-state");
const SHOW = join(TERRAFORM, "show.json");
const RAW = join(TERRAFORM, "state-v4.json");

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Resolves an RFC 6901 JSON Pointer against a parsed document. */
function resolvePointer(document: unknown, pointer: string): unknown {
  let value: unknown = document;
  for (const raw of pointer.split("/").slice(1)) {
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(value)) value = value[Number(segment)];
    else if (isRecord(value)) value = value[segment];
    else return undefined;
  }
  return value;
}

async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
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

function itemsOf(document: unknown, file = "state.json"): InventoryItem[] {
  return terraformStateImporter.items(document, file);
}

function resultsFor(report: InventoryReport, resource: string, purl: string) {
  return report.results.filter((result) => result.item.resource === resource && result.item.purl === purl);
}

test("detect accepts both state formats and rejects plan JSON, raw states of other versions, and other documents", async () => {
  assert.equal(terraformStateImporter.detect(await readJson(SHOW), SHOW), true);
  assert.equal(terraformStateImporter.detect(await readJson(RAW), RAW), true);
  for (const document of [
    {},
    [],
    "text export",
    null,
    { format_version: "1.0" },
    { format_version: "1.0", values: {} },
    { format_version: "1.0", values: { root_module: "nope" } },
    { format_version: "1.0", terraform_version: "1.9.8", planned_values: { root_module: { resources: [] } } },
    { version: 3, resources: [] },
    { version: 4 },
    { version: 4, resources: "nope" },
    { version: 4, resources: [1] },
    { values: { root_module: { resources: [] } } },
  ]) {
    assert.equal(terraformStateImporter.detect(document, "other.json"), false, JSON.stringify(document));
  }
});

test("detect rejects every other importer's fixture under tests/fixtures/inventory", async () => {
  for (const path of await jsonFilesUnder(FIXTURES)) {
    if (path.startsWith(TERRAFORM + sep)) continue;
    const document = await readJson(path).catch(() => undefined);
    assert.equal(terraformStateImporter.detect(document, path), false, path);
  }
});

test("show -json reads every listed resource type with a pointer that resolves", async () => {
  const document = await readJson(SHOW);
  const items = terraformStateImporter.items(document, SHOW);
  assert.equal(items.length, 21);
  assert.ok(items.every((item) => item.importer === "terraform-state" && item.file === SHOW));

  const summaries = items.map((item) => [item.resource, item.pointer, item.purl, item.version]);
  for (const expected of [
    ["aws_lambda_function.worker[0]", "/values/root_module/resources/0/values/runtime", "pkg:generic/aws-lambda-runtime/nodejs14.x", "nodejs14.x"],
    ["aws_lambda_function.worker[1]", "/values/root_module/resources/1/values/runtime", "pkg:generic/aws-lambda-runtime/python3.7", "python3.7"],
    ['aws_lambda_function.api["green"]', "/values/root_module/resources/2/values/runtime", "pkg:generic/aws-lambda-runtime/nodejs18.x", "nodejs18.x"],
    ["aws_db_instance.orders", "/values/root_module/resources/5/values/engine_version", "pkg:generic/aws-rds/postgres", "12.22"],
    ["aws_db_instance.orders", "/values/root_module/resources/5/values/engine_version", "pkg:generic/postgresql", "12.22"],
    ["aws_rds_cluster.analytics", "/values/root_module/resources/6/values/engine_version", "pkg:generic/aws-aurora/postgresql", "13.9"],
    ["aws_rds_cluster.sessions", "/values/root_module/resources/7/values/engine_version", "pkg:generic/aws-aurora/mysql", "8.0.mysql_aurora.3.10.0"],
    ["aws_elasticache_cluster.cache", "/values/root_module/resources/8/values/engine_version", "pkg:generic/aws-elasticache/redis", "6.2.6"],
    ["aws_elasticache_replication_group.flags", "/values/root_module/resources/9/values/engine_version", "pkg:generic/redis", "7.1"],
    ["aws_eks_cluster.main", "/values/root_module/resources/11/values/version", "pkg:generic/amazon-eks", "1.30"],
    ["google_container_cluster.gke", "/values/root_module/resources/12/values/master_version", "pkg:generic/google-gke", "1.29.7-gke.1000"],
    ["google_cloudfunctions_function.legacy", "/values/root_module/resources/13/values/runtime", "pkg:generic/google-cloud-functions-runtime/nodejs14", undefined],
    ["google_cloudfunctions2_function.reports", "/values/root_module/resources/14/values/build_config/0/runtime", "pkg:generic/google-cloud-functions-runtime/python312", undefined],
    ["azurerm_kubernetes_cluster.aks", "/values/root_module/resources/15/values/kubernetes_version", "pkg:generic/azure-aks", "1.28.5"],
    ["azurerm_linux_function_app.fn", "/values/root_module/resources/16/values/site_config/0/application_stack/0/node_version", "pkg:generic/azure-app-service/node", "14"],
    ["aws_lambda_function.nested", "/values/root_module/child_modules/0/resources/0/values/runtime", "pkg:generic/aws-lambda-runtime/nodejs16.x", "nodejs16.x"],
    ["aws_eks_cluster.nested", "/values/root_module/child_modules/0/resources/1/values/version", "pkg:generic/amazon-eks", "1.28"],
    ["google_container_cluster.deep", "/values/root_module/child_modules/0/child_modules/0/resources/0/values/master_version", "pkg:generic/google-gke", "1.31.4-gke.100"],
  ]) {
    assert.ok(summaries.some((entry) => JSON.stringify(entry) === JSON.stringify(expected)), JSON.stringify(expected));
  }

  for (const item of items) {
    const value = resolvePointer(document, item.pointer);
    assert.equal(typeof value, "string", item.pointer);
    if (item.purl.startsWith("pkg:generic/google-cloud-functions-runtime/")) {
      assert.equal(item.version, undefined);
      assert.ok(item.purl.endsWith(`/${value as string}`), item.pointer);
    } else if (item.purl.startsWith("pkg:generic/azure-app-service/")) {
      assert.equal((value as string).replace(/^~/, ""), item.version, item.pointer);
    } else {
      assert.equal(value, item.version, item.pointer);
    }
  }
});

test("raw state v4 reads the same attributes, including nested modules and for_each keys", async () => {
  const document = await readJson(RAW);
  const items = terraformStateImporter.items(document, RAW);
  assert.equal(items.length, 10);

  assert.deepEqual(
    items.map((item) => item.resource),
    [
      "aws_lambda_function.worker[0]",
      "aws_lambda_function.worker[1]",
      'aws_lambda_function.nested["blue"]',
      "aws_eks_cluster.main",
      "aws_db_instance.legacy",
      "aws_db_instance.legacy",
      "aws_elasticache_replication_group.flags",
      "aws_elasticache_replication_group.flags",
      "google_cloudfunctions2_function.reports",
      "azurerm_linux_function_app.fn",
    ],
  );
  assert.deepEqual(
    items.map((item) => item.pointer),
    [
      "/resources/0/instances/0/attributes/runtime",
      "/resources/0/instances/1/attributes/runtime",
      "/resources/1/instances/0/attributes/runtime",
      "/resources/2/instances/0/attributes/version",
      "/resources/3/instances/0/attributes/engine_version",
      "/resources/3/instances/0/attributes/engine_version",
      "/resources/4/instances/0/attributes/engine_version",
      "/resources/4/instances/0/attributes/engine_version",
      "/resources/5/instances/0/attributes/build_config/0/runtime",
      "/resources/6/instances/0/attributes/site_config/0/application_stack/0/python_version",
    ],
  );
  for (const item of items) {
    const value = resolvePointer(document, item.pointer);
    if (item.purl.startsWith("pkg:generic/google-cloud-functions-runtime/")) assert.ok(item.purl.endsWith(`/${value as string}`));
    else assert.equal(value, item.version, item.pointer);
  }
});

test("resources are type.name with the instance key, never the module path or an id", async () => {
  const showItems = itemsOf(await readJson(SHOW), SHOW);
  assert.deepEqual(
    showItems.filter((item) => item.resource.startsWith("aws_lambda_function.")).map((item) => item.resource),
    ["aws_lambda_function.worker[0]", "aws_lambda_function.worker[1]", 'aws_lambda_function.api["green"]', "aws_lambda_function.nested"],
  );
  const nested = showItems.find((item) => item.resource === "aws_lambda_function.nested")!;
  assert.equal(nested.pointer, "/values/root_module/child_modules/0/resources/0/values/runtime");

  const rawItems = itemsOf(await readJson(RAW), RAW);
  assert.ok(rawItems.some((item) => item.resource === 'aws_lambda_function.nested["blue"]'));
  assert.ok(rawItems.some((item) => item.resource === "aws_lambda_function.worker[1]"));
  assert.ok(rawItems.some((item) => item.resource === "aws_eks_cluster.main"));
});

test("data sources, image functions, unmapped engines, and unsupported values are skipped", async () => {
  const document = {
    format_version: "1.0",
    values: {
      root_module: {
        resources: [
          null,
          {},
          { type: "aws_lambda_function", name: "no-runtime", values: {} },
          { type: "aws_lambda_function", name: "bad-runtime", values: { runtime: "node js" } },
          { type: "aws_lambda_function", name: "bad-values", values: "nope" },
          { type: "aws_db_instance", name: "no-version", values: { engine: "postgres" } },
          { type: "aws_db_instance", name: "unknown-engine", values: { engine: "oracle", engine_version: "19" } },
          { type: "aws_eks_cluster", name: "floating", values: { version: "latest" } },
          { type: "google_container_cluster", name: "unset", values: {} },
          { type: "google_cloudfunctions_function", name: "bad", values: { runtime: "NodeJS-20" } },
          { type: "google_cloudfunctions2_function", name: "empty", values: { build_config: [] } },
          { type: "google_cloudfunctions2_function", name: "bad", values: { build_config: [{ runtime: "Python 3" }] } },
          { type: "google_cloudfunctions2_function", name: "not-object", values: { build_config: ["python312"] } },
          { type: "azurerm_kubernetes_cluster", name: "unset", values: {} },
          { type: "azurerm_linux_function_app", name: "none", values: {} },
          { type: "azurerm_linux_function_app", name: "empty", values: { site_config: [] } },
          { type: "azurerm_linux_function_app", name: "no-stack", values: { site_config: [{}] } },
          { type: "azurerm_linux_function_app", name: "bad", values: { site_config: [{ application_stack: [{ node_version: "latest", python_version: "" }] }] } },
          { type: "aws_s3_bucket", name: "bucket", values: { bucket: "placeholder-assets" } },
          { type: 1, name: "bad-type", values: {} },
          { type: "aws_lambda_function", name: 2, values: {} },
          { type: "aws_lambda_function", name: "ok", values: { runtime: "python3.9" }, address: 5 },
        ],
        child_modules: [null, { resources: [null] }, { resources: "nope" }],
      },
    },
  };
  const items = itemsOf(document);
  assert.deepEqual(
    items.map((item) => [item.resource, item.pointer]),
    [["aws_lambda_function.ok", "/values/root_module/resources/21/values/runtime"]],
  );

  const raw = {
    version: 4,
    resources: [
      { type: "aws_lambda_function", name: "no-instances", instances: null },
      { type: "aws_lambda_function", name: "bad-instances", instances: [null, { attributes: null }, { attributes: { runtime: "python3.9" } }] },
      { type: 5, name: "bad-type", instances: [] },
      { type: "aws_lambda_function", name: 5, instances: [] },
      { mode: "data", type: "aws_lambda_function", name: "data", instances: [{ attributes: { runtime: "python2.7" } }] },
      { type: "aws_lambda_function", name: "empty-key", instances: [{ index_key: "", attributes: { runtime: "python3.10" } }] },
      { type: "aws_lambda_function", name: "null-key", instances: [{ index_key: null, attributes: { runtime: "python3.11" } }] },
      { type: "aws_lambda_function", name: "deposed", instances: [{ deposed: "a1b2c3d4", attributes: { runtime: "python2.7" } }] },
    ],
  };
  assert.deepEqual(
    itemsOf(raw).map((item) => item.resource),
    ["aws_lambda_function.bad-instances", "aws_lambda_function.empty-key", "aws_lambda_function.null-key"],
  );
});

test("the Linux Function App stack reads every managed version field as its own item", () => {
  const document = {
    format_version: "1.0",
    values: {
      root_module: {
        resources: [
          {
            type: "azurerm_linux_function_app",
            name: "fn",
            values: {
              site_config: [
                {
                  application_stack: [
                    {
                      dotnet_version: "8.0",
                      dotnet_isolated_version: "9.0",
                      java_version: "17",
                      node_version: "~18",
                      python_version: "3.12",
                      powershell_core_version: "7.4",
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  };
  assert.deepEqual(
    itemsOf(document).map((item) => [item.purl, item.version]),
    [
      ["pkg:generic/azure-app-service/dotnet", "8.0"],
      ["pkg:generic/azure-app-service/dotnet-isolated", "9.0"],
      ["pkg:generic/azure-app-service/java", "17"],
      ["pkg:generic/azure-app-service/node", "18"],
      ["pkg:generic/azure-app-service/python", "3.12"],
      ["pkg:generic/azure-app-service/powershell", "7.4"],
    ],
  );
});

test("deployed values answer with the rules that already exist", async () => {
  const report = await runInventory([SHOW]);
  assert.deepEqual(report.unrecognized, []);
  assert.equal(resultsFor(report, "aws_lambda_function.worker[0]", "pkg:generic/aws-lambda-runtime/nodejs14.x")[0]!.check.status, "affected");
  assert.equal(resultsFor(report, "aws_lambda_function.worker[0]", "pkg:generic/aws-lambda-runtime/nodejs14.x")[0]!.check.severity, "high");
  assert.equal(resultsFor(report, "aws_db_instance.orders", "pkg:generic/aws-rds/postgres")[0]!.check.status, "affected");
  assert.equal(resultsFor(report, "aws_db_instance.orders", "pkg:generic/postgresql")[0]!.check.status, "affected");
  assert.equal(resultsFor(report, "google_container_cluster.gke", "pkg:generic/google-gke")[0]!.check.status, "affected");
  assert.equal(resultsFor(report, "google_cloudfunctions_function.legacy", "pkg:generic/google-cloud-functions-runtime/nodejs14")[0]!.check.status, "affected");
});

test("no ARN, account id, project number, subscription id, endpoint, or environment value reaches the output", async () => {
  const report = await runInventory([SHOW, RAW]);
  const json = JSON.stringify(report);
  const text = renderInventoryText(report);
  for (const secret of [
    "123456789012",
    "arn:aws:",
    "placeholder-token",
    ".rds.amazonaws.com",
    "evergreen-demo-427819",
    "00000000-0000-0000-0000-000000000000",
    "placeholder-rg",
    "placeholder-fn.azurewebsites.net",
    "ABC123.gr7",
  ]) {
    assert.ok(!json.includes(secret), `JSON output contains ${secret}`);
    assert.ok(!text.includes(secret), `text output contains ${secret}`);
  }
  assert.ok(json.includes("aws_lambda_function.worker[0]"));
  assert.ok(json.includes("azurerm_linux_function_app.fn"));
});

test("redaction removes every resource name from the text output", async () => {
  const report = await runInventory([SHOW, RAW]);
  const redacted = redactReport(report);
  const text = renderInventoryText(redacted);
  for (const name of new Set(report.results.map((result) => result.item.resource))) {
    assert.ok(!text.includes(name), `redacted output still shows ${name}`);
  }
  assert.equal(redacted.results.length, report.results.length);
  for (const result of redacted.results) assert.match(result.item.resource, /^[0-9a-f]{12}$/);
});

test("items returns a stable shape for the same document", async () => {
  const document = await readJson(SHOW);
  assert.deepEqual(terraformStateImporter.items(document, SHOW), terraformStateImporter.items(document, SHOW));
});
