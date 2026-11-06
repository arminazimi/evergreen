import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { apply, assertParses, cleanup, normalized, plan, repository } from "./codemod-helpers.js";
import { runCli } from "./cli-runner.js";

const fixtures = resolve("tests/fixtures/fix/node-renames");

after(cleanup);

const keptRenames = [
  ["tmpDir", "tmpdir"],
  ["_makeLong", "toNamespacedPath"],
  ["currentId", "executionAsyncId"],
  ["triggerId", "triggerAsyncId"],
  ['Hash("sha256")', 'createHash("sha256")'],
  ['Hmac("sha256", "secret")', 'createHmac("sha256", "secret")'],
] as const;

for (const [extension, language] of [
  ["js", "javascript"],
  ["ts", "typescript"],
] as const) {
  test(`rewrites every exact rename in ${extension} and the patch applies cleanly`, async () => {
    const before = await readFile(join(fixtures, `before.${extension}`), "utf8");
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    for (const [from, to] of keptRenames) {
      assert.ok(before.includes(from), `the before fixture must use ${from}`);
      assert.ok(expected.includes(to), `the after fixture must use ${to}`);
    }

    const { root, patches } = await plan({ [`index.${extension}`]: before }, "node-renames");
    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.path, `index.${extension}`);
    const fixed = await apply(root, patches[0]!.diff, `index.${extension}`);
    assert.equal(fixed, normalized(expected));
    await assertParses(fixed, language);
  });

  test(`plans nothing for already-rewritten ${extension}`, async () => {
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    assert.deepEqual((await plan({ [`index.${extension}`]: expected }, "node-renames")).patches, []);
  });
}

test("refuses local bindings, optional calls, and computed member access", async () => {
  const { refusals } = await plan(
    {
      "index.js": await readFile(join(fixtures, "refusals.js"), "utf8"),
      "index.ts": await readFile(join(fixtures, "refusals.ts"), "utf8"),
    },
    "node-renames",
  );

  assert.equal(refusals.length, 10);
  const reasons = refusals.map((refusal) => refusal.reason);
  assert.equal(reasons.filter((reason) => reason.includes("local binding")).length, 4);
  assert.equal(reasons.filter((reason) => reason.includes("optional (`?.`)")).length, 4);
  assert.equal(reasons.filter((reason) => reason.includes("computed key")).length, 2);
  assert.ok(refusals.every((refusal) => refusal.ruleId === "nodejs.symbol.os.tmpdir"));
});

test("fix --json reports every refusal", async () => {
  const root = await repository({ "index.js": await readFile(join(fixtures, "refusals.js"), "utf8") });

  const { stdout } = await runCli(["fix", root, "--json"]);
  const report = JSON.parse(stdout) as { schemaVersion: string; refusals: { fixer: string; reason: string }[] };
  assert.equal(report.schemaVersion, "evergreen.fix.v1");
  const ours = report.refusals.filter((refusal) => refusal.fixer === "node-renames");
  assert.ok(ours.length > 0);
  assert.ok(ours.some((refusal) => refusal.reason.includes("local binding")));
  assert.ok(ours.some((refusal) => refusal.reason.includes("optional (`?.`)")));
  assert.ok(ours.some((refusal) => refusal.reason.includes("computed key")));
});

test("plan refuses a file that does not end with a newline", async () => {
  const { patches, refusals } = await plan(
    { "index.js": 'const os = require("os");\nconst tmp = os.tmpDir();' },
    "node-renames",
  );
  assert.deepEqual(patches, []);
  assert.ok(refusals.some((refusal) => refusal.reason.includes("does not end with a newline")));
});
