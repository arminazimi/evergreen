import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { buildReceipt } from "../src/receipt.js";
import { renderReceiptMarkdown } from "../src/receipt-markdown.js";

const receipts = resolve("examples/receipts");

const read = (name: string) => readFile(resolve(receipts, name), "utf8");

test("the golden receipt rebuilds byte for byte from the before and after scans", async () => {
  const before = JSON.parse(await read("before.json")) as ScanResult;
  const after = JSON.parse(await read("after.json")) as ScanResult;
  const receipt = buildReceipt(before, after);

  assert.equal(JSON.stringify(receipt, null, 2) + "\n", await read("receipt.json"));
  assert.equal(renderReceiptMarkdown(receipt), await read("receipt.md"));
});
