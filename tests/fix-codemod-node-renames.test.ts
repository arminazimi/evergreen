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
import { runCli } from "./cli-runner.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix/node-renames");
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
  const root = await mkdtemp(join(tmpdir(), "evergreen-node-renames-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) await writeFile(join(root, path), contents);
  const result = await scanRepository(root, detectors, { noCache: true });
  return { root, ...(await planFixReport(result)) };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

const keptRenames = [
  ["tmpDir", "tmpdir"],
  ["_makeLong", "toNamespacedPath"],
  ["currentId", "executionAsyncId"],
  ["triggerId", "triggerAsyncId"],
  ["Hash(\"sha256\")", "createHash(\"sha256\")"],
  ["Hmac(\"sha256\", \"secret\")", "createHmac(\"sha256\", \"secret\")"],
] as const;

for (const [extension, language] of [["js", "javascript"], ["ts", "typescript"]] as const) {
  test(`rewrites every exact rename in ${extension} and the patch applies cleanly`, async () => {
    const before = await readFile(join(fixtures, `before.${extension}`), "utf8");
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    for (const [from, to] of keptRenames) {
      assert.ok(before.includes(from), `the before fixture must use ${from}`);
      assert.ok(expected.includes(to), `the after fixture must use ${to}`);
    }

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

test("refuses local bindings, optional calls, and computed member access", async () => {
  const { refusals } = await plan({
    "index.js": await readFile(join(fixtures, "refusals.js"), "utf8"),
    "index.ts": await readFile(join(fixtures, "refusals.ts"), "utf8"),
  });

  const ours = refusals.filter((refusal) => refusal.fixer === "node-renames");
  assert.equal(ours.length, 10);
  const reasons = ours.map((refusal) => refusal.reason);
  assert.equal(reasons.filter((reason) => reason.includes("local binding")).length, 4);
  assert.equal(reasons.filter((reason) => reason.includes("optional (`?.`)")).length, 4);
  assert.equal(reasons.filter((reason) => reason.includes("computed key")).length, 2);
  assert.ok(ours.every((refusal) => refusal.ruleId === "nodejs.symbol.os.tmpdir"));
});

test("fix --json reports every refusal", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-node-renames-cli-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "index.js"), await readFile(join(fixtures, "refusals.js"), "utf8"));

  const { stdout } = await runCli(["fix", root, "--json"]);
  const report = JSON.parse(stdout) as { schemaVersion: string; refusals: FixRefusal[] };
  assert.equal(report.schemaVersion, "evergreen.fix.v1");
  const ours = report.refusals.filter((refusal) => refusal.fixer === "node-renames");
  assert.ok(ours.length > 0);
  assert.ok(ours.some((refusal) => refusal.reason.includes("local binding")));
  assert.ok(ours.some((refusal) => refusal.reason.includes("optional (`?.`)")));
  assert.ok(ours.some((refusal) => refusal.reason.includes("computed key")));
});
