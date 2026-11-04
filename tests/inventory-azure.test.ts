import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";

import { loadDataFile } from "../src/data-source.js";
import { azureImporter } from "../src/inventory/azure.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryItem } from "../src/inventory/types.js";
import { validateRegistryV2 } from "../src/registry.js";
import type { RegistryV2Rule } from "../src/registry.js";
import { runCli } from "./cli-runner.js";

const FIXTURES = resolve("tests/fixtures/inventory");
const AZURE = join(FIXTURES, "azure");
const DOCUMENTS = ["webapps.json", "functionapps.json", "aks.json"];

/** Resolves an RFC 6901 JSON Pointer against a parsed document. */
function resolvePointer(document: unknown, pointer: string): unknown {
  let value: unknown = document;
  for (const raw of pointer.split("/").slice(1)) {
    const segment = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(value)) value = value[Number(segment)];
    else if (typeof value === "object" && value !== null) value = (value as Record<string, unknown>)[segment];
    else return undefined;
  }
  return value;
}

async function fixtureFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await fixtureFiles(path)));
    else if (entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

async function itemsOf(name: string): Promise<InventoryItem[]> {
  const file = join(AZURE, name);
  return azureImporter.items(parseExport(await readFile(file, "utf8")), file);
}

function describe(items: InventoryItem[]): [string, string, string, string | undefined][] {
  return items.map((item) => [item.pointer, item.resource, item.purl, item.version]);
}

async function invokeCli(...args: string[]) {
  return runCli(args);
}

test("every Azure document type is detected and produces items whose pointers resolve", async () => {
  for (const name of DOCUMENTS) {
    const file = join(AZURE, name);
    const document = parseExport(await readFile(file, "utf8"));
    assert.equal(azureImporter.detect(document, file), true, name);
    const items = azureImporter.items(document, file);
    assert.ok(items.length > 0, name);
    for (const item of items) {
      assert.equal(item.importer, "azure");
      assert.equal(item.file, file);
      assert.ok(item.resource.length > 0, `${name} ${item.pointer}`);
      assert.match(item.purl, /^pkg:generic\/azure-/);
      const value = resolvePointer(document, item.pointer);
      // A stack reference carries the version inside it (`NODE|18-lts`, `~3`); a cluster version is the value.
      assert.ok(typeof value === "string", `${name} ${item.pointer}`);
      assert.ok(
        value.includes(item.version ?? ""),
        `${name} ${item.pointer} reads ${String(value)} for ${String(item.version)}`,
      );
    }
  }
});

test("linuxFxVersion and windowsFxVersion parse into App Service stack PURLs", async () => {
  const items = await itemsOf("webapps.json");
  assert.deepEqual(describe(items), [
    ["/0/siteConfig/linuxFxVersion", "orders-portal", "pkg:generic/azure-app-service/node", "18"],
    ["/1/siteConfig/linuxFxVersion", "invoices-api", "pkg:generic/azure-app-service/python", "3.8"],
    ["/2/siteConfig/linuxFxVersion", "legacy-dotnet", "pkg:generic/azure-app-service/dotnet", "6.0"],
    ["/3/siteConfig/windowsFxVersion", "search-service", "pkg:generic/azure-app-service/node", "14"],
    ["/4/siteConfig/windowsFxVersion", "reporting-php", "pkg:generic/azure-app-service/php", "8.0"],
    ["/5/siteConfig/linuxFxVersion", "checkout-java", "pkg:generic/azure-app-service/java", "11"],
    ["/10/siteConfig/linuxFxVersion", "auth-isolated", "pkg:generic/azure-app-service/dotnet-isolated", "7.0"],
    ["/11/siteConfig/linuxFxVersion", "portal-python", "pkg:generic/azure-app-service/python", "3.11"],
  ]);
});

test("a custom container, an unknown stack, an empty value, and a missing siteConfig are skipped", async () => {
  const items = await itemsOf("webapps.json");
  const skipped = ["queue-worker", "mail-relay", "quiet-app", "java-tomcat", "other-stack"];
  for (const resource of skipped) {
    assert.ok(!items.some((item) => item.resource === resource), resource);
  }
});

test("the Functions runtime is read from siteConfig only, never from app settings", async () => {
  const items = await itemsOf("functionapps.json");
  assert.deepEqual(describe(items), [
    ["/0/siteConfig/linuxFxVersion", "timer-jobs", "pkg:generic/azure-app-service/python", "3.8"],
    ["/0/siteConfig/FUNCTIONS_EXTENSION_VERSION", "timer-jobs", "pkg:generic/azure-functions", "3"],
    ["/1/siteConfig/FUNCTIONS_EXTENSION_VERSION", "orders-api", "pkg:generic/azure-functions", "4"],
    ["/2/siteConfig/linuxFxVersion", "legacy-http-trigger", "pkg:generic/azure-app-service/node", "14"],
    ["/2/siteConfig/FUNCTIONS_EXTENSION_VERSION", "legacy-http-trigger", "pkg:generic/azure-functions", "1"],
    ["/3/siteConfig/FUNCTIONS_EXTENSION_VERSION", "pinned-runtime", "pkg:generic/azure-functions", "2.0.12345"],
    ["/5/siteConfig/linuxFxVersion", "invoice-workflow", "pkg:generic/azure-app-service/node", "18"],
  ]);
  // `timer-jobs` and `settings-only` both carry FUNCTIONS_EXTENSION_VERSION in appSettings; only the siteConfig value is read.
  assert.ok(!items.some((item) => item.pointer.includes("appSettings")));
  assert.ok(!items.some((item) => item.resource === "settings-only"));
  assert.ok(!items.some((item) => item.resource === "unpinned-runtime"));
  // A logic app is an App Service site, but its FUNCTIONS_EXTENSION_VERSION is not a Functions runtime.
  assert.ok(!items.some((item) => item.resource === "invoice-workflow" && item.purl === "pkg:generic/azure-functions"));
});

test("AKS reports the control plane and each agent pool version once", async () => {
  const items = await itemsOf("aks.json");
  assert.deepEqual(describe(items), [
    ["/0/kubernetesVersion", "payments-cluster", "pkg:generic/azure-aks", "1.31.5"],
    ["/0/agentPoolProfiles/1/orchestratorVersion", "payments-cluster", "pkg:generic/azure-aks", "1.30.4"],
    ["/1/kubernetesVersion", "staging-cluster", "pkg:generic/azure-aks", "1.35.2"],
    ["/2/kubernetesVersion", "ancient-cluster", "pkg:generic/azure-aks", "1.28.9"],
    ["/4/kubernetesVersion", "mixed-cluster", "pkg:generic/azure-aks", "1.34.1"],
    ["/4/agentPoolProfiles/1/orchestratorVersion", "mixed-cluster", "pkg:generic/azure-aks", "1.33.2"],
  ]);
});

test("the Azure rules give each document type a verdict against the bundled registries", async () => {
  const report = await runInventory(DOCUMENTS.map((name) => join(AZURE, name)));
  assert.deepEqual(report.unrecognized, []);
  const find = (name: string, pointer: string) => {
    const file = join(AZURE, name);
    const result = report.results.find((entry) => entry.item.file === file && entry.item.pointer === pointer);
    assert.ok(result, `${name} ${pointer}`);
    return result.check;
  };
  assert.equal(find("webapps.json", "/0/siteConfig/linuxFxVersion").status, "affected");
  assert.equal(find("webapps.json", "/3/siteConfig/windowsFxVersion").severity, "critical");
  assert.equal(find("webapps.json", "/5/siteConfig/linuxFxVersion").status, "not-affected");
  assert.equal(find("webapps.json", "/11/siteConfig/linuxFxVersion").status, "not-affected");
  assert.equal(find("functionapps.json", "/0/siteConfig/FUNCTIONS_EXTENSION_VERSION").status, "affected");
  assert.equal(find("functionapps.json", "/1/siteConfig/FUNCTIONS_EXTENSION_VERSION").status, "not-affected");
  assert.equal(find("aks.json", "/0/kubernetesVersion").severity, "medium");
  assert.equal(find("aks.json", "/2/kubernetesVersion").status, "affected");
  assert.equal(find("aks.json", "/4/kubernetesVersion").severity, "low");
  assert.equal(find("aks.json", "/1/kubernetesVersion").status, "not-affected");
});

test("every Azure inventory rule cites an Azure policy page", async () => {
  const rules: RegistryV2Rule[] = [];
  for (const registry of ["serverless", "kubernetes"]) {
    rules.push(...validateRegistryV2(await loadDataFile(`registry/${registry}.json`)).rules);
  }
  const azure = rules.filter(
    (rule) =>
      rule.purl.startsWith("pkg:generic/azure-app-service/") ||
      rule.purl === "pkg:generic/azure-functions" ||
      rule.purl === "pkg:generic/azure-aks",
  );
  assert.ok(azure.length >= 20, `${azure.length} Azure rules`);
  for (const rule of azure) {
    assert.ok(
      rule.sources.some((source) => source.url.startsWith("https://learn.microsoft.com/en-us/azure/")),
      `${rule.id} cites ${rule.sources.map((source) => source.url).join(", ")}`,
    );
  }
});

test("detection rejects every other importer's fixtures", async () => {
  for (const file of await fixtureFiles(FIXTURES)) {
    const document = parseExport(await readFile(file, "utf8"));
    assert.equal(azureImporter.detect(document, file), file.startsWith(`${AZURE}${sep}`), file);
  }
});

test("output never contains a subscription id, resource group, hostname, IP address, or app setting", async () => {
  const files = DOCUMENTS.map((name) => join(AZURE, name));
  const identifiers = [
    "00000000-0000-0000-0000-000000000000",
    "evergreen-demo",
    "resourceGroups",
    "placeholder-secret-value",
    "AzureWebJobsStorage",
    "azurewebsites.net",
    "azmk8s.io",
    "azurecr.io",
    "203.0.113.10",
    "ssh-rsa",
    "payments-placeholder-dnsprefix",
    "Standard_D2s_v3",
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

test("--redact hides every app and cluster name in text and JSON output", async () => {
  const files = DOCUMENTS.map((name) => join(AZURE, name));
  const resources = [
    "orders-portal",
    "invoices-api",
    "legacy-dotnet",
    "search-service",
    "reporting-php",
    "checkout-java",
    "timer-jobs",
    "orders-api",
    "payments-cluster",
    "staging-cluster",
    "mixed-cluster",
  ];
  for (const extra of [[], ["--json"]]) {
    const result = await invokeCli("inventory", ...files, "--redact", ...extra);
    assert.equal(result.code, 1);
    for (const resource of resources)
      assert.ok(!result.stdout.includes(resource), `${resource} leaked${extra.length > 0 ? " in JSON" : " in text"}`);
    assert.match(result.stdout, /[0-9a-f]{12}/);
  }
});

test("the examples report an affected Azure resource and exit 1", async () => {
  for (const file of ["examples/inventory/azure-webapps.json", "examples/inventory/aks.json"]) {
    const result = await invokeCli("inventory", file, "--json");
    assert.equal(result.code, 1, file);
    const report = JSON.parse(result.stdout) as { results: Array<{ check: { status: string } }> };
    assert.ok(
      report.results.some((entry) => entry.check.status === "affected"),
      file,
    );
  }
});

test("--format azure still detects the format, and an unknown importer exits 2", async () => {
  const file = join(AZURE, "webapps.json");
  const forced = await invokeCli("inventory", file, "--format", "azure", "--json");
  assert.equal(forced.code, 1);
  assert.ok((JSON.parse(forced.stdout) as { results: unknown[] }).results.length > 0);
  const bad = await invokeCli("inventory", file, "--format", "nope");
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /Unknown importer for --format: nope/);
});
