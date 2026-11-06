import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { apply, assertParses, cleanup, normalized, plan } from "./codemod-helpers.js";

const fixtures = resolve("tests/fixtures/fix/node-buffer");

after(cleanup);

for (const [extension, language] of [
  ["js", "javascript"],
  ["ts", "typescript"],
] as const) {
  test(`rewrites every literal form in ${extension} and the patch applies cleanly`, async () => {
    const before = await readFile(join(fixtures, `before.${extension}`), "utf8");
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    const { root, patches } = await plan({ [`index.${extension}`]: before }, "node-buffer");

    assert.equal(patches.length, 1);
    assert.equal(patches[0]!.path, `index.${extension}`);
    const fixed = await apply(root, patches[0]!.diff, `index.${extension}`);
    assert.equal(fixed, normalized(expected));
    await assertParses(fixed, language);
  });

  test(`plans nothing for already-rewritten ${extension}`, async () => {
    const expected = await readFile(join(fixtures, `after.${extension}`), "utf8");
    assert.deepEqual((await plan({ [`index.${extension}`]: expected }, "node-buffer")).patches, []);
  });
}

test("refuses every shape whose argument kind is not visible in the source text", async () => {
  const { refusals } = await plan(
    {
      "index.js": await readFile(join(fixtures, "refusals.js"), "utf8"),
      "index.ts": await readFile(join(fixtures, "refusals.ts"), "utf8"),
    },
    "node-buffer",
  );

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

test("classify accepts a number or a string with an encoding and refuses every other argument shape", async () => {
  const source = [
    "const one = new Buffer(5);",
    'const two = Buffer("hello", "utf8");',
    "const big = Buffer(10n);",
    "const numeric = Buffer(5, 0, 2);",
    'const encoding = Buffer("hello", 1);',
    "const array = Buffer([1, 2], 0);",
    "const template = Buffer(`hi ${name}`);",
    "",
  ].join("\n");
  const { patches, refusals } = await plan({ "index.js": source }, "node-buffer");

  assert.equal(patches.length, 1);
  const added = patches[0]!.diff
    .split("\n")
    .filter((line) => line.startsWith("+"))
    .map((line) => line.slice(1));
  assert.ok(added.includes("const one = Buffer.alloc(5);"));
  assert.ok(added.includes('const two = Buffer.from("hello", "utf8");'));

  const reasons = refusals.map((refusal) => refusal.reason);
  assert.ok(reasons.some((reason) => reason.includes("BigInt literal")));
  assert.ok(reasons.some((reason) => reason.includes("numeric form takes exactly one argument")));
  assert.ok(reasons.some((reason) => reason.includes("second argument is not a string literal encoding")));
  assert.ok(reasons.some((reason) => reason.includes("array form takes exactly one argument")));
  assert.ok(reasons.some((reason) => reason.includes("substitutions")));
});
