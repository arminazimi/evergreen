import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { fixers, renderPatches, type Fixer } from "../src/fix/index.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix-idempotency");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** Copies a fixer's fixture repository into a scratch git repository. */
async function repository(fixer: Fixer): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-fix-idempotency-"));
  temporaryRoots.push(root);
  await cp(join(fixtures, fixer.id), root, { recursive: true });
  await execute("git", ["init", "-q"], { cwd: root });
  await execute("git", ["config", "core.autocrlf", "false"], { cwd: root });
  return root;
}

for (const fixer of fixers) {
  test(`${fixer.id}: applying the planned patch leaves nothing for a second pass`, async () => {
    const registered = await stat(join(fixtures, fixer.id)).then(
      () => true,
      () => false,
    );
    if (!registered) assert.fail(`fixer "${fixer.id}" has no registered fixture under tests/fixtures/fix-idempotency`);

    const root = await repository(fixer);
    const scan = () => scanRepository(root, detectors);
    const patches = await fixer.plan(await scan());
    assert.ok(patches.length > 0, "the fixture must give the fixer something to fix");

    await writeFile(join(root, "fix.patch"), renderPatches(patches));
    await execute("git", ["apply", "--check", "fix.patch"], { cwd: root });
    await execute("git", ["apply", "fix.patch"], { cwd: root });

    assert.deepEqual(await fixer.plan(await scan()), []);
  });
}

test("every registered fixture directory belongs to a shipped fixer", async () => {
  const ids = new Set(fixers.map((fixer) => fixer.id));
  for (const entry of await readdir(fixtures)) assert.ok(ids.has(entry), `fixture "${entry}" has no fixer`);
});
