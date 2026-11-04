import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

import { builtInDetectors as detectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { planFixReport } from "../src/fix/index.js";
import type { FixerPatch, FixRefusal } from "../src/fix/index.js";
import { parseSource } from "../src/usage/tree-sitter.js";

const execute = promisify(execFile);
const fixtures = resolve("tests/fixtures/fix/python-utcnow");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

interface Plan {
  root: string;
  patches: FixerPatch[];
  refusals: FixRefusal[];
}

async function plan(files: Record<string, string>): Promise<Plan> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-utcnow-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const result = await scanRepository(root, detectors, { noCache: true });
  const report = await planFixReport(result);
  return {
    root,
    patches: report.patches.filter((patch) => patch.fixer === "python-utcnow"),
    refusals: report.refusals.filter((refusal) => refusal.fixer === "python-utcnow"),
  };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

async function apply(root: string, diff: string, file = "app.py"): Promise<string> {
  const patch = join(root, "fix.patch");
  await writeFile(patch, `${diff}\n`);
  await execute("git", ["apply", "--check", patch], { cwd: root });
  await execute("git", ["apply", patch], { cwd: root });
  return normalized(await readFile(join(root, file), "utf8"));
}

async function assertParses(source: string): Promise<void> {
  const tree = await parseSource("python", source);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false);
  tree.delete();
}

const rows = [
  "from-import-utcnow",
  "from-import-utcfromtimestamp",
  "module-utcnow",
  "module-utcfromtimestamp",
  "alias-utcnow",
  "alias-utcfromtimestamp",
  "timezone-imported",
];

for (const row of rows) {
  test(`${row} is rewritten exactly, parses, and is idempotent`, async () => {
    const before = await readFile(join(fixtures, row, "before.py"), "utf8");
    const expected = await readFile(join(fixtures, row, "after.py"), "utf8");
    const { root, patches, refusals } = await plan({ "app.py": before });

    assert.deepEqual(refusals, []);
    assert.equal(patches.length, 1);
    const fixed = await apply(root, patches[0]!.diff);
    assert.equal(fixed, normalized(expected));
    await assertParses(fixed);

    assert.deepEqual((await plan({ "app.py": expected })).patches, []);
  });
}

test("a rewritable call and a refused call in one file produce one patch and one refusal", async () => {
  const before = await readFile(join(fixtures, "mixed", "before.py"), "utf8");
  const expected = await readFile(join(fixtures, "mixed", "after.py"), "utf8");
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  const fixed = await apply(root, patches[0]!.diff);
  assert.equal(fixed, normalized(expected));
  await assertParses(fixed);

  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!.reason, /takes no arguments/);
  assert.equal(refusals[0]!.line, 4);
});

test("each refused shape is reported and the file is left unchanged", async () => {
  const cases = [
    { file: "star-import.py", reason: /from datetime import \*/ },
    { file: "aliased-import.py", reason: /datetime as d/ },
    { file: "timezone-conflict.py", reason: /bound to something other than `datetime\.timezone`/ },
    { file: "parenthesized-import.py", reason: /parenthesized or spans several lines/ },
    { file: "multiline-import.py", reason: /parenthesized or spans several lines/ },
    { file: "ambiguous.py", reason: /cannot tell which binding a call reads/ },
    { file: "rebinding.py", reason: /not a direct `datetime\.utcnow`/ },
    { file: "arguments.py", reason: /(takes no arguments|timestamp argument|keyword arguments|splat argument)/ },
  ];
  for (const { file, reason } of cases) {
    const { root, patches, refusals } = await plan({
      "app.py": await readFile(join(fixtures, "refusals", file), "utf8"),
    });
    assert.deepEqual(patches, [], `${file} is unchanged`);
    assert.ok(refusals.length > 0, `${file} is refused`);
    assert.ok(
      refusals.some((refusal) => reason.test(refusal.reason)),
      `${file} refusal: ${refusals[0]!.reason}`,
    );
    assert.equal(
      await readFile(join(root, "app.py"), "utf8"),
      await readFile(join(fixtures, "refusals", file), "utf8"),
    );
  }
});

test("every refused argument shape in one file is refused by name", async () => {
  const { refusals } = await plan({ "app.py": await readFile(join(fixtures, "refusals", "arguments.py"), "utf8") });

  assert.equal(refusals.length, 4);
  assert.ok(refusals.some((refusal) => refusal.reason.includes("takes no arguments")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("timestamp argument")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("keyword arguments")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("splat argument")));
});
