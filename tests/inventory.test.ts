import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { checkAgainst } from "../src/check-dependency.js";
import { redactReport, redactResource, renderInventoryText } from "../src/inventory/command.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryImporter, InventoryItem, InventoryReport } from "../src/inventory/types.js";

function fakeImporter(): InventoryImporter {
  return {
    id: "fake",
    registries: [],
    detect(document) {
      return typeof document === "object" && document !== null && !Array.isArray(document) && (document as { format?: unknown }).format === "fake";
    },
    items(document, file) {
      const entries = (document as { entries?: unknown }).entries;
      if (!Array.isArray(entries)) return [];
      const items: InventoryItem[] = [];
      entries.forEach((entry, index) => {
        if (typeof entry !== "object" || entry === null) return;
        const { name, version } = entry as { name?: unknown; version?: unknown };
        if (typeof name !== "string" || typeof version !== "string") return;
        items.push({ importer: "fake", file, pointer: `/entries/${index}/version`, resource: name, purl: `pkg:npm/${name}`, version });
      });
      return items;
    },
  };
}

async function temporaryFiles(files: Record<string, unknown>): Promise<{ directory: string; paths: string[] }> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-inventory-"));
  const paths: string[] = [];
  for (const [name, value] of Object.entries(files)) {
    const path = join(directory, name);
    await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
    paths.push(path);
  }
  return { directory, paths };
}

test("runInventory lets the first importer that recognizes a file list its items", async (t) => {
  const { directory, paths } = await temporaryFiles({
    "fake.json": { format: "fake", entries: [{ name: "request", version: "2.88.2" }] },
    "other.json": { format: "other" },
  });
  t.after(() => rm(directory, { recursive: true, force: true }));

  const report = await runInventory(paths, [fakeImporter()]);

  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0]!.item.importer, "fake");
  assert.equal(report.results[0]!.item.resource, "request");
  assert.equal(report.results[0]!.item.pointer, "/entries/0/version");
  assert.equal(report.results[0]!.check.status, "no-data");
  assert.deepEqual(report.unrecognized, [paths[1]]);
});

test("runInventory with --format reads only the named importer", async (t) => {
  const { directory, paths } = await temporaryFiles({
    "fake.json": { format: "fake", entries: [{ name: "request", version: "2.88.2" }] },
  });
  t.after(() => rm(directory, { recursive: true, force: true }));

  const known = await runInventory(paths, [fakeImporter()], "fake");
  assert.equal(known.results.length, 1);
  assert.deepEqual(known.unrecognized, []);

  const unknown = await runInventory(paths, [fakeImporter()], "other");
  assert.equal(unknown.results.length, 0);
  assert.deepEqual(unknown.unrecognized, paths);
});

test("runInventory sorts results by file and pointer", async (t) => {
  const { directory, paths } = await temporaryFiles({
    "b.json": { format: "fake", entries: [{ name: "second", version: "1.0.0" }, { name: "first", version: "1.0.0" }] },
    "a.json": { format: "fake", entries: [{ name: "third", version: "1.0.0" }] },
  });
  t.after(() => rm(directory, { recursive: true, force: true }));

  const report = await runInventory([paths[0]!, paths[1]!], [fakeImporter()]);

  assert.deepEqual(
    report.results.map((result) => `${result.item.file.split("/").pop()}:${result.item.pointer}`),
    ["a.json:/entries/0/version", "b.json:/entries/0/version", "b.json:/entries/1/version"],
  );
});

test("parseExport keeps a non-JSON export as text and parses JSON", () => {
  assert.deepEqual(parseExport('{"a":1}'), { a: 1 });
  assert.equal(parseExport("name=\"Ubuntu\"\nVERSION_ID=\"22.04\"\n"), "name=\"Ubuntu\"\nVERSION_ID=\"22.04\"\n");
});

test("--redact replaces a resource with the first 12 hex characters of its SHA-256", () => {
  const resource = "shop/Deployment/web";
  const expected = createHash("sha256").update(resource).digest("hex").slice(0, 12);
  assert.equal(redactResource(resource), expected);
  assert.match(redactResource(resource), /^[0-9a-f]{12}$/);
});

test("redactReport changes only resource names", () => {
  const item: InventoryItem = { importer: "fake", file: "fake.json", pointer: "/entries/0/version", resource: "shop/Deployment/web", purl: "pkg:npm/request", version: "2.88.2" };
  const report: InventoryReport = {
    schemaVersion: "evergreen.inventory.v1",
    results: [{ item, check: checkAgainst([], { purl: item.purl, ...(item.version === undefined ? {} : { version: item.version }) }) }],
    unrecognized: [],
  };
  const redacted = redactReport(report);
  assert.equal(redacted.results[0]!.item.resource, redactResource(item.resource));
  assert.equal(redacted.results[0]!.item.file, item.file);
  assert.equal(redacted.results[0]!.item.pointer, item.pointer);
  assert.equal(redacted.results[0]!.check.status, "no-data");
});

test("the text output names the no-data section and does not call no-data safe", () => {
  const item: InventoryItem = { importer: "fake", file: "fake.json", pointer: "/entries/0/version", resource: "request", purl: "pkg:npm/request", version: "2.88.2" };
  const report: InventoryReport = {
    schemaVersion: "evergreen.inventory.v1",
    results: [{ item, check: checkAgainst([], { purl: item.purl, ...(item.version === undefined ? {} : { version: item.version }) }) }],
    unrecognized: ["other.json"],
  };
  const text = renderInventoryText(report, { color: false });
  assert.match(text, /No lifecycle data \(not a statement that it is safe\)/);
  assert.match(text, /request\s+2\.88\.2\s+\/entries\/0\/version/);
  assert.match(text, /Unrecognized files\n {2}other\.json/);
  assert.doesNotMatch(text, /\u001b\[/);
});

test("a report matches schemas/inventory.v1.schema.json and rejects undeclared properties", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object);
  const validate = ajv.compile(JSON.parse(await readFile(resolve("schemas/inventory.v1.schema.json"), "utf8")) as object);
  const check = checkAgainst([], { purl: "pkg:npm/left-pad", version: "1.3.0" });
  const report: InventoryReport = {
    schemaVersion: "evergreen.inventory.v1",
    results: [{ item: { importer: "fake", file: "fake.json", pointer: "/entries/0/version", resource: "left-pad", purl: "pkg:npm/left-pad", version: "1.3.0" }, check }],
    unrecognized: ["other.json"],
  };

  assert.equal(validate(report), true, JSON.stringify(validate.errors));

  const undeclared = structuredClone(report) as InventoryReport & { extra?: string };
  undeclared.extra = "nope";
  assert.equal(validate(undeclared), false);

  const badPointer = structuredClone(report);
  badPointer.results[0]!.item.pointer = "entries/0";
  assert.equal(validate(badPointer), false);
});
