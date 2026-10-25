import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { isBelowRequirement, readPinnedRuntimes } from "../src/runtime-pin.js";

test("reads pinned runtimes from version files and .tool-versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-pin-"));
  await writeFile(join(root, ".nvmrc"), "v16.20.0\n");
  await writeFile(join(root, ".tool-versions"), "python 3.9.18\nnodejs 20.1.0\n");
  assert.deepEqual(await readPinnedRuntimes(root), { node: "v16.20.0", python: "3.9.18" });
});

test("ignores pins that are not versions and missing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-pin-"));
  assert.deepEqual(await readPinnedRuntimes(root), {});
  await writeFile(join(root, ".nvmrc"), "lts/*\n");
  assert.deepEqual(await readPinnedRuntimes(root), {});
});

test("compares pinned versions to a minimum", () => {
  assert.equal(isBelowRequirement("16", "18.0.0"), true);
  assert.equal(isBelowRequirement("18.2.0", "18.0.0"), false);
  assert.equal(isBelowRequirement("3.8", "3.9"), true);
  assert.equal(isBelowRequirement("lts/*", "18.0.0"), false);
});
