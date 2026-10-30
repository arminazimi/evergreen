import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { planFixReport } from "../src/fix/index.js";
import type { FilePatch, FixRefusal } from "../src/fix/index.js";
import { grammarFor, parseSource } from "../src/usage/tree-sitter.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix/node-buffer");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Plan {
  root: string;
  patches: FilePatch[];
  refusals: FixRefusal[];
}

async function plan(files: Record<string, string>): Promise<Plan> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-node-buffer-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) await writeFile(join(root, path), contents);
  const result = await scanRepository(root, detectors, { noCache: true });
  return { root, ...(await planFixReport(result)) };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

for (const [extension, language] of [["js", "javascript"], ["ts", "typescript"]] as const) {
  test(`rewrites every literal form in ${extension} and the patch applies cleanly`, async () => {
    const before = await readFile(join(fixtures, `before.${extension}`), "utf8");
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    const { root, patches } = await plan({ [`index.${extension}`]: before });

    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.path, `index.${extension}`);
    const patch = join(root, "fix.patch");
    await writeFile(patch, `${patches[0]!.diff}\n`);
    await execute("git", ["apply", "--check", patch], { cwd: root });
    await execute("git", ["apply", patch], { cwd: root });
    assert.equal(normalized(await readFile(join(root, `index.${extension}`), "utf8")), normalized(expected));

    const tree = await parseSource(grammarFor(language, `index.${extension}`)!, expected);
    assert.ok(tree);
    assert.equal(tree.rootNode.hasError, false);
    tree.delete();
  });

  test(`plans nothing for already-rewritten ${extension}`, async () => {
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    assert.deepEqual((await plan({ [`index.${extension}`]: expected })).patches, []);
  });
}

test("refuses every shape whose argument kind is not visible in the source text", async () => {
  const { refusals } = await plan({
    "index.js": await readFile(join(fixtures, "refusals.js"), "utf8"),
    "index.ts": await readFile(join(fixtures, "refusals.ts"), "utf8"),
  });

  assert.equal(refusals.length, 9);
  assert.ok(refusals.every((refusal) => refusal.fixer === "node-buffer"));
  assert.ok(refusals.every((refusal) => refusal.path === "index.js" || refusal.path === "index.ts"));
  const reasons = refusals.map((refusal) => refusal.reason);
  assert.ok(reasons.some((reason) => reason.includes("an identifier")));
  assert.ok(reasons.some((reason) => reason.includes("a binary expression")));
  assert.ok(reasons.some((reason) => reason.includes("takes exactly one argument")));
  assert.ok(reasons.some((reason) => reason.includes("substitutions")));
  assert.ok(reasons.some((reason) => reason.includes("not a direct reference to `SlowBuffer`")));
  assert.ok(reasons.some((reason) => reason.includes("constructed with `new`")));
  assert.equal(reasons.filter((reason) => reason.includes("TypeScript type assertion")).length, 3);
});
