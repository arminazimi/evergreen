import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { redactReport, renderInventoryText } from "../src/inventory/command.js";
import { awsLambdaImporter } from "../src/inventory/aws-lambda.js";
import { parseExport, runInventory } from "../src/inventory/index.js";

const FIXTURES = resolve("tests/fixtures/inventory");
const LAMBDA = join(FIXTURES, "aws-lambda");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** RFC 6901: the value `pointer` names in `document`. */
function resolvePointer(document: unknown, pointer: string): unknown {
  if (pointer === "") return document;
  assert.ok(pointer.startsWith("/"), `not a JSON Pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split("/")
    .reduce<unknown>((value, raw) => {
      const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
      if (Array.isArray(value)) return value[Number(token)];
      if (isRecord(value)) return value[token];
      return undefined;
    }, document);
}

async function lambdaFiles(): Promise<string[]> {
  return (await readdir(LAMBDA))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(LAMBDA, name));
}

test("a single page is detected and each zip function is read as name and runtime", async () => {
  const document = parseExport(await readFile(join(LAMBDA, "deprecated.json"), "utf8"));
  assert.equal(awsLambdaImporter.detect(document, "deprecated.json"), true);
  const items = awsLambdaImporter.items(document, "deprecated.json");
  assert.deepEqual(
    items.map((item) => item.resource),
    ["orders-worker", "reports-job"],
  );
  assert.deepEqual(
    items.map((item) => item.purl),
    ["pkg:generic/aws-lambda-runtime/nodejs14.x", "pkg:generic/aws-lambda-runtime/python3.7"],
  );
  assert.deepEqual(
    items.map((item) => item.version),
    ["nodejs14.x", "python3.7"],
  );
  assert.deepEqual(
    items.map((item) => item.pointer),
    ["/Functions/0/Runtime", "/Functions/1/Runtime"],
  );
  assert.ok(items.every((item) => item.importer === "aws-lambda" && item.file === "deprecated.json"));
});

test("container-image functions have no runtime, so they are skipped; zip functions beside them are not", async () => {
  const document = parseExport(await readFile(join(LAMBDA, "image.json"), "utf8"));
  const items = awsLambdaImporter.items(document, "image.json");
  assert.deepEqual(
    items.map((item) => item.resource),
    ["zip-inventory"],
  );
});

test("a paginated export (an array of pages) keeps a pointer that resolves per page", async () => {
  const document = parseExport(await readFile(join(LAMBDA, "pages.json"), "utf8"));
  assert.equal(awsLambdaImporter.detect(document, "pages.json"), true);
  const items = awsLambdaImporter.items(document, "pages.json");
  assert.deepEqual(
    items.map((item) => item.resource),
    ["page-one-worker", "page-two-worker"],
  );
  assert.deepEqual(
    items.map((item) => item.pointer),
    ["/0/Functions/0/Runtime", "/1/Functions/0/Runtime"],
  );
  for (const item of items) assert.equal(resolvePointer(document, item.pointer), item.version);
});

test("every pointer in every fixture resolves to exactly the value used as the version", async () => {
  const files = await lambdaFiles();
  const report = await runInventory(files);
  assert.ok(report.results.length > 0);
  const byFile = new Map<string, unknown>();
  for (const file of files) byFile.set(file, parseExport(await readFile(file, "utf8")));
  for (const result of report.results) {
    assert.equal(
      resolvePointer(byFile.get(result.item.file), result.item.pointer),
      result.item.version,
      `${result.item.file}${result.item.pointer}`,
    );
  }
});

test("supported, deprecated, and scheduled runtimes each get their lifecycle check", async () => {
  const report = await runInventory(await lambdaFiles());
  const status = (resource: string) => report.results.find((result) => result.item.resource === resource)!.check;
  assert.equal(status("orders-worker").status, "affected");
  assert.equal(status("orders-worker").severity, "high");
  assert.ok(status("orders-worker").findings.some((finding) => finding.ruleId === "serverless.aws-lambda.nodejs14.x"));
  assert.equal(status("search-indexer").status, "affected");
  assert.equal(status("search-indexer").severity, "low");
  assert.ok(
    status("search-indexer").findings.some(
      (finding) => finding.ruleId === "serverless.aws-lambda.nodejs22.x" && finding.event === "scheduled-end-of-life",
    ),
  );
  assert.equal(status("billing-preview").status, "no-data");
  assert.equal(status("notifications-preview").status, "no-data");
});

test("no ARN, account id, role, environment variable, or bucket from the export reaches text or JSON output", async () => {
  const files = await lambdaFiles();
  const report = await runInventory(files);
  const json = JSON.stringify(report);
  const text = renderInventoryText(report);
  for (const secret of [
    "123456789012",
    "arn:aws",
    "lambda-orders",
    "lambda-reports",
    "ORDERS_TOKEN",
    "placeholder-token",
    "MODEL_BUCKET",
    "placeholder-bucket",
    "placeholder-marker",
    "CodeSha256",
  ]) {
    assert.ok(!json.includes(secret), `JSON output contains ${secret}`);
    assert.ok(!text.includes(secret), `text output contains ${secret}`);
  }
  assert.ok(json.includes("orders-worker"), "the function's own name is reported");
});

test("redaction replaces every resource name in the text output", async () => {
  const report = await runInventory(await lambdaFiles());
  const text = renderInventoryText(redactReport(report));
  const names = report.results.map((result) => result.item.resource);
  assert.ok(names.length > 0);
  for (const name of names) assert.ok(!text.includes(name), `redacted output still shows ${name}`);
});

test("the importer rejects exports of other shapes, including the other importers' fixtures", async () => {
  const otherShapes = [
    { format_version: "1.0", terraform_version: "1.9.0", values: { root_module: { resources: [] } } },
    { apiVersion: "v1", kind: "List", items: [{ kind: "Pod", metadata: { name: "web" } }] },
    [{ Id: "placeholder", Config: { Image: "redis:7.0" } }],
    { Functions: "not a list" },
    [{ Functions: [] }, { not_a_page: true }],
    [],
    "text export",
  ];
  for (const document of otherShapes)
    assert.equal(awsLambdaImporter.detect(document, "other.json"), false, JSON.stringify(document));

  for (const entry of await readdir(FIXTURES, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "aws-lambda") continue;
    for (const file of await readdir(join(FIXTURES, entry.name))) {
      if (!file.endsWith(".json")) continue;
      const document = parseExport(await readFile(join(FIXTURES, entry.name, file), "utf8"));
      assert.equal(awsLambdaImporter.detect(document, file), false, `${entry.name}/${file}`);
    }
  }
});
