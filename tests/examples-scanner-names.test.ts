import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { scannerRecognizesFixtureName } from "../src/fixture-names.js";

// Decision 0027: a file whose name a dependency scanner recognizes is committed under a neutral name and
// restored in a temporary copy at run time. `tools/examples.ts` performs that copy for these directories.

const ROOTS = [
  "examples/demo",
  "plugins/codex/review-fixtures/demo",
  "examples/gallery",
  "examples/drift",
  "examples/codemods",
  "examples/upgrade",
];

test("no example commits a file a dependency scanner reads by name", async () => {
  const committed: string[] = [];
  for (const root of ROOTS) {
    for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
      if (entry.isFile() && scannerRecognizesFixtureName(entry.name))
        committed.push(join(entry.parentPath, entry.name));
    }
  }

  assert.deepEqual(committed.sort(), [], "store these under a neutral name; see decision 0027");
});
