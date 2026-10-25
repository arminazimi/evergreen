import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { renameCodemods, renameCodemodsFixer } from "../src/fix/codemods/index.js";

const fixtures = resolve("tests/fixtures/fix-codemods");
const temporaryRoots: string[] = [];
const manifest = JSON.stringify({
  name: "app",
  dependencies: { boom: "^3.2.2", cryptiles: "^4.1.3", sntp: "^3.0.2", "koa-router": "^7.4.0", "sourcemap-codec": "^1.4.8" },
});

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(source: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-codemods-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), manifest);
  await writeFile(join(root, "index.js"), source);
  return root;
}

test("each codemod rewrites its import to the successor and the output matches the after fixture", async () => {
  const before = await readFile(join(fixtures, "before.js"), "utf8");
  const after = await readFile(join(fixtures, "after.js"), "utf8");
  const root = await repository(before);
  const patches = await renameCodemodsFixer.plan(await scanRepository(root, detectors));

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, "index.js");
  const hunk = patches[0]!.diff.split("\n").slice(2);
  const start = Number(/^@@ -(\d+)/.exec(hunk[0]!)![1]) - 1;
  const rebuilt = hunk.slice(1).filter((line) => !line.startsWith("-")).map((line) => line.slice(1));
  assert.deepEqual(rebuilt, after.split("\n").slice(start, start + rebuilt.length));
  assert.ok(rebuilt.includes('import type { Config } from "koa-router/types";'));
  assert.ok(rebuilt.includes('const notes = "boom is a word";'));
  assert.equal(await readFile(join(root, "index.js"), "utf8"), before);
});

test("the codemods cover five packages and each names the successor its rule names", async () => {
  assert.equal(renameCodemods.length, 5);
  const rules = new Map((await scanRepository(await repository('require("boom");\n'), detectors)).findings.map((finding) => [finding.ruleId, finding.replacement]));
  for (const codemod of renameCodemods) assert.equal(rules.get(codemod.ruleId), codemod.to);
});

test("the planned patch is idempotent: scanning the fixed file plans nothing", async () => {
  const root = await repository(await readFile(join(fixtures, "after.js"), "utf8"));
  assert.deepEqual(await renameCodemodsFixer.plan(await scanRepository(root, detectors)), []);
});

test("a package that is declared but never imported is left alone", async () => {
  const root = await repository("console.log('nothing to see');\n");
  assert.deepEqual(await renameCodemodsFixer.plan(await scanRepository(root, detectors)), []);
});
