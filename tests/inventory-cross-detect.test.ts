import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { inventoryImporters, parseExport } from "../src/inventory/index.js";

const FIXTURES = resolve("tests/fixtures/inventory");

async function files(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await files(path)));
    else found.push(path);
  }
  return found.sort();
}

test("every inventory fixture is detected by exactly one importer, or by none when it is a deliberate negative", async () => {
  assert.equal(inventoryImporters.length, 10);
  const claimed = new Set<string>();
  for (const file of await files(FIXTURES)) {
    const document = parseExport(await readFile(file, "utf8"));
    const detecting = inventoryImporters
      .filter((importer) => importer.detect(document, file))
      .map((importer) => importer.id);
    assert.ok(detecting.length <= 1, `${file} is detected by more than one importer: ${detecting.join(", ")}`);
    for (const id of detecting) claimed.add(id);
  }
  for (const importer of inventoryImporters)
    assert.ok(claimed.has(importer.id), `${importer.id} detects none of the fixtures`);
});
