import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

test(".gitattributes keeps text files on LF so Windows checkouts match the snapshots", async () => {
  const text = await readFile(resolve(".gitattributes"), "utf8");
  assert.match(text, /^\* text=auto eol=lf$/m);
});
