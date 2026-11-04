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
const fixtures = resolve("tests/fixtures/fix/python-imp");
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
  const root = await mkdtemp(join(tmpdir(), "evergreen-python-imp-"));
  temporaryRoots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  const result = await scanRepository(root, detectors, { noCache: true });
  const report = await planFixReport(result);
  return {
    root,
    patches: report.patches.filter((patch) => patch.fixer === "python-imp"),
    refusals: report.refusals.filter((refusal) => refusal.fixer === "python-imp"),
  };
}

function normalized(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

async function apply(root: string, diff: string): Promise<string> {
  const patch = join(root, "fix.patch");
  await writeFile(patch, `${diff}\n`);
  await execute("git", ["apply", "--check", patch], { cwd: root });
  await execute("git", ["apply", patch], { cwd: root });
  return normalized(await readFile(join(root, "app.py"), "utf8"));
}

async function assertParses(source: string): Promise<void> {
  const tree = await parseSource("python", source);
  assert.ok(tree);
  assert.equal(tree.rootNode.hasError, false);
  tree.delete();
}

const rows = ["reload", "new-module", "get-magic", "get-tag", "cache-from-source", "source-from-cache"];

for (const row of rows) {
  test(`${row} is rewritten exactly, drops import imp, and is idempotent`, async () => {
    const before = await readFile(join(fixtures, row, "before.py"), "utf8");
    const expected = await readFile(join(fixtures, row, "after.py"), "utf8");
    const { root, patches } = await plan({ "app.py": before });

    assert.equal(patches.length, 1);
    const fixed = await apply(root, patches[0]!.diff);
    assert.equal(fixed, normalized(expected));
    assert.doesNotMatch(fixed, /^import imp$/m);
    await assertParses(fixed);

    assert.deepEqual((await plan({ "app.py": expected })).patches, []);
  });
}

test("a file with a rewritable and a refused call keeps import imp and adds the import after it", async () => {
  const before = await readFile(join(fixtures, "mixed", "before.py"), "utf8");
  const expected = await readFile(join(fixtures, "mixed", "after.py"), "utf8");
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  const fixed = await apply(root, patches[0]!.diff);
  assert.equal(fixed, normalized(expected));
  assert.match(fixed, /^import imp\nimport importlib\n/m);
  await assertParses(fixed);

  assert.equal(refusals.length, 1);
  assert.match(refusals[0]!.reason, /imp\.find_module/);
  assert.equal(refusals[0]!.line, 4);
});

test("each removed function without an exact equivalent is refused", async () => {
  const { patches, refusals } = await plan({
    "app.py": await readFile(join(fixtures, "refusals", "functions.py"), "utf8"),
  });

  assert.deepEqual(patches, []);
  assert.equal(refusals.length, 4);
  for (const symbol of ["find_module", "load_module", "load_source", "get_suffixes"]) {
    assert.ok(
      refusals.some((refusal) => refusal.reason.includes(`imp.${symbol}`)),
      `${symbol} is refused by name`,
    );
  }
});

test("keyword arguments and positional arguments the replacement reads differently are refused", async () => {
  const { patches, refusals } = await plan({
    "app.py": await readFile(join(fixtures, "refusals", "keywords.py"), "utf8"),
  });

  assert.deepEqual(patches, []);
  assert.equal(refusals.length, 4);
  assert.ok(refusals.some((refusal) => refusal.reason.includes("keyword argument `file`")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("takes no arguments")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("second positional argument")));
  assert.ok(refusals.some((refusal) => refusal.reason.includes("imp.find_module")));
});

test("from-import, aliased-import, rebinding, and multi-name import shapes are refused", async () => {
  const cases = [
    { file: "from-import.py", reason: /from imp import/ },
    { file: "aliased-import.py", reason: /import imp as/ },
    { file: "rebinding.py", reason: /not a direct `imp\.reload` attribute/ },
    { file: "multiple-import.py", reason: /imports other modules/ },
  ];
  for (const { file, reason } of cases) {
    const { patches, refusals } = await plan({ "app.py": await readFile(join(fixtures, "refusals", file), "utf8") });
    assert.deepEqual(patches, [], `${file} is unchanged`);
    assert.ok(refusals.length > 0, `${file} is refused`);
    assert.ok(
      refusals.some((refusal) => reason.test(refusal.reason)),
      `${file} refusal: ${refusals[0]!.reason}`,
    );
  }
});

test("a keyword argument the replacement accepts is kept", async () => {
  const before = "import imp\n\nmodule = imp.reload(module=existing)\n";
  const expected = "import importlib\n\nmodule = importlib.reload(module=existing)\n";
  const { root, patches, refusals } = await plan({ "app.py": before });

  assert.deepEqual(refusals, []);
  assert.equal(patches.length, 1);
  assert.equal(await apply(root, patches[0]!.diff), expected);
  await assertParses(expected);
});

test("an import the file already has is not added twice", async () => {
  const before = "import importlib\nimport imp\n\nmodule = imp.reload(existing)\n";
  const expected = "import importlib\n\nmodule = importlib.reload(existing)\n";
  const { root, patches } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  assert.equal(await apply(root, patches[0]!.diff), expected);
});

test("every needed import is added in rule order", async () => {
  const before = "import imp\n\nmodule = imp.reload(existing)\nmagic = imp.get_magic()\n";
  const expected =
    "import importlib\nimport importlib.util\n\nmodule = importlib.reload(existing)\nmagic = importlib.util.MAGIC_NUMBER\n";
  const { root, patches } = await plan({ "app.py": before });

  assert.equal(patches.length, 1);
  assert.equal(await apply(root, patches[0]!.diff), expected);
});
