import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { githubActionsUsesFixer } from "../src/fix/github-actions.js";

const fixtures = resolve("tests/fixtures/fix-github-actions");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repository(workflow: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-actions-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, ".github", "workflows", "ci.yml"), workflow);
  return root;
}

test("the fixer output matches the after fixture and keeps SHA pins, floating refs and comments", async () => {
  const before = await readFile(join(fixtures, "before.yml"), "utf8");
  const after = await readFile(join(fixtures, "after.yml"), "utf8");
  const root = await repository(before);
  const patches = await githubActionsUsesFixer.plan(await scanRepository(root, detectors));

  assert.equal(patches.length, 1);
  assert.equal(patches[0]!.path, ".github/workflows/ci.yml");
  // renderDiff emits one hunk spanning the first to the last change, so rebuild the new side of it and compare with the fixture.
  const hunk = patches[0]!.diff.split("\n").slice(2);
  const start = Number(/^@@ -(\d+)/.exec(hunk[0]!)![1]) - 1;
  const rebuilt = hunk.slice(1).filter((line) => !line.startsWith("-")).map((line) => line.slice(1));
  assert.deepEqual(rebuilt, after.split("\n").slice(start, start + rebuilt.length));
  assert.ok(patches[0]!.diff.includes("\n-      - uses: actions/checkout@v4\n"));
  assert.ok(rebuilt.includes("      - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v4.1.1"));
  assert.ok(rebuilt.includes("      - uses: actions/checkout@main"));
  assert.equal(await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8"), before);
});

test("the planned patch is idempotent: scanning the fixed file plans nothing", async () => {
  const root = await repository(await readFile(join(fixtures, "after.yml"), "utf8"));
  assert.deepEqual(await githubActionsUsesFixer.plan(await scanRepository(root, detectors)), []);
});

test("a workflow without a trailing newline is left alone", async () => {
  const root = await repository("jobs:\n  t:\n    steps:\n      - uses: actions/checkout@v4");
  assert.deepEqual(await githubActionsUsesFixer.plan(await scanRepository(root, detectors)), []);
});
